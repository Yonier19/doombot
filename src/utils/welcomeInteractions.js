const {
  ActionRowBuilder,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits
} = require('discord.js');
const {
  buildPanel,
  getConfig,
  updateConfig,
  interpolate
} = require('./welcomeConfig');
const { isYoungAccount } = require('./memberLifecycle');
const { trackChannelReference, clearChannelReference } = require('./creatingManager');

const featureKeys = new Set([
  'welcome',
  'assignNew',
  'dmGuide',
  'antiRaid',
  'markYoungAccounts',
  'goodbye',
  'departureLog',
  'auditLog'
]);
const channelKeys = ['welcome', 'goodbye', 'staff', 'memberLog', 'modLog'];
const channelReferences = {
  welcome: 'bienvenida',
  goodbye: 'despedida',
  staff: 'chat-staff',
  memberLog: 'registro-de-entradas-y-salidas',
  modLog: 'registro-de-moderacion'
};

function isAdministrator(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
}

function makeInput(customId, label, value, style = TextInputStyle.Short, maxLength = 100) {
  return new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId(customId)
      .setLabel(label)
      .setStyle(style)
      .setValue(value || '')
      .setMaxLength(maxLength)
      .setRequired(false)
  );
}

function parseChannelId(value) {
  const input = value.trim();
  if (!input) return null;
  const mention = input.match(/^<#(\d+)>$/);
  if (mention) return mention[1];
  if (/^\d{15,22}$/.test(input)) return input;
  return undefined;
}

function getPreviewEmbed(interaction, config) {
  const member = interaction.member;
  const values = {
    usuario: `<@${interaction.user.id}>`,
    servidor: interaction.guild.name,
    numero: String(interaction.guild.memberCount),
    reglas: '#reglas',
    roles: '#roles-y-niveles',
    tiempo: '2 días y 3 horas'
  };
  return new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(interpolate(config.welcomeTitle, values).slice(0, 256))
    .setDescription(interpolate(config.welcomeText, values).slice(0, 4096))
    .setThumbnail(interaction.user.displayAvatarURL())
    .addFields({ name: 'Miembro', value: `#${interaction.guild.memberCount}`, inline: true })
    .setFooter({ text: `Vista previa solicitada por ${member?.displayName || interaction.user.username}` });
}

async function handleWelcomeInteraction(interaction) {
  if (!isAdministrator(interaction)) {
    return interaction.reply({
      content: 'Necesitas permisos de administrador para utilizar este panel.',
      ephemeral: true
    });
  }
  try {
    const [, action, key] = interaction.customId.split(':');
    if (interaction.isButton() && action === 'toggle' && featureKeys.has(key)) {
      const config = updateConfig(interaction.guildId, current => {
        current.features[key] = !current.features[key];
        if (key === 'antiRaid' && !current.features.antiRaid) current.raidModeUntil = 0;
        return current;
      });
      return interaction.update(buildPanel(config, interaction.guild));
    }

    if (interaction.isButton() && action === 'channels') {
      const config = getConfig(interaction.guildId);
      const modal = new ModalBuilder()
        .setCustomId('wcfg:channels')
        .setTitle('Configurar canales del servidor')
        .addComponents(
          makeInput('welcome', 'Bienvenida (ID/#canal; vacío=auto)', config.channels.welcome),
          makeInput('goodbye', 'Despedida (ID/#canal; vacío=auto)', config.channels.goodbye),
          makeInput('staff', 'Chat staff (ID/#canal; vacío=auto)', config.channels.staff),
          makeInput('memberLog', 'Registro (ID/#canal; vacío=auto)', config.channels.memberLog),
          makeInput('modLog', 'Moderación (ID/#canal; vacío=auto)', config.channels.modLog)
        );
      return interaction.showModal(modal);
    }

    if (interaction.isButton() && action === 'edit') {
      const config = getConfig(interaction.guildId);
      const modal = new ModalBuilder()
        .setCustomId('wcfg:edit')
        .setTitle('Editar mensajes de bienvenida')
        .addComponents(
          makeInput('welcomeTitle', 'Título de bienvenida', config.welcomeTitle, TextInputStyle.Short, 100),
          makeInput('welcomeText', 'Texto: {usuario}, {servidor}, {numero}', config.welcomeText, TextInputStyle.Paragraph, 1000),
          makeInput('goodbyeText', 'Despedida: {usuario}, {servidor}, {tiempo}', config.goodbyeText, TextInputStyle.Paragraph, 1000)
        );
      return interaction.showModal(modal);
    }

    if (interaction.isButton() && action === 'preview') {
      return interaction.reply({
        embeds: [getPreviewEmbed(interaction, getConfig(interaction.guildId))],
        ephemeral: true,
        allowedMentions: { parse: [] }
      });
    }

    if (interaction.isModalSubmit() && action === 'edit') {
      const config = updateConfig(interaction.guildId, current => {
        const title = interaction.fields.getTextInputValue('welcomeTitle').trim();
        const welcomeText = interaction.fields.getTextInputValue('welcomeText').trim();
        const goodbyeText = interaction.fields.getTextInputValue('goodbyeText').trim();
        if (title) current.welcomeTitle = title;
        if (welcomeText) current.welcomeText = welcomeText;
        if (goodbyeText) current.goodbyeText = goodbyeText;
        return current;
      });
      return interaction.update(buildPanel(config, interaction.guild));
    }

    if (interaction.isModalSubmit() && action === 'channels') {
      const values = Object.fromEntries(channelKeys.map(channelKey => [
        channelKey,
        parseChannelId(interaction.fields.getTextInputValue(channelKey))
      ]));
      for (const [channelKey, channelId] of Object.entries(values)) {
        if (channelId === undefined) {
          return interaction.reply({
            content: `El campo del canal **${channelKey}** debe contener una mención válida (#canal), un ID válido o quedar vacío.`,
            ephemeral: true
          });
        }
        if (channelId) {
          const channel = interaction.guild.channels.cache.get(channelId);
          if (!channel?.isTextBased()) {
            return interaction.reply({
              content: `No encontré un canal de texto accesible para el campo **${channelKey}**. Comprueba el ID e inténtalo de nuevo.`,
              ephemeral: true
            });
          }
        }
      }
      const config = updateConfig(interaction.guildId, current => {
        for (const [channelKey, channelId] of Object.entries(values)) {
          current.channels[channelKey] = channelId;
        }
        return current;
      });
      for (const [channelKey, channelId] of Object.entries(values)) {
        const referenceKey = channelReferences[channelKey];
        if (channelId) trackChannelReference(interaction.guildId, referenceKey, channelId);
        else clearChannelReference(interaction.guildId, referenceKey);
      }
      return interaction.update(buildPanel(config, interaction.guild));
    }
    return interaction.reply({
      content: 'Esta opción del panel ya no está disponible. Ejecuta `/config-bienvenida` para publicar un panel actualizado.',
      ephemeral: true
    });
  } catch (error) {
    console.error(`[BIENVENIDA] Error procesando el panel en ${interaction.guildId}:`, error);
    const response = {
      content: '❌ No se pudo guardar el cambio del panel. Revisa el registro del bot e inténtalo de nuevo.',
      ephemeral: true
    };
    if (interaction.replied || interaction.deferred) return interaction.followUp(response);
    return interaction.reply(response);
  }
}

function requiresManualApproval(member, config) {
  return config.raidModeUntil > Date.now() && isYoungAccount(member.user);
}

module.exports = { handleWelcomeInteraction, requiresManualApproval };
