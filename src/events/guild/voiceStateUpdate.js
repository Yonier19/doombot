const { Events } = require('discord.js');
const rankStore = require('../../utils/rankStore');
const { syncLevelRole } = require('../../utils/rankRoles');

function isEligible(state) {
  return Boolean(
    state.guild &&
    state.member &&
    !state.member.user.bot &&
    state.channelId &&
    state.channelId !== state.guild.afkChannelId
  );
}

async function finishSession(member) {
  if (!rankStore.getVoiceSession(member.guild.id, member.id)) return;
  const awarded = rankStore.awardVoiceXp(member.guild.id, member.id);
  rankStore.stopVoiceSession(member.guild.id, member.id);
  if (awarded) {
    const record = rankStore.getMemberXp(member.guild.id, member.id);
    await syncLevelRole(member, rankStore.getProgress(record.xp).level);
  }
}

module.exports = {
  name: Events.VoiceStateUpdate,
  once: false,
  async execute(oldState, newState) {
    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return;
    try {
      const oldEligible = isEligible(oldState);
      const newEligible = isEligible(newState);
      if (oldEligible && newEligible && oldState.channelId === newState.channelId) return;
      if (oldEligible || rankStore.getVoiceSession(member.guild.id, member.id)) {
        await finishSession(member);
      }
      if (newEligible) {
        rankStore.startVoiceSession(newState.guild.id, member.id, newState.channelId);
      }
    } catch (error) {
      console.error(`[XP VOZ] No se pudo procesar la sesión de ${member.id} en ${member.guild.id}:`, error);
    }
  }
};
