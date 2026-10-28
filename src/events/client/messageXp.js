const { Events } = require('discord.js');
const rankStore = require('../../utils/rankStore');
const { syncLevelRole } = require('../../utils/rankRoles');

module.exports = {
  name: Events.MessageCreate,
  once: false,
  async execute(message) {
    if (!message.guild || message.author.bot) return;
    try {
      const updated = rankStore.awardMessage(message.guild.id, message.author.id);
      if (updated) {
        const member = message.member || await message.guild.members.fetch(message.author.id);
        await syncLevelRole(member, rankStore.getProgress(updated.xp).level);
      }
    } catch (error) {
      console.error(`[XP] No se pudo registrar el mensaje de ${message.author.id} en ${message.guild.id}:`, error);
    }
  }
};
