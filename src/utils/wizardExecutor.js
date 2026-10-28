const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder
} = require('discord.js');
const { randomUUID } = require('crypto');
const templates = require('../config/templates.json');
const { deleteWizardState } = require('./wizardState');
const { checkTemplateCapacity } = require('./templateCapacity');
const {
  trackCreatedEntity,
  trackChannelReference,
  logCreationAudit
} = require('./creatingManager');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const creationDelayMs = 400;
const progressUpdateDelayMs = 1100;
const optionalModules = {
  musica: [
    { key: 'modulo-musica-comandos', nombre: '🎵・comandos-musica', tipo: 'texto', tema: 'Comandos de musica adicionales del asistente.', slowmode: 2, botCommands: true },
    { key: 'modulo-musica-voz', nombre: '🎧・Sala de Música', tipo: 'voz', tema: 'Sala de voz musical adicional.' }
  ],
  sorteos: [
    { key: 'modulo-sorteos', nombre: '🎉・sorteos-y-eventos', tipo: 'texto', tema: 'Sorteos y eventos adicionales de la comunidad.', slowmode: 5 }
  ],
  tickets: [
    { key: 'modulo-tickets', nombre: '🎫・abrir-ticket', tipo: 'texto', tema: 'Canal adicional para abrir solicitudes de soporte.', slowmode: 5 }
  ],
  memes: [
    { key: 'modulo-memes', nombre: '🤣・memes-comunidad', tipo: 'texto', tema: 'Canal adicional de memes de la comunidad.', slowmode: 5 }
  ],
  voz_temporal: [
    { key: 'modulo-voz-temporal', nombre: '➕・Crear Sala Temporal', tipo: 'voz', tema: 'Canal de entrada para crear salas de voz temporales.' }
  ]
};

function textChannel(channel) {
  return channel.tipo !== 'voz';
}

function findExistingRole(guild, name) {
  const normalized = name.toLocaleLowerCase();
  return guild.roles.cache.find(role => role.name.toLocaleLowerCase() === normalized);
}

function findExistingChannel(guild, definition) {
  const expectedType = definition.tipo === 'voz' ? ChannelType.GuildVoice : ChannelType.GuildText;
  const normalized = definition.nombre.toLocaleLowerCase();
  return guild.channels.cache.find(channel =>
    channel.type === expectedType && channel.name.toLocaleLowerCase() === normalized
  );
}

function explainError(error) {
  if (error.message?.startsWith('No se pudo guardar')) return error.message;
  const code = error.code ?? error.rawError?.code;
  const knownMessages = {
    50013: 'Discord denegó el permiso para crear el elemento; comprueba los permisos del bot y la jerarquía.',
    30005: 'Se alcanzó el límite máximo de roles del servidor.',
    30013: 'Se alcanzó el límite máximo de canales del servidor.',
    50035: 'Discord rechazó los datos del elemento; revisa su nombre y configuración.'
  };
  return knownMessages[code] ||
    `Discord no pudo completar la acción${code ? ` (código ${code})` : ''}. Revisa los permisos, la jerarquía y los límites del servidor.`;
}

function channelOverwrites(guild, roleMap, {
  staffOnly,
  readOnly,
  botCommands,
  mutedRole,
  onboardingVisible
}) {
  const overwrites = [];
  const memberRole = roleMap.get('miembro');
  const staffRoles = ['admin', 'moderador']
    .map(key => roleMap.get(key))
    .filter(Boolean);
  const viewPermissions = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.ReadMessageHistory
  ];

  if (staffOnly) {
    overwrites.push({
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel]
    });
  } else if (onboardingVisible) {
    overwrites.push({
      id: guild.roles.everyone.id,
      allow: viewPermissions,
      deny: [PermissionFlagsBits.SendMessages]
    });
  } else {
    overwrites.push({
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel]
    });
  }

  if (memberRole && !staffOnly) {
    const allow = [...viewPermissions];
    const deny = [];
    if (readOnly) deny.push(PermissionFlagsBits.SendMessages);
    if (botCommands) allow.push(PermissionFlagsBits.UseApplicationCommands);
    overwrites.push({
      id: memberRole.id,
      allow,
      deny
    });
  }
  if (mutedRole) {
    overwrites.push({
      id: mutedRole.id,
      deny: [
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.SendMessagesInThreads,
        PermissionFlagsBits.AddReactions,
        PermissionFlagsBits.Speak
      ]
    });
  }
  for (const role of staffRoles) {
    overwrites.push({
      id: role.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    });
  }
  return overwrites;
}

async function registerEntity(guild, kind, entity, referenceKey, batchId, created, label) {
  try {
    await trackCreatedEntity(guild.id, kind, entity, referenceKey, batchId);
    created.push(label);
    return true;
  } catch (error) {
    console.error(`[WIZARD] No se pudo guardar ${label} en el registro:`, error);
    throw error;
  }
}

async function executeWizardCreation(interaction, state) {
  const guild = interaction.guild;
  const tpl = templates[state.template] || templates.comunidad;
  const prefix = state.custom.categoryPrefix ? `${state.custom.categoryPrefix} ` : '';
  const emoji = state.custom.decorativeEmoji ? ` ${state.custom.decorativeEmoji}` : '';
  const categoryName = category => `${prefix}${category.nombre}${emoji}`.trim();
  const selectedTemplate = {
    ...tpl,
    roles: tpl.roles.filter(role => state.roles?.[role.key] !== false),
    categorias: [...tpl.categorias]
  };
  const selectedModuleChannels = (state.modules || [])
    .flatMap(module => optionalModules[module] || []);
  if (selectedModuleChannels.length) {
    selectedTemplate.categorias.push({
      key: 'modulos-extra',
      nombre: '✨・MÓDULOS EXTRA',
      canales: selectedModuleChannels
    });
  }
  const capacity = checkTemplateCapacity(guild, selectedTemplate, { categoryName });

  if (capacity.issues.length) {
    deleteWizardState(guild.id, interaction.user.id);
    await interaction.editReply({
      content: `❌ No se puede crear esta plantilla porque excede los límites del servidor:\n${capacity.issues.map(issue => `• ${issue}`).join('\n')}`,
      embeds: [],
      components: []
    });
    return;
  }

  const created = { roles: [], categories: [], channels: [] };
  const batchId = randomUUID().replace(/-/g, '');
  const skipped = { roles: [], categories: [], channels: [] };
  const errors = [];
  const roleMap = new Map();
  const categoryMap = new Map();
  const totalSteps = tpl.roles.length + selectedTemplate.categorias.length +
    selectedTemplate.categorias.reduce((count, category) => count + category.canales.length, 0);
  let completedSteps = 0;
  let lastProgressAt = Date.now();

  async function updateProgress(label) {
    completedSteps++;
    const percent = Math.min(100, Math.round(completedSteps / totalSteps * 100));
    const filled = Math.round(percent / 100 * 6);
    const content = `⏳ ${label}\n${'▰'.repeat(filled)}${'▱'.repeat(6 - filled)} ${percent}%`;
    const wait = Math.max(0, progressUpdateDelayMs - (Date.now() - lastProgressAt));
    if (wait) await sleep(wait);
    lastProgressAt = Date.now();
    await interaction.editReply({ content, embeds: [], components: [] });
  }

  async function createRole(definition) {
    const existing = findExistingRole(guild, definition.nombre);
    if (existing) {
      skipped.roles.push(existing.name);
      roleMap.set(definition.key, existing);
    } else if (
      state.roles?.[definition.key] !== false ||
      ['miembro', 'nuevo'].includes(definition.key)
    ) {
      const permissions = definition.permisos
        .map(permission => PermissionFlagsBits[permission])
        .filter(permission => permission !== undefined);
      const role = await guild.roles.create({
        name: definition.nombre,
        color: definition.color,
        hoist: definition.hoist,
        permissions,
        reason: 'Asistente: creación de estructura profesional'
      });
      await registerEntity(guild, 'roles', role, undefined, batchId, created.roles, role.name);
      roleMap.set(definition.key, role);
      await sleep(creationDelayMs);
    }
  }

  async function createCategory(definition) {
    const name = categoryName(definition);
    let category = guild.channels.cache.find(channel =>
      channel.type === ChannelType.GuildCategory &&
      channel.name.toLocaleLowerCase() === name.toLocaleLowerCase()
    );
    if (category) {
      skipped.categories.push(category.name);
    } else {
      const permissionOverwrites = definition.privado
        ? channelOverwrites(guild, roleMap, {
          staffOnly: true,
          mutedRole: roleMap.get('silenciado')
        })
        : [];
      category = await guild.channels.create({
        name,
        type: ChannelType.GuildCategory,
        permissionOverwrites,
        reason: `Asistente: categoría ${name}`
      });
      await registerEntity(guild, 'categories', category, undefined, batchId, created.categories, category.name);
      await sleep(creationDelayMs);
    }
    categoryMap.set(definition.key || definition.nombre, category);
  }

  async function createChannel(categoryDefinition, definition) {
    const existing = findExistingChannel(guild, definition);
    if (existing) {
      skipped.channels.push(existing.name);
      for (const reference of [definition.key, ...(definition.referencias || [])]) {
        if (reference) trackChannelReference(guild.id, reference, existing.id);
      }
      return;
    }

    const parent = categoryMap.get(categoryDefinition.key || categoryDefinition.nombre);
    if (!parent) {
      errors.push(`Canal ${definition.nombre}: no se creó ni encontró su categoría.`);
      return;
    }
    const staffOnly = Boolean(categoryDefinition.privado || definition.privado);
    const channel = await guild.channels.create({
      name: definition.nombre,
      type: definition.tipo === 'voz' ? ChannelType.GuildVoice : ChannelType.GuildText,
      parent: parent.id,
      topic: textChannel(definition) ? definition.tema : undefined,
      rateLimitPerUser: textChannel(definition) ? definition.slowmode ?? 0 : undefined,
      permissionOverwrites: channelOverwrites(guild, roleMap, {
        staffOnly,
        readOnly: Boolean(definition.soloLectura),
        botCommands: Boolean(definition.botCommands),
        mutedRole: roleMap.get('silenciado'),
        onboardingVisible: Boolean(definition.onboardingVisible)
      }),
      reason: `Asistente: canal ${definition.nombre}`
    });
    await registerEntity(
      guild,
      'channels',
      channel,
      [definition.key, ...(definition.referencias || [])],
      batchId,
      created.channels,
      channel.name
    );
    await sleep(creationDelayMs);
  }

  try {
    if (state.custom.serverName?.trim() && guild.name !== state.custom.serverName.trim()) {
      try {
        await guild.setName(state.custom.serverName.trim(), 'Personalización por Asistente Guiado');
      } catch (error) {
        errors.push(`Nombre del servidor: no se pudo cambiar. ${explainError(error)}`);
      }
    }

    for (const definition of tpl.roles) {
      try {
        await createRole(definition);
      } catch (error) {
        errors.push(`Rol ${definition.nombre}: ${explainError(error)}`);
      }
      await updateProgress(`Procesando rol ${definition.nombre}`);
    }

    for (const definition of selectedTemplate.categorias) {
      try {
        await createCategory(definition);
      } catch (error) {
        errors.push(`Categoría ${categoryName(definition)}: ${explainError(error)}`);
      }
      await updateProgress(`Procesando categoría ${categoryName(definition)}`);
    }

    for (const categoryDefinition of selectedTemplate.categorias) {
      for (const definition of categoryDefinition.canales) {
        try {
          await createChannel(categoryDefinition, definition);
        } catch (error) {
          errors.push(`Canal ${definition.nombre}: ${explainError(error)}`);
        }
        await updateProgress(`Procesando canal ${definition.nombre}`);
      }
    }

    const format = values => values.length
      ? values.map(value => `• ${value}`).join('\n').slice(0, 1024)
      : 'Ninguno';
    const report = new EmbedBuilder()
      .setColor(errors.length ? '#FEE75C' : '#57F287')
      .setTitle(`Plantilla ${tpl.nombre} configurada`)
      .setDescription(capacity.warnings.join('\n') || 'La configuración se completó.')
      .addFields(
        { name: `✅ Creado (${created.roles.length + created.categories.length + created.channels.length})`, value: format([...created.roles.map(item => `Rol ${item}`), ...created.categories.map(item => `Categoría ${item}`), ...created.channels.map(item => `Canal ${item}`)]) },
        { name: `⏭️ Omitido (${skipped.roles.length + skipped.categories.length + skipped.channels.length})`, value: format([...skipped.roles.map(item => `Rol ${item}`), ...skipped.categories.map(item => `Categoría ${item}`), ...skipped.channels.map(item => `Canal ${item}`)]) },
        { name: `❌ Errores (${errors.length})`, value: format(errors) }
      )
      .setTimestamp();

    const components = created.roles.length + created.categories.length + created.channels.length
      ? [new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`creating:undo:${interaction.user.id}:${batchId}`)
          .setLabel('🧹 Deshacer lo creado')
          .setStyle(ButtonStyle.Danger)
      )]
      : [];
    await logCreationAudit(
      guild,
      interaction.user.id,
      tpl.nombre,
      [...created.roles.map(item => `Rol ${item}`), ...created.categories.map(item => `Categoría ${item}`), ...created.channels.map(item => `Canal ${item}`)],
      [...skipped.roles.map(item => `Rol ${item}`), ...skipped.categories.map(item => `Categoría ${item}`), ...skipped.channels.map(item => `Canal ${item}`)],
      errors
    );
    await interaction.editReply({ content: null, embeds: [report], components });
  } finally {
    deleteWizardState(guild.id, interaction.user.id);
  }
}

module.exports = { executeWizardCreation };
