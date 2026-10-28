const { Events } = require('discord.js');
const rankConfig = require('../../config/ranks.json');
const rankStore = require('../../utils/rankStore');
const { setMemberRole, syncLevelRole } = require('../../utils/rankRoles');

let timersStarted = false;

async function reviewVeterans(client) {
  const cutoff = Date.now() - rankConfig.veteranDays * 24 * 60 * 60 * 1000;
  for (const guild of client.guilds.cache.values()) {
    try {
      for (const member of guild.members.cache.values()) {
        if (member.user.bot) continue;
        try {
          if (member.joinedTimestamp && member.joinedTimestamp <= cutoff) {
            await setMemberRole(member, 'veteran', true, `Antigüedad de ${rankConfig.veteranDays} días`);
          }
        } catch (error) {
          console.error(`[RANGOS] No se pudieron sincronizar Booster/Veterano para ${member.id}:`, error);
        }
      }
    } catch (error) {
      console.error(`[RANGOS] No se pudieron revisar los veteranos del servidor ${guild.id}:`, error);
    }
  }
}

async function reconcileVoice(client) {
  const activeIds = new Set();
  for (const session of rankStore.getAllVoiceSessions()) {
    const guild = client.guilds.cache.get(session.guild_id);
    const member = guild?.members.cache.get(session.user_id);
    if (!member?.voice.channelId || member.voice.channelId !== session.channel_id ||
        member.voice.channelId === guild.afkChannelId || member.user.bot) {
      rankStore.stopVoiceSession(session.guild_id, session.user_id);
      continue;
    }
    rankStore.startVoiceSession(session.guild_id, session.user_id, session.channel_id);
    activeIds.add(`${guild.id}:${member.id}`);
  }
  for (const guild of client.guilds.cache.values()) {
    for (const state of guild.voiceStates.cache.values()) {
      const member = state.member;
      if (!member || member.user.bot || !state.channelId || state.channelId === guild.afkChannelId) continue;
      const key = `${guild.id}:${member.id}`;
      if (!activeIds.has(key)) rankStore.startVoiceSession(guild.id, member.id, state.channelId);
    }
  }
}

async function awardConnectedVoiceXp(client) {
  for (const session of rankStore.getAllVoiceSessions()) {
    const guild = client.guilds.cache.get(session.guild_id);
    const member = guild?.members.cache.get(session.user_id);
    if (!member?.voice.channelId || member.voice.channelId !== session.channel_id ||
        member.voice.channelId === guild.afkChannelId || member.user.bot) {
      rankStore.stopVoiceSession(session.guild_id, session.user_id);
      continue;
    }
    try {
      if (rankStore.awardVoiceXp(guild.id, member.id)) {
        const record = rankStore.getMemberXp(guild.id, member.id);
        await syncLevelRole(member, rankStore.getProgress(record.xp).level);
      }
    } catch (error) {
      console.error(`[XP VOZ] No se pudo otorgar experiencia a ${member.id} en ${guild.id}:`, error);
    }
  }
}

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    try {
      await reconcileVoice(client);
      await reviewVeterans(client);
      if (timersStarted) return;
      timersStarted = true;
      const untilNextUtcDay = 24 * 60 * 60 * 1000 - (Date.now() % (24 * 60 * 60 * 1000));
      const dailyTimer = setTimeout(() => {
        void reviewVeterans(client);
        const interval = setInterval(() => void reviewVeterans(client), 24 * 60 * 60 * 1000);
        interval.unref?.();
      }, untilNextUtcDay);
      dailyTimer.unref?.();
      const voiceTimer = setInterval(() => void awardConnectedVoiceXp(client), 60 * 1000);
      voiceTimer.unref?.();
    } catch (error) {
      console.error('[RANGOS] No se pudieron iniciar las tareas programadas:', error);
    }
  }
};
