const { Events } = require('discord.js');
const { handleMemberJoin } = require('../../utils/memberLifecycle');

module.exports = {
  name: Events.GuildMemberAdd,
  once: false,
  async execute(member) {
    try {
      console.log(`[BIENVENIDA] Nuevo miembro: ${member.user.tag} (${member.id}) en ${member.guild.id}`);
      await handleMemberJoin(member);
    } catch (error) {
      console.error(`[BIENVENIDA] No se pudo completar el proceso para ${member.id}:`, error);
    }
  }
};
