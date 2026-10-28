const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { beginCreating } = require('../../utils/creatingManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('asistente')
    .setDescription('Alias de /setup: crea una estructura profesional y completa del servidor.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),
  async execute(interaction) {
    await beginCreating({
      guild: interaction.guild,
      member: interaction.member,
      user: interaction.user,
      templateKey: 'comunidad',
      defer: () => interaction.deferReply({ ephemeral: true }),
      respond: payload => interaction.deferred
        ? interaction.editReply(payload)
        : interaction.reply({ ...payload, ephemeral: true }),
      update: payload => interaction.editReply(payload)
    });
  }
};
