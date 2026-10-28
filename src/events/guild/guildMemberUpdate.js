const { Events } = require('discord.js');
const { setMemberRole, resolveRole } = require('../../utils/rankRoles');

module.exports = {
  name: Events.GuildMemberUpdate,
  once: false,
  async execute(oldMember, newMember) {
    if (newMember.user.bot) return;
    const memberRole = resolveRole(newMember.guild, 'member');
    if (memberRole &&
        !oldMember.roles.cache.has(memberRole.id) &&
        newMember.roles.cache.has(memberRole.id)) {
      try {
        await setMemberRole(newMember, 'new', false, 'Retirar Nuevo tras aprobación manual del staff');
      } catch (error) {
        console.error(`[BIENVENIDA] No se pudo retirar Nuevo de ${newMember.id} tras aprobación:`, error);
      }
    }
    const wasBoosting = Boolean(oldMember.premiumSinceTimestamp || oldMember.premiumSince);
    const isBoosting = Boolean(newMember.premiumSinceTimestamp || newMember.premiumSince);
    if (wasBoosting === isBoosting) return;
    try {
      await setMemberRole(
        newMember,
        'booster',
        isBoosting,
        isBoosting ? 'Rol VIP asignado por impulsar el servidor' : 'Rol VIP retirado al dejar de impulsar'
      );
    } catch (error) {
      console.error(`[RANGOS] No se pudo sincronizar el rol de Booster para ${newMember.id}:`, error);
    }
  }
};
