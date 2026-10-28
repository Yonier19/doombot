const { Events } = require('discord.js');
const { getChannelReferences, clearChannelReference } = require('../../utils/creatingManager');
const { ensurePanel } = require('../../utils/temporaryVoicePanel');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    for (const guild of client.guilds.cache.values()) {
      try {
        for (const [referenceKey, channelId] of Object.entries(getChannelReferences(guild.id))) {
          if (!referenceKey.startsWith('temporary-voice:')) continue;
          let channel = guild.channels.cache.get(channelId);
          if (!channel) {
            try {
              channel = await guild.channels.fetch(channelId);
            } catch (error) {
              if (error.code === 10003) {
                clearChannelReference(guild.id, referenceKey);
                continue;
              }
              console.error(`[VOZ TEMPORAL] No se pudo recuperar la sala ${channelId} de ${guild.id}:`, error);
              continue;
            }
          }
          const membersPresent = guild.voiceStates.cache.some(state => state.channelId === channel.id);
          if (membersPresent) {
            const ownerId = referenceKey.split(':')[2];
            if (ownerId) await ensurePanel(channel, ownerId);
            continue;
          }
          if (!membersPresent) {
            try {
              await channel.delete('Limpiar sala temporal vacía después del reinicio');
              clearChannelReference(guild.id, referenceKey);
            } catch (error) {
              console.error(`[VOZ TEMPORAL] No se pudo limpiar la sala ${channel.id} al iniciar:`, error);
            }
          }
        }
      } catch (error) {
        console.error(`[VOZ TEMPORAL] No se pudo reconciliar el registro del servidor ${guild.id}:`, error);
      }
    }
  }
};
