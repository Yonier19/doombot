const { Events } = require('discord.js');
const { handleCreatingButton } = require('../../utils/creatingManager');

module.exports = {
  name: Events.InteractionCreate,
  once: false,
  async execute(interaction) {
    if (!interaction.isButton() || !interaction.customId.startsWith('creating:')) return;

    try {
      await handleCreatingButton(interaction);
    } catch (error) {
      console.error('[ERROR] Error al procesar un botón de /creating:', error);
      const response = {
        content: '❌ Ocurrió un error inesperado al procesar esta acción.',
        ephemeral: true
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(response);
      } else {
        await interaction.reply(response);
      }
    }
  }
};
