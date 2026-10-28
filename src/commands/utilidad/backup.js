const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  AttachmentBuilder
} = require('discord.js');
const fs = require('fs');
const { backupNow, listBackups } = require('../../utils/backupManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('backup')
    .setDescription('Envía un respaldo reciente de la base de datos.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: 'Necesitas permisos de administrador para usar este comando.',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });
    try {
      let [latest] = listBackups();
      if (!latest) {
        await backupNow();
        [latest] = listBackups();
      }
      if (!latest) throw new Error('No se encontró el archivo de respaldo después de generarlo.');

      return interaction.editReply({
        content: 'Aquí tienes el respaldo más reciente de la base de datos.',
        files: [new AttachmentBuilder(fs.createReadStream(latest.path), { name: latest.name })]
      });
    } catch (error) {
      console.error(`[RESPALDO] No se pudo enviar el archivo a ${interaction.user.id}:`, error);
      return interaction.editReply({
        content: '❌ No se pudo crear o enviar el respaldo. Revisa los registros del bot y el espacio disponible.'
      });
    }
  }
};
