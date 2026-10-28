const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const rankStore = require('../../utils/rankStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rango')
    .setDescription('Muestra tu nivel, experiencia y progreso.')
    .setDMPermission(false)
    .addUserOption(option => option
      .setName('usuario')
      .setDescription('Miembro cuyo rango quieres consultar')
      .setRequired(false)),

  async execute(interaction) {
    const target = interaction.options.getUser('usuario') || interaction.user;
    const record = rankStore.getMemberXp(interaction.guildId, target.id);
    const { level, xp, progress, needed } = rankStore.getProgress(record.xp);
    const filled = needed ? Math.floor(progress / needed * 10) : 10;
    const bar = `${'▰'.repeat(filled)}${'▱'.repeat(10 - filled)}`;
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setAuthor({
        name: `Rango de ${target.username}`,
        iconURL: target.displayAvatarURL()
      })
      .addFields(
        { name: 'Nivel', value: String(level), inline: true },
        { name: 'XP total', value: xp.toLocaleString('es-ES'), inline: true },
        { name: 'Progreso', value: `${bar} ${progress}/${needed} XP`, inline: false }
      );
    return interaction.reply({ embeds: [embed], ephemeral: target.id === interaction.user.id });
  }
};
