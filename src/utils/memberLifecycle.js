const {
  EmbedBuilder,
  PermissionFlagsBits,
  AuditLogEvent
} = require('discord.js');
const { getChannelReference } = require('./creatingManager');
const { getConfig, updateConfig, interpolate } = require('./welcomeConfig');
const { setMemberRole } = require('./rankRoles');
const rankConfig = require('../config/ranks.json');

const recentJoins = new Map();
const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeName(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

async function resolveConfiguredChannel(guild, config, key, names) {
  const configuredId = config.channels[key];
  if (configuredId) {
    const configured = guild.channels.cache.get(configuredId);
    if (configured?.isTextBased()) return configured;
    try {
      const fetched = await guild.channels.fetch(configuredId);
      if (fetched?.isTextBased()) return fetched;
    } catch (error) {
      console.error(`[MIEMBROS] No se pudo recuperar el canal ${configuredId} (${key}) en ${guild.id}:`, error);
    }
  }

  const references = {
    welcome: 'bienvenida',
    goodbye: 'despedida',
    staff: 'chat-staff',
    memberLog: 'registro-de-entradas-y-salidas',
    modLog: 'registro-de-moderacion',
    rules: 'reglas',
    roles: 'roles-y-niveles'
  };
  const reference = references[key];
  if (reference) {
    try {
      const saved = await getChannelReference(guild.id, reference, guild);
      if (saved?.isTextBased()) return saved;
    } catch (error) {
      console.error(`[MIEMBROS] No se pudo resolver la referencia ${reference} en ${guild.id}:`, error);
    }
  }

  const normalizedNames = names.map(normalizeName);
  const byName = guild.channels.cache.find(channel =>
    channel.isTextBased() &&
    normalizedNames.some(name => normalizeName(channel.name).includes(name))
  );
  if (byName) return byName;
  return null;
}

function isYoungAccount(user, now = Date.now()) {
  return now - user.createdTimestamp < 7 * DAY_MS;
}

function channelLink(channel, fallback) {
  return channel ? `<#${channel.id}>` : `#${fallback}`;
}

function renderDuration(milliseconds) {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (days) parts.push(`${days} ${days === 1 ? 'día' : 'días'}`);
  if (hours) parts.push(`${hours} ${hours === 1 ? 'hora' : 'horas'}`);
  if (minutes || !parts.length) parts.push(`${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`);
  return parts.join(' y ');
}

function startRaidWindow(guildId, now = Date.now()) {
  const joins = (recentJoins.get(guildId) || []).filter(timestamp => now - timestamp < 60_000);
  joins.push(now);
  recentJoins.set(guildId, joins);
  return joins.length > 10;
}

async function checkRaid(member, config, now = Date.now()) {
  if (!config.features.antiRaid || !startRaidWindow(member.guild.id, now)) {
    return { triggered: false, active: config.raidModeUntil > now };
  }
  const wasActive = config.raidModeUntil > now;
  const updated = updateConfig(member.guild.id, current => {
    current.raidModeUntil = now + 15 * 60 * 1000;
    return current;
  });
  if (!wasActive) {
    const staffChannel = await resolveConfiguredChannel(member.guild, updated, 'staff', ['chat-staff', 'staff']);
    if (staffChannel) {
      try {
        await staffChannel.send({
          content: `🚨 **Alerta anti-raid:** han entrado más de 10 cuentas en 60 segundos. Se activa la verificación reforzada durante 15 minutos; las cuentas creadas hace menos de 7 días requieren aprobación manual del staff.`,
          allowedMentions: { parse: [] }
        });
      } catch (error) {
        console.error(`[ANTI-RAID] No se pudo publicar la alerta en ${staffChannel.id}:`, error);
      }
    } else {
      console.warn(`[ANTI-RAID] No se encontró #chat-staff en ${member.guild.id}; el modo reforzado sí quedó activo.`);
    }
  }
  return { triggered: !wasActive, active: true };
}

async function logJoin(member, config, youngAccount, raidActive) {
  const logChannel = await resolveConfiguredChannel(
    member.guild,
    config,
    'memberLog',
    ['registro-de-entradas-y-salidas', 'entradas-y-salidas', 'registro-miembros']
  );
  if (!logChannel) {
    console.warn(`[BIENVENIDA] No se encontró un canal de registro de entradas/salidas en ${member.guild.id}.`);
  }
  const embed = new EmbedBuilder()
    .setColor(youngAccount ? '#F1C40F' : '#2ECC71')
    .setTitle('📥 Entrada de miembro')
    .setThumbnail(member.user.displayAvatarURL())
    .setDescription([
      `**Usuario:** ${member.user.tag || member.user.username} (<@${member.id}>)`,
      `**Cuenta creada:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
      youngAccount && config.features.markYoungAccounts
        ? '⚠️ **Cuenta con menos de 7 días de antigüedad.**'
        : config.features.markYoungAccounts ? '✅ Cuenta con 7 días o más.' : '',
      raidActive && youngAccount ? '🛡️ **Verificación reforzada:** requiere aprobación manual del staff.' : ''
    ].filter(Boolean).join('\n'))
    .setTimestamp();
  if (logChannel) {
    try {
      await logChannel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    } catch (error) {
      console.error(`[BIENVENIDA] No se pudo publicar el registro de entrada de ${member.id}:`, error);
    }
  }
  const modLogChannel = await resolveConfiguredChannel(
    member.guild,
    config,
    'modLog',
    ['registro-de-moderacion', 'registro-de-moderación']
  );
  if (modLogChannel && modLogChannel.id !== logChannel?.id) {
    try {
      await modLogChannel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    } catch (error) {
      console.error(`[BIENVENIDA] No se pudo publicar el registro de moderación de ${member.id}:`, error);
    }
  }
}

async function sendWelcome(member, config, youngAccount) {
  if (!config.features.welcome) return;
  const channel = await resolveConfiguredChannel(member.guild, config, 'welcome', ['bienvenida', 'welcome']);
  if (!channel) {
    console.warn(`[BIENVENIDA] No se encontró canal de bienvenida configurado en ${member.guild.id}.`);
    return;
  }
  const rulesChannel = await resolveConfiguredChannel(member.guild, config, 'rules', ['reglas', 'rules']);
  const rolesChannel = await resolveConfiguredChannel(
    member.guild,
    config,
    'roles',
    ['roles-y-niveles']
  );
  const values = {
    usuario: `<@${member.id}>`,
    servidor: member.guild.name,
    numero: String(member.guild.memberCount),
    reglas: channelLink(rulesChannel, 'reglas'),
    roles: channelLink(rolesChannel, 'roles-y-niveles')
  };
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(interpolate(config.welcomeTitle, values).slice(0, 256))
    .setDescription(interpolate(config.welcomeText, values).slice(0, 4096))
    .setThumbnail(member.user.displayAvatarURL())
    .addFields({ name: 'Miembro', value: `#${member.guild.memberCount}`, inline: true });
  if (youngAccount && config.features.markYoungAccounts) {
    embed.addFields({ name: 'Aviso', value: 'Cuenta creada hace menos de 7 días.', inline: true });
  }
  await channel.send({
    embeds: [embed],
    allowedMentions: { parse: [], users: [member.id] }
  });
}

async function sendWelcomeDm(member) {
  try {
    await member.send({
      content: `¡Hola ${member.user.username}! Bienvenido/a a **${member.guild.name}**.\n1. Lee las reglas del servidor.\n2. Pulsa **📜 Aceptar reglas** para obtener el rol Miembro.\n3. Usa /rango para consultar tu experiencia y /ranking para ver el top 10.`,
      allowedMentions: { parse: [] }
    });
  } catch (error) {
    if (error.code !== 50007) {
      console.error(`[BIENVENIDA] No se pudo enviar la guía por DM a ${member.id}:`, error);
    }
  }
}

async function handleMemberJoin(member) {
  if (member.user.bot) return;
  let config = getConfig(member.guild.id);
  let raid = { active: config.raidModeUntil > Date.now() };
  try {
    raid = await checkRaid(member, config);
  } catch (error) {
    console.error(`[ANTI-RAID] No se pudo actualizar el estado del servidor ${member.guild.id}:`, error);
  }
  config = getConfig(member.guild.id);
  const young = isYoungAccount(member.user);
  if (config.features.assignNew) {
    try {
      await setMemberRole(member, 'new', true, 'Rol Nuevo asignado al entrar al servidor');
    } catch (error) {
      console.error(`[BIENVENIDA] No se pudo asignar Nuevo a ${member.id}:`, error);
    }
  }
  if (member.premiumSinceTimestamp || member.premiumSince) {
    try {
      await setMemberRole(member, 'booster', true, 'Rol VIP asignado por impulsar el servidor');
    } catch (error) {
      console.error(`[RANGOS] No se pudo asignar VIP a ${member.id}:`, error);
    }
  }
  if (member.joinedTimestamp && Date.now() - member.joinedTimestamp >= rankConfig.veteranDays * DAY_MS) {
    try {
      await setMemberRole(member, 'veteran', true, `Antigüedad de ${rankConfig.veteranDays} días`);
    } catch (error) {
      console.error(`[RANGOS] No se pudo asignar Veterano a ${member.id}:`, error);
    }
  }
  try {
    await sendWelcome(member, config, young);
  } catch (error) {
    console.error(`[BIENVENIDA] No se pudo enviar el mensaje para ${member.id}:`, error);
  }
  try {
    await logJoin(member, config, young, raid.active);
  } catch (error) {
    console.error(`[BIENVENIDA] No se pudo registrar la entrada de ${member.id}:`, error);
  }
  if (raid.active && young) {
    const staffChannel = await resolveConfiguredChannel(member.guild, config, 'staff', ['chat-staff', 'staff']);
    if (staffChannel) {
      try {
        await staffChannel.send({
          content: `🛡️ La cuenta de ${member.user.tag || member.user.username} (${member.id}) tiene menos de 7 días y requiere aprobación manual durante la verificación reforzada.`,
          allowedMentions: { parse: [] }
        });
      } catch (error) {
        console.error(`[ANTI-RAID] No se pudo notificar al staff sobre ${member.id}:`, error);
      }
    }
  }
  if (config.features.dmGuide) await sendWelcomeDm(member);
}

async function detectRemovalReason(guild, member, config) {
  if (!config.features.auditLog) return 'Motivo no consultado (audit log desactivado)';
  let botMember;
  try {
    botMember = guild.members.me || await guild.members.fetchMe();
  } catch (error) {
    console.error(`[DESPEDIDA] No se pudo obtener el miembro del bot para revisar el audit log:`, error);
    return 'Motivo no verificable (no se pudo comprobar el permiso del bot)';
  }
  if (!botMember.permissions.has(PermissionFlagsBits.ViewAuditLog)) {
    return 'Motivo no verificable (falta ViewAuditLog)';
  }
  try {
    const now = Date.now();
    for (const type of [AuditLogEvent.MemberKick, AuditLogEvent.MemberBanAdd]) {
      const logs = await guild.fetchAuditLogs({ type, limit: 5 });
      const entry = logs.entries.find(item =>
        item.target?.id === member.id &&
        item.createdTimestamp >= now - 10_000
      );
      if (entry) return type === AuditLogEvent.MemberKick ? 'Expulsión (kick)' : 'Expulsión (ban)';
    }
  } catch (error) {
    console.error(`[DESPEDIDA] No se pudo consultar el audit log de ${member.id}:`, error);
    return 'Motivo no verificable (falló la consulta del audit log)';
  }
  return 'Salida voluntaria';
}

async function handleMemberLeave(member) {
  if (member.user.bot) return;
  const config = getConfig(member.guild.id);
  const joinedAt = member.joinedTimestamp || member.joinedAt?.getTime();
  const duration = joinedAt ? renderDuration(Date.now() - joinedAt) : 'tiempo desconocido';
  const reason = await detectRemovalReason(member.guild, member, config);
  const roles = member.roles.cache
    .filter(role => role.id !== member.guild.id)
    .map(role => `@${role.name}`);
  const values = {
    usuario: member.user.tag || member.user.username,
    servidor: member.guild.name,
    numero: String(member.guild.memberCount),
    tiempo: duration
  };
  if (config.features.goodbye) {
    const channel = await resolveConfiguredChannel(member.guild, config, 'goodbye', ['despedidas', 'despedida', 'goodbye']);
    if (channel) {
      try {
        const embed = new EmbedBuilder()
          .setColor('#95A5A6')
          .setTitle('👋 Hasta pronto')
          .setDescription(interpolate(config.goodbyeText, values).slice(0, 4096))
          .setThumbnail(member.user.displayAvatarURL())
          .setFooter({ text: `Estuvo en el servidor: ${duration}` })
          .setTimestamp();
        await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
      } catch (error) {
        console.error(`[DESPEDIDA] No se pudo enviar el mensaje para ${member.id}:`, error);
      }
    } else {
      console.warn(`[DESPEDIDA] No se encontró un canal configurado de despedida en ${member.guild.id}.`);
    }
  }
  if (config.features.departureLog) {
    const logChannel = await resolveConfiguredChannel(
      member.guild,
      config,
      'memberLog',
      ['registro-de-entradas-y-salidas', 'entradas-y-salidas', 'registro-miembros']
    );
    if (logChannel) {
      const embed = new EmbedBuilder()
        .setColor('#E74C3C')
        .setTitle('📤 Salida de miembro')
        .setThumbnail(member.user.displayAvatarURL())
        .setDescription([
          `**Usuario:** ${member.user.tag || member.user.username} (\`${member.id}\`)`,
          `**Motivo:** ${reason}`,
          `**Tiempo en el servidor:** ${duration}`,
          `**Roles:** ${(roles.length ? roles.join(', ') : 'Ninguno').slice(0, 1500)}`
        ].join('\n'))
        .setTimestamp();
      try {
        await logChannel.send({ embeds: [embed], allowedMentions: { parse: [] } });
      } catch (error) {
        console.error(`[DESPEDIDA] No se pudo publicar el registro de salida de ${member.id}:`, error);
      }
      const modLogChannel = await resolveConfiguredChannel(
        member.guild,
        config,
        'modLog',
        ['registro-de-moderacion', 'registro-de-moderación']
      );
      if (modLogChannel && modLogChannel.id !== logChannel.id) {
        try {
          await modLogChannel.send({ embeds: [embed], allowedMentions: { parse: [] } });
        } catch (error) {
          console.error(`[DESPEDIDA] No se pudo publicar el registro de moderación de ${member.id}:`, error);
        }
      }
    } else {
      console.warn(`[DESPEDIDA] No se encontró un canal de registro de entradas/salidas en ${member.guild.id}.`);
    }
  }
}

module.exports = {
  handleMemberJoin,
  handleMemberLeave,
  isYoungAccount,
  renderDuration,
  startRaidWindow,
  getConfig,
  resolveConfiguredChannel
};
