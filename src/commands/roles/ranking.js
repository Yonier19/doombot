const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const rankStore = require('../../utils/rankStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ranking')
    .setDescription('Muestra el top 10 de experiencia del servidor.')
    .setDMPermission(false),

  async execute(interaction) {
    const leaders = rankStore.getLeaderboard(interaction.guildId);
    if (!leaders.length) {
      return interaction.reply({
        content: 'Todavía no hay datos de experiencia. ¡Escribe un mensaje para empezar!',
        ephemeral: true
      });
    }
    const rows = await Promise.all(leaders.map(async (entry, index) => {
      const member = interaction.guild.members.cache.get(entry.user_id);
      const name = member?.displayName || `<@${entry.user_id}>`;
      return `**${index + 1}.** ${name} — nivel **${entry.level}** · ${entry.xp.toLocaleString('es-ES')} XP`;
    }));
    const embed = new EmbedBuilder()
      .setColor('#F1C40F')
      .setTitle(`🏆 Ranking de ${interaction.guild.name}`)
      .setDescription(rows.join('\n'))
      .setFooter({ text: 'Top 10 por XP total' });
    return interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
