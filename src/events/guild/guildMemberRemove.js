const { Events } = require('discord.js');
const { handleMemberLeave } = require('../../utils/memberLifecycle');

module.exports = {
  name: Events.GuildMemberRemove,
  once: false,
  async execute(member) {
    try {
      await handleMemberLeave(member);
    } catch (error) {
      console.error(`[DESPEDIDA] No se pudo completar el proceso para ${member.id}:`, error);
    }
  }
};
