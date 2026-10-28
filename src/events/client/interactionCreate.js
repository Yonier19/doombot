const {
  Events,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} = require('discord.js');
const { getWizardState, updateWizardState, deleteWizardState } = require('../../utils/wizardState');
const { renderWizardStep } = require('../../utils/wizardRenderer');
const { executeWizardCreation } = require('../../utils/wizardExecutor');
const { handleWelcomeInteraction, requiresManualApproval } = require('../../utils/welcomeInteractions');
const { getConfig: getWelcomeConfig } = require('../../utils/welcomeConfig');
const rankStore = require('../../utils/rankStore');
const {
  resolveRole,
  canManageRole,
  isProtectedRole,
  hasForbiddenPermissions
} = require('../../utils/rankRoles');

module.exports = {
  name: Events.InteractionCreate,
  once: false,
  async execute(interaction, client) {
    try {
      // 1. COMANDOS DE BARRA
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        try {
          await command.execute(interaction, client);
        } catch (error) {
          console.error(`[ERROR] Excepción en comando /${interaction.commandName}:`, error);
          const errorEmbed = new EmbedBuilder()
            .setColor('#ED4245')
            .setTitle('❌ Error al ejecutar el comando')
            .setDescription('Ocurrió un error inesperado al procesar la solicitud.')
            .setTimestamp();

          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
          } else {
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
          }
        }
        return;
      }

      // 2. SELECT MENUS DEL ASISTENTE GUIADO
      if (interaction.isStringSelectMenu()) {
        if (interaction.customId.startsWith('wizard:')) {
          const parts = interaction.customId.split(':');
          const menuType = parts[1];
          const ownerId = parts[3];

          if (ownerId && interaction.user.id !== ownerId) {
            return interaction.reply({
              content: 'Este asistente pertenece a otra persona.',
              ephemeral: true
            });
          }

          const state = getWizardState(interaction.guildId, interaction.user.id);
          if (!state) {
            return interaction.reply({
              content: '⚠️ La sesión del asistente ha expirado (límite de 15 minutos). Inicia nuevamente con `/asistente`.',
              ephemeral: true
            });
          }

          if (menuType === 'template') {
            state.template = interaction.values[0];
            updateWizardState(interaction.guildId, interaction.user.id, { template: state.template });
          } else if (menuType === 'modules') {
            state.modules = interaction.values;
            updateWizardState(interaction.guildId, interaction.user.id, { modules: state.modules });
          }

          const payload = renderWizardStep(interaction.guildId, interaction.user.id, state, interaction.guild);
          return await interaction.update(payload);
        }
        return;
      }

      // 3. BOTONES
      if (interaction.isButton()) {
        if (interaction.customId.startsWith('wcfg:')) {
          return await handleWelcomeInteraction(interaction);
        }

        // A. Asistente Guiado
        if (interaction.customId.startsWith('wizard:')) {
          const parts = interaction.customId.split(':');
          const action = parts[1];
          const target = parts[2];

          const realOwnerId = interaction.customId.includes('toggle') || interaction.customId.includes('step') || interaction.customId.includes('modal')
            ? parts[parts.length - 1]
            : (parts[3] || parts[2]);

          if (realOwnerId && interaction.user.id !== realOwnerId) {
            return interaction.reply({
              content: 'Este asistente pertenece a otra persona.',
              ephemeral: true
            });
          }

          const state = getWizardState(interaction.guildId, interaction.user.id);

          if (action === 'cancel') {
            deleteWizardState(interaction.guildId, interaction.user.id);
            return await interaction.update({
              content: '❌ **Asistente de configuración cancelado.** El estado en memoria ha sido eliminado y ningún cambio fue aplicado.',
              embeds: [],
              components: []
            });
          }

          if (!state) {
            return interaction.reply({
              content: '⚠️ La sesión del asistente ha expirado (límite de 15 minutos). Inicia nuevamente con `/asistente`.',
              ephemeral: true
            });
          }

          if (action === 'step') {
            const nextStep = parseInt(target, 10);
            state.step = nextStep;
            updateWizardState(interaction.guildId, interaction.user.id, { step: nextStep });

            const payload = renderWizardStep(interaction.guildId, interaction.user.id, state, interaction.guild);
            return await interaction.update(payload);
          }

          if (action === 'toggle') {
            const roleKey = target;
            state.roles[roleKey] = !state.roles[roleKey];
            updateWizardState(interaction.guildId, interaction.user.id, { roles: state.roles });

            const payload = renderWizardStep(interaction.guildId, interaction.user.id, state, interaction.guild);
            return await interaction.update(payload);
          }

          if (action === 'modal' && target === 'open') {
            const modal = new ModalBuilder()
              .setCustomId(`wizard:modal:submit:${interaction.user.id}`)
              .setTitle('Personalizar Servidor');

            const serverNameInput = new TextInputBuilder()
              .setCustomId('custom_server_name')
              .setLabel('Nombre del Servidor (Opcional)')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder(interaction.guild.name)
              .setValue(state.custom.serverName || interaction.guild.name)
              .setMaxLength(100)
              .setRequired(false);

            const categoryPrefixInput = new TextInputBuilder()
              .setCustomId('custom_category_prefix')
              .setLabel('Prefijo de Categorías (ej: 📁, •, ───)')
              .setStyle(TextInputStyle.Short)
              .setValue(state.custom.categoryPrefix || '📁')
              .setMaxLength(10)
              .setRequired(false);

            const decorativeEmojiInput = new TextInputBuilder()
              .setCustomId('custom_decorative_emoji')
              .setLabel('Emoji Decorativo (ej: ⚡, 🌟, 🔥)')
              .setStyle(TextInputStyle.Short)
              .setValue(state.custom.decorativeEmoji || '⚡')
              .setMaxLength(5)
              .setRequired(false);

            modal.addComponents(
              new ActionRowBuilder().addComponents(serverNameInput),
              new ActionRowBuilder().addComponents(categoryPrefixInput),
              new ActionRowBuilder().addComponents(decorativeEmojiInput)
            );

            return await interaction.showModal(modal);
          }

          if (action === 'confirm') {
            await interaction.update({
              content: '⏳ **Ejecutando configuración guiada...** Creando roles y canales con pausas de seguridad (850ms)...',
              embeds: [],
              components: []
            });

            return await executeWizardCreation(interaction, state);
          }
        }

        // B. Botones persistentes de Auto-Roles (customId: rol:ID_DEL_ROL)
        if (interaction.customId.startsWith('rol:')) {
          const roleId = interaction.customId.slice(4);
          const role = interaction.guild.roles.cache.get(roleId);

          if (!role) {
            return await interaction.reply({
              content: '❌ Este rol ya no existe en el servidor.',
              ephemeral: true
            });
          }

          if (isProtectedRole(interaction.guildId, role)) {
            return await interaction.reply({
              content: '🛡️ Este rol pertenece al sistema de rangos o es manual y no se puede autoasignar desde un panel. Usa el panel solo para roles de color o intereses.',
              ephemeral: true
            });
          }

          // Regla 5: Bloqueo de roles de administración
          const hasAdmin = hasForbiddenPermissions(role);

          if (hasAdmin) {
            return await interaction.reply({
              content: '🛡️ **Acción bloqueada:** Por motivos de seguridad, este rol posee permisos administrativos o de moderación y no puede ser auto-asignado mediante botones.',
              ephemeral: true
            });
          }

          // Regla 3: Verificación de jerarquía del bot
          const botMember = interaction.guild.members.me;
          if (botMember.roles.highest.position <= role.position) {
            return await interaction.reply({
              content: `⚠️ **Error de Jerarquía:** El rol del bot (**@${botMember.roles.highest.name}**) no tiene suficiente jerarquía para gestionar el rol **@${role.name}**.\\n` +
                       `Por favor, contacta a un administrador para que coloque el rol del bot por encima de este rol en la lista de roles del servidor.`,
              ephemeral: true
            });
          }

          try {
            if (interaction.member.roles.cache.has(role.id)) {
              await interaction.member.roles.remove(role, 'Auto-rol retirado por botón');
              return await interaction.reply({
                content: `🔴 **Rol retirado:** Has dejado de tener el rol **@${role.name}**.`,
                ephemeral: true
              });
            } else {
              const rankRoleKey = rankStore.getRankRoleKey(interaction.guildId, role.id) || '';
              if (rankRoleKey.startsWith('interest_')) {
                const currentInterestCount = rankStore.getRankRoles(interaction.guildId)
                  .filter(entry => entry.role_key.startsWith('interest_') &&
                    interaction.member.roles.cache.has(entry.role_id))
                  .length;
                if (currentInterestCount >= 5) {
                  return await interaction.reply({
                    content: 'Has alcanzado el máximo de 5 roles de interés. Quita uno antes de elegir otro.',
                    ephemeral: true
                  });
                }
              }
              await interaction.member.roles.add(role, 'Auto-rol asignado por botón');
              return await interaction.reply({
                content: `🟢 **Rol añadido:** Se te ha asignado el rol **@${role.name}**.`,
                ephemeral: true
              });
            }
          } catch (roleErr) {
            console.error(`[ERROR] No se pudo alternar el rol ${role.name}:`, roleErr);
            return await interaction.reply({
              content: `❌ No se pudo actualizar el rol debido a un error de permisos en Discord: ${roleErr.message}`,
              ephemeral: true
            });
          }
        }

        // C. Botones de Verificación de Reglas (customId: reglas:aceptar)
        if (interaction.customId === 'reglas:aceptar') {
          const botMember = interaction.guild.members.me;

          const welcomeConfig = getWelcomeConfig(interaction.guildId);
          if (requiresManualApproval(interaction.member, welcomeConfig)) {
            return await interaction.reply({
              content: '🛡️ La verificación reforzada está activa y tu cuenta tiene menos de 7 días. El staff debe aprobarte manualmente; recibirás acceso cuando te asignen el rol Miembro.',
              ephemeral: true
            });
          }

          const memberRole = resolveRole(interaction.guild, 'member') || interaction.guild.roles.cache.find(r =>
            r.name.toLowerCase() === 'miembro' ||
            r.name.toLowerCase().includes('miembro') ||
            r.name.toLowerCase() === 'member'
          );

          if (!memberRole) {
            return await interaction.reply({
              content: '❌ No se encontró el rol **Miembro** configurado en este servidor. Por favor, solicita a un administrador que ejecute `/panel-reglas`.',
              ephemeral: true
            });
          }

          if (botMember.roles.highest.position <= memberRole.position) {
            return await interaction.reply({
              content: `⚠️ **Error de Jerarquía:** El bot no puede asignar el rol **@${memberRole.name}** porque su rol está por debajo en la lista de roles. Avisa al staff del servidor.`,
              ephemeral: true
            });
          }

          const newRole = resolveRole(interaction.guild, 'new');
          const memberSafety = await canManageRole(interaction.guild, memberRole, true);
          const newSafety = newRole
            ? await canManageRole(interaction.guild, newRole, true)
            : { ok: true };
          if (!memberSafety.ok || !newSafety.ok) {
            return await interaction.reply({
              content: `⚠️ No se pudo completar la verificación: ${!memberSafety.ok ? memberSafety.reason : newSafety.reason}`,
              ephemeral: true
            });
          }

          if (interaction.member.roles.cache.has(memberRole.id)) {
            try {
              if (newRole && interaction.member.roles.cache.has(newRole.id)) {
                await interaction.member.roles.remove(newRole, 'Retirar Nuevo tras aceptar reglas');
              }
            } catch (removeNewError) {
              console.error(`[VERIFICACIÓN] No se pudo retirar Nuevo de ${interaction.user.id}:`, removeNewError);
              return await interaction.reply({
                content: 'Ya tienes el rol Miembro, pero no se pudo retirar el rol Nuevo. Avisa a un administrador para que revise la jerarquía del bot.',
                ephemeral: true
              });
            }
            return await interaction.reply({
              content: `ℹ️ Ya has aceptado las reglas con anterioridad y cuentas con el rol **@${memberRole.name}**. ¡Ya tienes acceso completo al servidor!`,
              ephemeral: true
            });
          }

          try {
            await interaction.member.roles.add(memberRole, 'Reglas del servidor aceptadas mediante botón');
            if (newRole && interaction.member.roles.cache.has(newRole.id)) {
              await interaction.member.roles.remove(newRole, 'Retirar Nuevo tras aceptar reglas');
            }
            return await interaction.reply({
              content: `🎉 **¡Reglas aceptadas con éxito!** Se te ha otorgado el rol **@${memberRole.name}** y se han desbloqueado todos los canales de la comunidad. ¡Que disfrutes tu estancia!`,
              ephemeral: true
            });
          } catch (acceptErr) {
            console.error('[ERROR] Error al otorgar rol Miembro en reglas:aceptar:', acceptErr);
            return await interaction.reply({
              content: interaction.member.roles.cache.has(memberRole.id)
                ? `⚠️ Recibiste el rol Miembro, pero no se pudo retirar Nuevo. Avisa al staff para revisar los permisos del bot. Causa: ${acceptErr.message}`
                : `❌ No se pudo otorgar el rol Miembro: ${acceptErr.message}`,
              ephemeral: true
            });
          }
        }

        if (interaction.customId === 'reglas:info') {
          return await interaction.reply({
            content: `🔒 **¿Por qué solo puedes ver este canal?**\\n` +
                     `El servidor cuenta con un sistema de verificación para prevenir bots no deseados y spam.\\n` +
                     `Para desbloquear todos los canales de chat, multimedia y voz, pulsa el botón **"📜 Aceptar reglas"** arriba.`,
            ephemeral: true
          });
        }

        // D. Botones persistentes de otros módulos (/panel)
        const parts = interaction.customId.split(':');
        const modulo = parts[0];
        const accion = parts[1];
        const ownerId = parts[2];
        const extra = parts.slice(3);

        if (ownerId && interaction.user.id !== ownerId) {
          return interaction.reply({
            content: 'Este panel pertenece a otra persona.',
            ephemeral: true
          });
        }

        const buttonKey = `${modulo}:${accion}`;
        const buttonHandler = client.buttons.get(buttonKey);

        if (buttonHandler) {
          return await buttonHandler.execute(interaction, client, { modulo, accion, ownerId, extra });
        }
      }

      // 4. MODAL SUBMIT
      if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('wcfg:')) {
          return await handleWelcomeInteraction(interaction);
        }
        if (interaction.customId.startsWith('wizard:modal:submit')) {
          const parts = interaction.customId.split(':');
          const ownerId = parts[3];

          if (ownerId && interaction.user.id !== ownerId) {
            return interaction.reply({
              content: 'Este asistente pertenece a otra persona.',
              ephemeral: true
            });
          }

          const state = getWizardState(interaction.guildId, interaction.user.id);
          if (!state) {
            return interaction.reply({
              content: '⚠️ La sesión del asistente ha expirado. Inicia nuevamente con `/asistente`.',
              ephemeral: true
            });
          }

          const serverName = interaction.fields.getTextInputValue('custom_server_name').trim();
          const categoryPrefix = interaction.fields.getTextInputValue('custom_category_prefix').trim() || '📁';
          const decorativeEmoji = interaction.fields.getTextInputValue('custom_decorative_emoji').trim() || '⚡';

          state.custom = {
            serverName,
            categoryPrefix,
            decorativeEmoji
          };

          updateWizardState(interaction.guildId, interaction.user.id, { custom: state.custom });

          const payload = renderWizardStep(interaction.guildId, interaction.user.id, state, interaction.guild);
          return await interaction.update(payload);
        }
      }
    } catch (globalErr) {
      console.error('[ERROR] Error no capturado en interactionCreate:', globalErr);
      if (interaction.isRepliable?.()) {
        const response = {
          content: '❌ No se pudo procesar esta interacción. Revisa los permisos del bot e inténtalo de nuevo.',
          ephemeral: true
        };
        try {
          if (interaction.replied || interaction.deferred) await interaction.followUp(response);
          else await interaction.reply(response);
        } catch (responseError) {
          console.error('[ERROR] Tampoco se pudo responder a la interacción:', responseError);
        }
      }
    }
  }
};
