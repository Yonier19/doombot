const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType
} = require('discord.js');
const rankConfig = require('../../config/ranks.json');
const rankStore = require('../../utils/rankStore');
const { hasForbiddenPermissions, normalizeName } = require('../../utils/rankRoles');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('configurar-rangos')
    .setDescription('Crea y ordena de forma segura los roles del sistema de rangos.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: 'Necesitas permisos de administrador para configurar los roles de rango.',
        ephemeral: true
      });
    }
    const guild = interaction.guild;
    const botMember = guild.members.me || await guild.members.fetchMe();
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({
        content: 'El bot necesita Gestionar roles (ManageRoles). Concede ese permiso y vuelve a intentarlo.',
        ephemeral: true
      });
    }
    if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({
        content: 'El bot necesita Gestionar canales (ManageChannels) para aplicar las restricciones de escritura y voz del rol Silenciado.',
        ephemeral: true
      });
    }
    if (guild.roles.cache.size + rankConfig.rolesTopToBottom.filter(definition =>
      !guild.roles.cache.some(role => normalizeName(role.name) === normalizeName(definition.name))
    ).length > 250) {
      return interaction.reply({
        content: 'No hay espacio suficiente: Discord limita el servidor a 250 roles. No se realizaron cambios.',
        ephemeral: true
      });
    }

    const existingRoles = new Map();
    for (const definition of rankConfig.rolesTopToBottom) {
      const role = guild.roles.cache.find(item => normalizeName(item.name) === normalizeName(definition.name));
      if (role?.managed) {
        return interaction.reply({
          content: `El rol @${role.name} está administrado por una integración y no puede usarse como rol de rango. No se realizaron cambios.`,
          ephemeral: true
        });
      }
      if (role && botMember.roles.highest.position <= role.position) {
        return interaction.reply({
          content: `El rol del bot debe estar por encima de @${role.name}. Mueve el rol del bot hacia arriba antes de configurar los rangos. No se realizaron cambios.`,
          ephemeral: true
        });
      }
      if (role && (definition.automatic || definition.selfAssignable) && hasForbiddenPermissions(role)) {
        return interaction.reply({
          content: `El rol automático existente @${role.name} tiene permisos de administración, gestión o expulsión. Retira esos permisos antes de continuar. No se realizaron cambios.`,
          ephemeral: true
        });
      }
      if (role) existingRoles.set(definition.key, role);
    }

    await interaction.deferReply({ ephemeral: true });
    const roleMap = new Map(existingRoles);
    const created = [];
    const skipped = [];
    try {
      for (const definition of [...rankConfig.rolesTopToBottom].reverse()) {
        let role = roleMap.get(definition.key);
        if (role) {
          skipped.push(role.name);
          rankStore.setRankRole(guild.id, definition.key, role.id);
          continue;
        }
        const permissions = definition.permissions
          .map(name => PermissionFlagsBits[name])
          .filter(permission => permission !== undefined);
        role = await guild.roles.create({
          name: definition.name,
          color: definition.color,
          hoist: definition.hoist !== false,
          permissions,
          reason: 'Configuración segura del sistema de rangos'
        });
        if ((definition.automatic || definition.selfAssignable) && hasForbiddenPermissions(role)) {
          throw new Error(`Discord devolvió permisos privilegiados para el rol automático o autoasignable ${role.name}.`);
        }
        roleMap.set(definition.key, role);
        rankStore.setRankRole(guild.id, definition.key, role.id);
        created.push(role.name);
        await sleep(350);
      }

      const refreshedBot = await guild.members.fetchMe();
      const topPosition = refreshedBot.roles.highest.position;
      const orderedRoles = rankConfig.rolesTopToBottom.map(definition => roleMap.get(definition.key));
      if (topPosition <= orderedRoles.length) {
        throw new Error('No se pueden colocar todos los roles debajo del rol del bot. Sube el rol del bot y vuelve a intentarlo.');
      }
      await guild.roles.setPositions(orderedRoles.map((role, index) => ({
        role: role.id,
        position: topPosition - index - 1
      })));
      const mutedRole = roleMap.get('muted');
      const newRole = roleMap.get('new');
      const channelErrors = [];
      let mutedChannelsConfigured = 0;
      let newChannelsConfigured = 0;
      for (const channel of guild.channels.cache.values()) {
        if (channel.type === ChannelType.GuildCategory) continue;
        const existingOverwrite = channel.permissionOverwrites.cache.get(mutedRole.id);
        const mutedPermissions = [
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.SendMessagesInThreads,
          PermissionFlagsBits.AddReactions,
          PermissionFlagsBits.Speak
        ];
        if (existingOverwrite && mutedPermissions.every(permission => existingOverwrite.deny.has(permission))) {
          mutedChannelsConfigured++;
        } else {
          try {
            await channel.permissionOverwrites.edit(mutedRole, {
              SendMessages: false,
              SendMessagesInThreads: false,
              AddReactions: false,
              Speak: false
            }, { reason: 'Aplicar restricciones del rol Silenciado' });
            mutedChannelsConfigured++;
          } catch (error) {
            channelErrors.push(`${channel.name} (Silenciado): ${error.message}`);
          }
        }

        const isOnboardingChannel = channel.type === ChannelType.GuildText &&
          ['bienvenida', 'reglas'].some(name => normalizeName(channel.name).includes(name));
        const newOverwrite = channel.permissionOverwrites.cache.get(newRole.id);
        const newRestrictionsAreSet = isOnboardingChannel
          ? newOverwrite?.allow.has(PermissionFlagsBits.ViewChannel) &&
            newOverwrite.allow.has(PermissionFlagsBits.ReadMessageHistory) &&
            newOverwrite.deny.has(PermissionFlagsBits.SendMessages)
          : newOverwrite?.deny.has(PermissionFlagsBits.ViewChannel);
        if (newRestrictionsAreSet) {
          newChannelsConfigured++;
        } else {
          try {
            await channel.permissionOverwrites.edit(newRole, isOnboardingChannel
              ? {
                ViewChannel: true,
                ReadMessageHistory: true,
                SendMessages: false,
                SendMessagesInThreads: false
              }
              : { ViewChannel: false }, {
              reason: 'Restringir los canales visibles al rol Nuevo'
            });
            newChannelsConfigured++;
          } catch (error) {
            channelErrors.push(`${channel.name} (Nuevo): ${error.message}`);
          }
        }
      }
      return interaction.editReply({
        content: `✅ Sistema de rangos configurado y ordenado.\n**Creados:** ${created.length ? created.join(', ') : 'ninguno'}\n**Ya existentes y reutilizados:** ${skipped.length ? skipped.join(', ') : 'ninguno'}\n**Canales restringidos para Silenciado:** ${mutedChannelsConfigured}\n**Canales visibles para Nuevo solo en bienvenida/reglas:** ${newChannelsConfigured}` +
          (channelErrors.length ? `\n**Errores de permisos:** ${channelErrors.slice(0, 5).join(' | ')}` : '') +
          '\n\nOwner, Admin, Moderador, Staff de apoyo y Silenciado son manuales. Las asignaciones automáticas solo usan roles sin permisos privilegiados.'
      });
    } catch (error) {
      console.error(`[RANGOS] Falló la configuración de roles en ${guild.id}:`, error);
      return interaction.editReply({
        content: `❌ No se pudo completar la configuración: ${error.message}\nRoles creados antes del error: ${created.join(', ') || 'ninguno'}. Vuelve a ejecutar el comando para continuar de forma segura.`
      });
    }
  }
};
