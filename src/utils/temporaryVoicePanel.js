const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits
} = require('discord.js');
const {
  getChannelReferences,
  trackChannelReference,
  clearChannelReference
} = require('./creatingManager');

const referencePrefix = 'temporary-voice:';

function getRoomReference(guildId, channelId) {
  return Object.entries(getChannelReferences(guildId))
    .find(([key, savedId]) => key.startsWith(referencePrefix) && savedId === channelId) || null;
}

function getRoomOwnerId(guildId, channelId) {
  const reference = getRoomReference(guildId, channelId);
  return reference?.[0].split(':')[2] || null;
}

function isDenied(channel, permission) {
  const everyone = channel.guild.roles.everyone;
  return channel.permissionOverwrites.cache.get(everyone.id)?.deny.has(permission) || false;
}

function createPanel(channel, ownerId) {
  const locked = isDenied(channel, PermissionFlagsBits.Connect);
  const hidden = isDenied(channel, PermissionFlagsBits.ViewChannel);
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('🎛️ Control de sala temporal')
    .setDescription([
      `**Sala:** ${channel.name}`,
      `**Propietario:** <@${ownerId}>`,
      `**Límite:** ${channel.userLimit || 'Sin límite'}`,
      `**Acceso:** ${hidden ? 'Oculta' : locked ? 'Cerrada' : 'Abierta'}`,
      '',
      'Usa los botones para administrar esta sala. Solo el propietario y los administradores pueden cambiarla.'
    ].join('\n'));
  const button = (action, label, style = ButtonStyle.Secondary) =>
    new ButtonBuilder()
      .setCustomId(`tempvoice:${action}:${channel.id}`)
      .setLabel(label)
      .setStyle(style);
  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        button('rename', '✏️ Cambiar nombre'),
        button('limit', '👥 Límite'),
        button(locked ? 'unlock' : 'lock', locked ? '🔓 Abrir' : '🔒 Cerrar'),
        button(hidden ? 'show' : 'hide', hidden ? '👁️ Mostrar' : '🙈 Ocultar'),
        button('transfer', '👑 Transferir')
      ),
      new ActionRowBuilder().addComponents(
        button('delete', '🗑️ Eliminar sala', ButtonStyle.Danger)
      )
    ]
  };
}

async function ensurePanel(channel, ownerId) {
  try {
    const messages = await channel.messages.fetch({ limit: 25 });
    const existing = messages.find(message =>
      message.author.id === channel.client.user.id &&
      message.components.some(row => row.components.some(component =>
        component.customId === `tempvoice:rename:${channel.id}`
      ))
    );
    const payload = createPanel(channel, ownerId);
    if (existing) {
      await existing.edit(payload);
      return existing;
    }
    return await channel.send(payload);
  } catch (error) {
    console.error(`[VOZ TEMPORAL] No se pudo publicar/actualizar la interfaz de ${channel.id}:`, error);
    return null;
  }
}

function createModal(action, channelId) {
  const config = {
    rename: {
      title: 'Cambiar nombre de la sala',
      id: 'room_name',
      label: 'Nuevo nombre',
      placeholder: 'Sala de juegos',
      maxLength: 100
    },
    limit: {
      title: 'Cambiar límite de usuarios',
      id: 'user_limit',
      label: 'Límite (0 = sin límite)',
      placeholder: '0',
      maxLength: 2
    },
    transfer: {
      title: 'Transferir propiedad',
      id: 'new_owner',
      label: 'Mención o ID del nuevo propietario',
      placeholder: '@usuario o ID',
      maxLength: 30
    }
  }[action];
  if (!config) return null;
  const input = new TextInputBuilder()
    .setCustomId(config.id)
    .setLabel(config.label)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(config.placeholder)
    .setMaxLength(config.maxLength)
    .setRequired(true);
  if (action === 'limit') input.setMinLength(1);
  return new ModalBuilder()
    .setCustomId(`tempvoice:submit-${action}:${channelId}`)
    .setTitle(config.title)
    .addComponents(new ActionRowBuilder().addComponents(input));
}

async function acknowledgeError(interaction, content) {
  const payload = { content, ephemeral: true };
  if (interaction.replied || interaction.deferred) return interaction.followUp(payload);
  return interaction.reply(payload);
}

async function handleTemporaryVoiceInteraction(interaction) {
  if (!interaction.customId?.startsWith('tempvoice:')) return false;
  const [, action, channelId] = interaction.customId.split(':');
  const channel = interaction.guild?.channels.cache.get(channelId);
  if (!channel || channel.id !== interaction.channelId && interaction.isModalSubmit()) {
    await acknowledgeError(interaction, 'La sala temporal ya no existe.');
    return true;
  }

  const ownerId = getRoomOwnerId(interaction.guildId, channelId);
  if (!ownerId) {
    await acknowledgeError(interaction, 'No se encontró el propietario de esta sala temporal.');
    return true;
  }
  const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
  if (interaction.user.id !== ownerId && !isAdmin) {
    await acknowledgeError(interaction, 'Solo el propietario de la sala o un administrador puede usar estos controles.');
    return true;
  }

  if (action.startsWith('submit-')) {
    const value = interaction.fields.getTextInputValue(
      action === 'submit-rename' ? 'room_name' :
        action === 'submit-limit' ? 'user_limit' : 'new_owner'
    ).trim();
    try {
      if (action === 'submit-rename') {
        await channel.setName(value, 'Cambio desde el panel de sala temporal');
      } else if (action === 'submit-limit') {
        const limit = Number(value);
        if (!Number.isInteger(limit) || limit < 0 || limit > 99) {
          return acknowledgeError(interaction, 'El límite debe ser un número entre 0 y 99.');
        }
        await channel.setUserLimit(limit, 'Cambio desde el panel de sala temporal');
      } else {
        const userId = value.replace(/[<@!>]/g, '');
        if (!/^\d{17,20}$/.test(userId) || userId === ownerId) {
          return acknowledgeError(interaction, 'Indica el ID o la mención de otro miembro del servidor.');
        }
        const newOwner = await interaction.guild.members.fetch(userId);
        const reference = getRoomReference(interaction.guildId, channelId);
        await channel.permissionOverwrites.edit(newOwner.id, {
          ViewChannel: true,
          Connect: true
        });
        try {
          if (reference) {
            clearChannelReference(interaction.guildId, reference[0]);
            trackChannelReference(interaction.guildId, `${referencePrefix}${channelId}:${newOwner.id}`, channelId);
          }
        } catch (error) {
          await channel.permissionOverwrites.delete(newOwner.id);
          throw error;
        }
        if (channel.permissionOverwrites.cache.has(ownerId)) {
          try {
            await channel.permissionOverwrites.delete(ownerId);
          } catch (error) {
            console.error(`[VOZ TEMPORAL] No se pudo retirar el acceso del propietario anterior ${ownerId}:`, error);
          }
        }
        await ensurePanel(channel, newOwner.id);
      }
      await interaction.reply({
        content: action === 'submit-transfer'
          ? `La propiedad de la sala se transfirió a <@${value.replace(/[<@!>]/g, '')}>.`
          : 'La configuración de la sala se actualizó.',
        ephemeral: true
      });
    } catch (error) {
      console.error(`[VOZ TEMPORAL] No se pudo ejecutar ${action} en ${channelId}:`, error);
      await acknowledgeError(interaction, 'No se pudo aplicar el cambio. Verifica los permisos del bot e inténtalo de nuevo.');
    }
    return true;
  }

  if (['rename', 'limit', 'transfer'].includes(action)) {
    await interaction.showModal(createModal(action, channelId));
    return true;
  }
  if (action === 'delete') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`tempvoice:confirm-delete:${channelId}`)
        .setLabel('Eliminar sala').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`tempvoice:cancel-delete:${channelId}`)
        .setLabel('Conservar sala').setStyle(ButtonStyle.Secondary)
    );
    await interaction.reply({
      content: '¿Eliminar esta sala? Se desconectará a todas las personas que estén dentro.',
      components: [row],
      ephemeral: true
    });
    return true;
  }
  if (action === 'cancel-delete') {
    await interaction.update({ content: 'Se conservó la sala.', components: [] });
    return true;
  }
  if (action === 'confirm-delete') {
    await interaction.update({ content: 'Eliminando la sala temporal…', components: [] });
    const reference = getRoomReference(interaction.guildId, channelId);
    try {
      await channel.delete('Eliminada desde el panel de sala temporal');
      if (reference) clearChannelReference(interaction.guildId, reference[0]);
    } catch (error) {
      console.error(`[VOZ TEMPORAL] No se pudo eliminar la sala ${channelId}:`, error);
      await interaction.followUp({
        content: 'No se pudo eliminar la sala. Verifica que el bot tenga Gestionar canales.',
        ephemeral: true
      });
    }
    return true;
  }

  if (['lock', 'unlock'].includes(action)) {
    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone.id, {
      Connect: action === 'lock' ? false : true
    });
  } else if (['hide', 'show'].includes(action)) {
    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone.id, {
      ViewChannel: action === 'hide' ? false : true
    });
  } else {
    return false;
  }
  await ensurePanel(channel, ownerId);
  await interaction.reply({
    content: action === 'lock' ? 'Sala cerrada.' :
      action === 'unlock' ? 'Sala abierta.' :
        action === 'hide' ? 'Sala ocultada.' : 'Sala visible.',
    ephemeral: true
  });
  return true;
}

module.exports = {
  createPanel,
  ensurePanel,
  getRoomOwnerId,
  handleTemporaryVoiceInteraction
};
