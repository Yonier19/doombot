const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType
} = require('discord.js');
const { buildPanel, getConfig } = require('../../utils/welcomeConfig');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config-bienvenida')
    .setDescription('Publica el panel para configurar bienvenidas, despedidas y anti-raid.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addChannelOption(option => option
      .setName('canal')
      .setDescription('Canal privado donde publicar el panel persistente')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(false)),

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: 'Necesitas permisos de administrador para configurar bienvenidas y despedidas.',
        ephemeral: true
      });
    }
    try {
      const targetChannel = interaction.options.getChannel('canal') || interaction.channel;
      const panel = await targetChannel.send(buildPanel(getConfig(interaction.guildId), interaction.guild));
      await interaction.reply({
        content: `✅ Panel persistente de bienvenida publicado en <#${panel.channelId}>. Solo administradores pueden cambiar sus opciones.`,
        ephemeral: true
      });
    } catch (error) {
      console.error(`[BIENVENIDA] No se pudo publicar el panel de configuración en ${interaction.guildId}:`, error);
      const response = {
        content: '❌ No se pudo publicar el panel. Revisa que el bot pueda ver y enviar mensajes en el canal elegido.',
        ephemeral: true
      };
      if (interaction.replied || interaction.deferred) return interaction.followUp(response);
      return interaction.reply(response);
    }
  }
};
