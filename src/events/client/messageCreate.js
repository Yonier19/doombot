const { Events } = require('discord.js');
const creatingCommand = require('../../commands/servidor/creating');

module.exports = {
  name: Events.MessageCreate,
  once: false,
  async execute(message) {
    if (process.env.ENABLE_PREFIX_COMMANDS !== 'true') return;
    if (!message.guild || message.author.bot) return;

    const prefix = process.env.PREFIX?.trim() || '!';
    if (!message.content.startsWith(prefix)) return;

    const [commandName] = message.content.slice(prefix.length).trim().split(/\s+/);
    if (commandName?.toLowerCase() !== 'creating') return;

    try {
      await creatingCommand.executePrefix(message);
    } catch (error) {
      console.error('[ERROR] Error al procesar !creating:', error);
      try {
        await message.reply({
          content: '❌ Ocurrió un error inesperado al iniciar la creación. Inténtalo de nuevo o revisa los registros del bot.',
          allowedMentions: { repliedUser: false }
        });
      } catch (replyError) {
        console.error('[ERROR] No se pudo responder al mensaje !creating:', replyError);
      }
    }
  }
};
