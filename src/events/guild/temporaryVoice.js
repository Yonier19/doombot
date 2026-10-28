const { Events, ChannelType, PermissionFlagsBits } = require('discord.js');
const {
  getChannelReference,
  getChannelReferences,
  trackChannelReference,
  clearChannelReference
} = require('../../utils/creatingManager');
const { ensurePanel } = require('../../utils/temporaryVoicePanel');

const triggerReferenceKeys = ['crear-sala', 'modulo-voz-temporal'];
const roomReferencePrefix = 'temporary-voice:';
const creatingRooms = new Set();

async function findTrigger(guild, channelId) {
  for (const referenceKey of triggerReferenceKeys) {
    try {
      const channel = await getChannelReference(guild.id, referenceKey, guild);
      if (channel?.id === channelId && channel.type === ChannelType.GuildVoice) return channel;
    } catch (error) {
      console.error(`[VOZ TEMPORAL] No se pudo resolver la referencia ${referenceKey} de ${guild.id}:`, error);
    }
  }
  return null;
}

function roomReference(guildId, channelId) {
  return Object.entries(getChannelReferences(guildId))
    .find(([key, savedId]) => key.startsWith(roomReferencePrefix) && savedId === channelId)?.[0] || null;
}

async function removeEmptyRoom(guild, channelId) {
  const referenceKey = roomReference(guild.id, channelId);
  if (!referenceKey) return;
  const remainingMembers = guild.voiceStates.cache.filter(state => state.channelId === channelId);
  if (remainingMembers.size) return;
  let channel = guild.channels.cache.get(channelId);
  if (!channel) {
    try {
      channel = await guild.channels.fetch(channelId);
    } catch (error) {
      if (error.code !== 10003) {
        console.error(`[VOZ TEMPORAL] No se pudo recuperar la sala ${channelId} de ${guild.id}:`, error);
        return;
      }
    }
  }
  if (channel) {
    try {
      await channel.delete('Sala temporal vacía');
    } catch (error) {
      console.error(`[VOZ TEMPORAL] No se pudo borrar la sala ${channelId} de ${guild.id}:`, error);
      return;
    }
  }
  clearChannelReference(guild.id, referenceKey);
}

async function createTemporaryRoom(member, trigger) {
  const guild = member.guild;
  const guardKey = `${guild.id}:${member.id}`;
  if (creatingRooms.has(guardKey)) return;
  creatingRooms.add(guardKey);
  let room;
  let referenceKey;
  try {
    if (guild.channels.cache.size >= 500) {
      throw new Error('se alcanzó el límite de 500 canales y categorías');
    }
    const botMember = guild.members.me || await guild.members.fetchMe();
    if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels) ||
        !botMember.permissions.has(PermissionFlagsBits.MoveMembers)) {
      throw new Error('el bot necesita Gestionar canales (ManageChannels) y Mover miembros (MoveMembers)');
    }
    const alreadyActive = Object.entries(getChannelReferences(guild.id))
      .find(([key]) => key.startsWith(roomReferencePrefix) && key.endsWith(`:${member.id}`));
    if (alreadyActive) {
      let existingRoom = guild.channels.cache.get(alreadyActive[1]);
      if (!existingRoom) {
        try {
          existingRoom = await guild.channels.fetch(alreadyActive[1]);
        } catch (error) {
          if (error.code !== 10003) throw error;
        }
      }
      if (existingRoom) {
        await member.voice.setChannel(existingRoom, 'Reanudar sala de voz temporal');
        await ensurePanel(existingRoom, member.id);
        return;
      }
      clearChannelReference(guild.id, alreadyActive[0]);
    }

    const childCount = guild.channels.cache.filter(channel => channel.parentId === trigger.parentId).size;
    const parentId = trigger.parentId && childCount < 50 ? trigger.parentId : null;
    const permissionOverwrites = trigger.permissionOverwrites.cache.map(overwrite => ({
      id: overwrite.id,
      allow: overwrite.allow.toArray(),
      deny: overwrite.deny.toArray(),
      type: overwrite.type
    }));
    permissionOverwrites.push({
      id: botMember.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ManageChannels
      ],
      deny: []
    });
    permissionOverwrites.push({
      id: member.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
      deny: []
    });
    const safeName = (member.displayName || member.user.username)
      .replace(/[\r\n]/g, ' ')
      .slice(0, 80);
    room = await guild.channels.create({
      name: `🔊・Sala de ${safeName}`,
      type: ChannelType.GuildVoice,
      parent: parentId,
      bitrate: trigger.bitrate,
      userLimit: trigger.userLimit,
      permissionOverwrites,
      reason: `Sala temporal solicitada por ${member.user.tag || member.id}`
    });
    referenceKey = `${roomReferencePrefix}${room.id}:${member.id}`;
    trackChannelReference(guild.id, referenceKey, room.id);
    await member.voice.setChannel(room, 'Mover al usuario a su sala temporal');
    await ensurePanel(room, member.id);
  } catch (error) {
    console.error(`[VOZ TEMPORAL] No se pudo crear/mover a ${member.id} en ${guild.id}:`, error);
    if (room) {
      if (referenceKey) {
        try {
          clearChannelReference(guild.id, referenceKey);
        } catch (registryError) {
          console.error(`[VOZ TEMPORAL] No se pudo limpiar la referencia ${referenceKey}:`, registryError);
        }
      }
      try {
        await room.delete('Limpiar sala temporal incompleta');
      } catch (cleanupError) {
        console.error(`[VOZ TEMPORAL] No se pudo limpiar la sala incompleta ${room.id}:`, cleanupError);
      }
    }
  } finally {
    creatingRooms.delete(guardKey);
  }
}

module.exports = {
  name: Events.VoiceStateUpdate,
  once: false,
  async execute(oldState, newState) {
    try {
      const member = newState.member || oldState.member;
      if (!member || member.user.bot) return;

      if (newState.channelId && newState.channelId !== oldState.channelId) {
        const trigger = await findTrigger(newState.guild, newState.channelId);
        if (trigger) await createTemporaryRoom(member, trigger);
      }

      if (oldState.channelId && oldState.channelId !== newState.channelId) {
        await removeEmptyRoom(oldState.guild, oldState.channelId);
      }
    } catch (error) {
      console.error('[VOZ TEMPORAL] Error procesando el cambio de canal de voz:', error);
    }
  }
};
