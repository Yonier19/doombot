const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('panel-reglas')
    .setDescription('Publica el mensaje de bienvenida y verificación con el botón "📜 Aceptar reglas".')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addChannelOption(option =>
      option
        .setName('canal')
        .setDescription('Canal de reglas (por defecto busca #reglas o usa el canal actual)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    )
    .addRoleOption(option =>
      option
        .setName('rol_miembro')
        .setDescription('Rol que se entregará al aceptar las reglas (por defecto rol "Miembro")')
        .setRequired(false)
    ),

  async execute(interaction) {
    try {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
          content: '⛔ **Acceso denegado:** Solo usuarios con permisos de `Administrador` pueden configurar el panel de reglas.',
          ephemeral: true
        });
      }

      const botMember = interaction.guild.members.me;
      if (!botMember.permissions.has([PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageChannels])) {
        return interaction.reply({
          content: '❌ **Faltan permisos:** El bot requiere los permisos `Gestionar Roles` (`ManageRoles`) y `Gestionar Canales` (`ManageChannels`).',
          ephemeral: true
        });
      }

      let targetRole = interaction.options.getRole('rol_miembro');
      if (!targetRole) {
        targetRole = interaction.guild.roles.cache.find(r =>
          r.name.toLowerCase() === 'miembro' ||
          r.name.toLowerCase().includes('miembro') ||
          r.name.toLowerCase() === 'member'
        );
      }

      if (!targetRole) {
        return interaction.reply({
          content: '⚠️ No se encontró un rol llamado **Miembro** en el servidor. Por favor, especifica uno en la opción `rol_miembro` o créalo previamente con `/asistente`.',
          ephemeral: true
        });
      }

      if (botMember.roles.highest.position <= targetRole.position) {
        return interaction.reply({
          content: `⚠️ **Error de Jerarquía:** El rol del bot (**@${botMember.roles.highest.name}**) está por debajo o al mismo nivel del rol **@${targetRole.name}**. Arrastra el rol del bot por encima de **@${targetRole.name}** en la lista de roles del servidor.`,
          ephemeral: true
        });
      }

      let targetChannel = interaction.options.getChannel('canal');
      if (!targetChannel) {
        targetChannel = interaction.guild.channels.cache.find(c =>
          c.type === ChannelType.GuildText &&
          (c.name.toLowerCase() === 'reglas' || c.name.toLowerCase().includes('regla'))
        ) || interaction.channel;
      }

      const rulesEmbed = new EmbedBuilder()
        .setColor('#2ECC71')
        .setTitle('📜 Normativa de Convivencia y Verificación')
        .setDescription(
          `¡Te damos la bienvenida a **${interaction.guild.name}**! 🎉\\n\\n` +
          `Para mantener un entorno seguro y agradable, es imprescindible respetar las normas oficiales del servidor:\\n\\n` +
          `**1. Respeto mutuo:** Trata a todos los miembros con educación. Queda prohibido el acoso, los discursos de odio o la discriminación de cualquier índole.\\n` +
          `**2. Sin spam ni autopromoción:** No publiques enlaces no solicitados, invitaciones a otros servidores o publicidad en canales públicos o mensajes directos.\\n` +
          `**3. Contenido adecuado:** Comparte contenido en los canales correspondientes a su temática. Prohibido contenido NSFW o explícito fuera de zonas designadas.\\n` +
          `**4. Cumplimiento de ToS:** Respeta las Directivas de la Comunidad y los Términos de Servicio de Discord.\\n` +
          `**5. Instrucciones del Staff:** Sigue las indicaciones del equipo de moderación y administración en todo momento.\\n\\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\n` +
          `🔓 **¿Cómo desbloquear el servidor?**\\n` +
          `Haz clic en el botón verde **"📜 Aceptar reglas"** abajo para verificar tu cuenta y recibir el rol **@${targetRole.name}**, desbloqueando acceso instantáneo a los canales de la comunidad.`
        )
        .setFooter({
          text: `${interaction.guild.name} • Sistema de Verificación Automática`,
          iconURL: interaction.guild.iconURL() || undefined
        })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('reglas:aceptar')
          .setLabel('📜 Aceptar reglas')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('reglas:info')
          .setLabel('❓ ¿Por qué no veo canales?')
          .setStyle(ButtonStyle.Secondary)
      );

      await targetChannel.send({
        embeds: [rulesEmbed],
        components: [row]
      });

      await interaction.reply({
        content: `✅ **Panel de reglas publicado con éxito** en <#${targetChannel.id}>.\\n` +
                 `Los nuevos miembros que pulsen **"📜 Aceptar reglas"** recibirán automáticamente el rol <@&${targetRole.id}>.`,
        ephemeral: true
      });

    } catch (error) {
      console.error('[ERROR] Error en /panel-reglas:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ Ocurrió un error inesperado al publicar el panel de reglas.',
          ephemeral: true
        });
      }
    }
  }
};
