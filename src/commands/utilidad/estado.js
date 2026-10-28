const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder
} = require('discord.js');
const { getLastBackup } = require('../../utils/backupManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('estado')
    .setDescription('Muestra el estado y consumo del bot.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction, client) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: 'Necesitas permisos de administrador para usar este comando.',
        ephemeral: true
      });
    }

    const memoryMb = process.memoryUsage().rss / (1024 * 1024);
    const uptimeSeconds = Math.floor(process.uptime());
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const lastBackup = getLastBackup();
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('📊 Estado del bot')
      .addFields(
        { name: 'RAM', value: `${memoryMb.toFixed(1)} MB`, inline: true },
        { name: 'Uptime', value: `${days} d ${hours} h ${minutes} min`, inline: true },
        { name: 'Latencia', value: `${Math.max(0, client.ws.ping)} ms`, inline: true },
        {
          name: 'Último respaldo',
          value: lastBackup ? `<t:${Math.floor(lastBackup.getTime() / 1000)}:R>` : 'Aún no hay respaldos.',
          inline: false
        }
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
