const {
  SlashCommandBuilder,
  PermissionFlagsBits
} = require('discord.js');
const { beginCreating } = require('../../utils/creatingManager');
const templates = require('../../config/templateLoader');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('creating')
    .setDescription('Prepara una estructura profesional con categorías, canales, roles y permisos.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addStringOption(option =>
      option
        .setName('plantilla')
        .setDescription('Elige el tipo de servidor que quieres configurar.')
        .setRequired(false)
        .addChoices(
          ...Object.entries(templates).map(([value, template]) => ({
            name: template.nombre,
            value
          }))
        )
    ),

  async execute(interaction) {
    await beginCreating({
      guild: interaction.guild,
      member: interaction.member,
      user: interaction.user,
      templateKey: interaction.options.getString('plantilla') || 'comunidad',
      defer: () => interaction.deferReply({ ephemeral: true }),
      respond: payload => interaction.deferred
        ? interaction.editReply(payload)
        : interaction.reply({ ...payload, ephemeral: true }),
      update: payload => interaction.editReply(payload)
    });
  },

  async executePrefix(message) {
    await beginCreating({
      guild: message.guild,
      member: message.member,
      user: message.author,
      respond: payload => message.reply({
        ...payload,
        allowedMentions: { repliedUser: false }
      }),
      update: async payload => {
        if (!message.creatingResponse) {
          throw new Error('No existe el mensaje de confirmación para actualizar.');
        }
        return message.creatingResponse.edit(payload);
      },
      setResponse: response => {
        message.creatingResponse = response;
      }
    });
  }
};
