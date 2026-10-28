const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { beginCreating } = require('../../utils/creatingManager');
const templates = require('../../config/templateLoader');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Abre el asistente para crear una estructura profesional de servidor.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addStringOption(option => option
      .setName('plantilla')
      .setDescription('Elige el perfil inicial; todos incluyen la estructura modular completa.')
      .setRequired(false)
      .addChoices(...Object.entries(templates).map(([value, template]) => ({
        name: template.nombre,
        value
      })))),

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
  }
};
