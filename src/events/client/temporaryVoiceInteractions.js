const { Events } = require('discord.js');
const { handleTemporaryVoiceInteraction } = require('../../utils/temporaryVoicePanel');

module.exports = {
  name: Events.InteractionCreate,
  once: false,
  async execute(interaction) {
    if (!interaction.customId?.startsWith('tempvoice:')) return;
    try {
      await handleTemporaryVoiceInteraction(interaction);
    } catch (error) {
      console.error('[VOZ TEMPORAL] Error al procesar los controles de sala:', error);
      const response = {
        content: 'No se pudo completar la acción de la sala. Verifica los permisos del bot.',
        ephemeral: true
      };
      try {
        if (interaction.replied || interaction.deferred) await interaction.followUp(response);
        else await interaction.reply(response);
      } catch (responseError) {
        console.error('[VOZ TEMPORAL] No se pudo responder a la interacción:', responseError);
      }
    }
  }
};
