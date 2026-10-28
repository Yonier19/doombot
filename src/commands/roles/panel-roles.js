const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType
} = require('discord.js');
const { isProtectedRole, hasForbiddenPermissions } = require('../../utils/rankRoles');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('panel-roles')
    .setDescription('Publica un panel interactivo con botones persistentes para auto-asignarse roles.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false)
    .addRoleOption(option =>
      option
        .setName('rol1')
        .setDescription('Primer rol asignable (Obligatorio)')
        .setRequired(true)
    )
    .addRoleOption(option =>
      option
        .setName('rol2')
        .setDescription('Segundo rol asignable (Opcional)')
        .setRequired(false)
    )
    .addRoleOption(option =>
      option
        .setName('rol3')
        .setDescription('Tercer rol asignable (Opcional)')
        .setRequired(false)
    )
    .addRoleOption(option =>
      option
        .setName('rol4')
        .setDescription('Cuarto rol asignable (Opcional)')
        .setRequired(false)
    )
    .addRoleOption(option =>
      option
        .setName('rol5')
        .setDescription('Quinto rol asignable (Opcional)')
        .setRequired(false)
    )
    .addChannelOption(option =>
      option
        .setName('canal')
        .setDescription('Canal donde publicar el panel (por defecto el canal actual)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('titulo')
        .setDescription('Título personalizado para el panel de roles')
        .setRequired(false)
        .setMaxLength(100)
    )
    .addStringOption(option =>
      option
        .setName('descripcion')
        .setDescription('Descripción explicativa del panel de roles')
        .setRequired(false)
        .setMaxLength(500)
    )
    .addStringOption(option =>
      option
        .setName('estilo')
        .setDescription('Color/estilo de los botones')
        .setRequired(false)
        .addChoices(
          { name: 'Azul (Primary)', value: 'Primary' },
          { name: 'Gris (Secondary)', value: 'Secondary' },
          { name: 'Verde (Success)', value: 'Success' },
          { name: 'Rojo (Danger)', value: 'Danger' }
        )
    ),

  async execute(interaction) {
    try {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return interaction.reply({
          content: '⛔ **Acceso denegado:** Se requiere el permiso `Gestionar Roles` (`ManageRoles`) para crear paneles de roles.',
          ephemeral: true
        });
      }

      const botMember = interaction.guild.members.me;
      if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return interaction.reply({
          content: '❌ **Faltan permisos del bot:** El bot necesita el permiso `Gestionar Roles` (`ManageRoles`) en el servidor para asignar y retirar roles.',
          ephemeral: true
        });
      }

      const rolesInput = [];
      for (let i = 1; i <= 5; i++) {
        const role = interaction.options.getRole(`rol${i}`);
        if (role) rolesInput.push(role);
      }

      if (rolesInput.length === 0) {
        return interaction.reply({
          content: '⚠️ Debes especificar al menos un rol válido.',
          ephemeral: true
        });
      }

      const uniqueRoles = [];
      const seenIds = new Set();
      for (const r of rolesInput) {
        if (!seenIds.has(r.id)) {
          seenIds.add(r.id);
          uniqueRoles.push(r);
        }
      }

      // VALIDACIONES DE SEGURIDAD ESTRICTAS
      for (const r of uniqueRoles) {
        if (isProtectedRole(interaction.guild.id, r)) {
          return interaction.reply({
            content: `🛡️ El rol **@${r.name}** es manual o pertenece al sistema de rangos. Los botones solo pueden asignar roles de color o intereses.`,
            ephemeral: true
          });
        }

        // Regla 5: Ningún botón de rol puede otorgar roles con permisos de administración
        const hasAdmin = hasForbiddenPermissions(r);

        if (hasAdmin) {
          return interaction.reply({
            content: `🛡️ **Bloqueo de Seguridad:** El rol **@${r.name}** tiene permisos administrativos o de moderación crítica. Por protección del servidor, **ningún botón interactivo puede otorgar roles de administración**.`,
            ephemeral: true
          });
        }

        // Regla 3: Verifica que el rol del bot esté por encima del rol que se asigna
        if (botMember.roles.highest.position <= r.position) {
          return interaction.reply({
            content: `⚠️ **Error de Jerarquía de Roles:**\\n` +
              `El rol más alto del bot (**@${botMember.roles.highest.name}**, posición \`${botMember.roles.highest.position}\`) está **por debajo o al mismo nivel** que el rol **@${r.name}** (posición \`${r.position}\`).\\n\\n` +
              `👉 **Solución:** Ve a *Ajustes del Servidor > Roles* y arrastra el rol del bot por encima de **@${r.name}** para que pueda asignarlo a los miembros.`,
            ephemeral: true
          });
        }

        if (r.managed) {
          return interaction.reply({
            content: `❌ El rol **@${r.name}** es administrado automáticamente por una integración o bot externo y no puede asignarse manualmente.`,
            ephemeral: true
          });
        }

        if (r.id === interaction.guild.id) {
          return interaction.reply({
            content: '❌ No se puede crear un botón para el rol base `@everyone`.',
            ephemeral: true
          });
        }
      }

      const targetChannel = interaction.options.getChannel('canal') || interaction.channel;
      const customTitle = interaction.options.getString('titulo') || '🎭 Roles Auto-Asignables';
      const customDesc = interaction.options.getString('descripcion') ||
        'Haz clic en los botones inferiores para **asignarte** o **quitarte** los roles correspondientes.\\nCada botón actúa como un interruptor instantáneo.';

      const styleChoice = interaction.options.getString('estilo') || 'Primary';
      const buttonStyle = ButtonStyle[styleChoice] || ButtonStyle.Primary;

      const actionRow = new ActionRowBuilder();
      for (const r of uniqueRoles) {
        actionRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`rol:${r.id}`)
            .setLabel(r.name)
            .setStyle(buttonStyle)
        );
      }

      const roleListFormatted = uniqueRoles.map(r => `• <@&${r.id}>`).join('\\n');

      const panelEmbed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(customTitle)
        .setDescription(`${customDesc}\\n\\n**Roles disponibles en este panel:**\\n${roleListFormatted}`)
        .setFooter({
          text: `${interaction.guild.name} • Sistema de Roles Persistente`,
          iconURL: interaction.guild.iconURL() || undefined
        })
        .setTimestamp();

      await targetChannel.send({
        embeds: [panelEmbed],
        components: [actionRow]
      });

      await interaction.reply({
        content: `✅ **Panel de roles publicado con éxito** en <#${targetChannel.id}> con **${uniqueRoles.length}** rol(es) configurado(s).`,
        ephemeral: true
      });

    } catch (error) {
      console.error('[ERROR] Excepción en /panel-roles:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ Ocurrió un error inesperado al publicar el panel de roles.',
          ephemeral: true
        });
      }
    }
  }
};
