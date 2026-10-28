const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
  GatewayIntentBits
} = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('diagnostico')
    .setDescription('Realiza una auditoría exhaustiva del bot y la configuración de este servidor.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction, client) {
    try {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
          content: '⛔ **Acceso denegado:** Solo usuarios con permisos de `Administrador` pueden ejecutar el diagnóstico del sistema.',
          ephemeral: true
        });
      }

      await interaction.deferReply({ ephemeral: true });

      const guild = interaction.guild;
      const botMember = guild.members.me;

      const reportItems = [];
      const fixes = [];

      // 1. PERMISOS DEL BOT
      const requiredPermissions = [
        { bit: PermissionFlagsBits.ManageChannels, name: 'Gestionar Canales (ManageChannels)' },
        { bit: PermissionFlagsBits.ManageRoles, name: 'Gestionar Roles (ManageRoles)' },
        { bit: PermissionFlagsBits.SendMessages, name: 'Enviar Mensajes (SendMessages)' },
        { bit: PermissionFlagsBits.EmbedLinks, name: 'Insertar Enlaces (EmbedLinks)' },
        { bit: PermissionFlagsBits.ViewChannel, name: 'Ver Canales (ViewChannel)' }
      ];

      const missingPerms = requiredPermissions.filter(p => !botMember.permissions.has(p.bit));
      if (missingPerms.length === 0) {
        reportItems.push({
          title: '1. Permisos del Bot en Servidor',
          status: '✅',
          desc: 'El bot posee todos los permisos necesarios (ManageChannels, ManageRoles, SendMessages, EmbedLinks, ViewChannel).'
        });
      } else {
        reportItems.push({
          title: '1. Permisos del Bot en Servidor',
          status: '❌',
          desc: `Faltan permisos críticos: ${missingPerms.map(p => p.name).join(', ')}.`
        });
        fixes.push(`🔧 **Permisos Faltantes:** Ve a *Ajustes del Servidor > Roles*, selecciona el rol del bot y activa: ${missingPerms.map(p => p.name).join(', ')}.`);
      }

      // 2. JERARQUÍA DE ROLES
      const botRole = botMember.roles.highest;
      const managedRoles = guild.roles.cache.filter(r => !r.managed && r.id !== guild.id);
      const higherRoles = managedRoles.filter(r => r.position >= botRole.position);

      if (higherRoles.size === 0) {
        reportItems.push({
          title: '2. Jerarquía de Roles',
          status: '✅',
          desc: `El rol del bot (**@${botRole.name}**, pos \`${botRole.position}\`) está por encima de todos los roles configurables.`
        });
      } else {
        const sampleHigher = higherRoles.map(r => `@${r.name} (pos \`${r.position}\`)`).slice(0, 3).join(', ');
        reportItems.push({
          title: '2. Jerarquía de Roles',
          status: '⚠️',
          desc: `El rol del bot está en pos \`${botRole.position}\`. Hay **${higherRoles.size}** rol(es) por encima que no podrá gestionar (ej: ${sampleHigher}).`
        });
        fixes.push(`🔧 **Jerarquía:** Ve a *Ajustes del Servidor > Roles* y arrastra el rol del bot (**@${botRole.name}**) lo más arriba posible.`);
      }

      // 3. INTENTS DEL CLIENTE
      const clientIntents = client.options.intents;
      const hasGuildMembers = (typeof clientIntents === 'object' && 'has' in clientIntents)
        ? clientIntents.has(GatewayIntentBits.GuildMembers)
        : Boolean(Number(clientIntents) & GatewayIntentBits.GuildMembers);

      if (hasGuildMembers) {
        reportItems.push({
          title: '3. Privileged Gateway Intents',
          status: '✅',
          desc: 'Intent `GuildMembers` activo para detección de nuevos miembros y bienvenidas.'
        });
      } else {
        reportItems.push({
          title: '3. Privileged Gateway Intents',
          status: '❌',
          desc: 'Falta el intent privilegiado `GuildMembers` en la inicialización del cliente.'
        });
        fixes.push('🔧 **Intents:** En el archivo `src/index.js`, añade `GatewayIntentBits.GuildMembers` a los intents del cliente y actívalo en el Developer Portal.');
      }

      // 4. PLANTILLAS JSON
      let templatesValid = true;
      let templateErrorMsg = '';
      try {
        const templatesPath = path.join(__dirname, '../../config/templates.json');
        if (!fs.existsSync(templatesPath)) {
          templatesValid = false;
          templateErrorMsg = 'Archivo `src/config/templates.json` no encontrado en el sistema.';
        } else {
          const raw = fs.readFileSync(templatesPath, 'utf8');
          const parsed = JSON.parse(raw);
          const tplKeys = Object.keys(parsed);

          if (tplKeys.length === 0) {
            templatesValid = false;
            templateErrorMsg = 'El archivo `templates.json` está vacío.';
          } else {
            for (const key of tplKeys) {
              const tpl = parsed[key];
              if (!tpl.nombre || !Array.isArray(tpl.roles) || !Array.isArray(tpl.categorias)) {
                templatesValid = false;
                templateErrorMsg = `Estructura inválida en plantilla '${key}'.`;
                break;
              }
              for (const r of tpl.roles) {
                if (r.nombre.length > 100) {
                  templatesValid = false;
                  templateErrorMsg = `Nombre de rol excede 100 caracteres en plantilla '${key}': ${r.nombre}`;
                  break;
                }
              }
              for (const cat of tpl.categorias) {
                if (cat.nombre.length > 100) {
                  templatesValid = false;
                  templateErrorMsg = `Nombre de categoría excede 100 caracteres: ${cat.nombre}`;
                  break;
                }
              }
            }
          }
        }
      } catch (err) {
        templatesValid = false;
        templateErrorMsg = err.message;
      }

      if (templatesValid) {
        reportItems.push({
          title: '4. Plantillas JSON',
          status: '✅',
          desc: 'Estructura JSON válida, sin nombres que excedan límites de Discord (100 caracteres).'
        });
      } else {
        reportItems.push({
          title: '4. Plantillas JSON',
          status: '❌',
          desc: `Error en templates: ${templateErrorMsg}`
        });
        fixes.push(`🔧 **Templates:** Revisa y corrige el archivo \`src/config/templates.json\`: ${templateErrorMsg}`);
      }

      // 5. ESPACIO DISPONIBLE
      const currentChannels = guild.channels.cache.size;
      const maxChannels = 500;
      const channelsLeft = maxChannels - currentChannels;

      const currentRoles = guild.roles.cache.size;
      const maxRoles = 250;
      const rolesLeft = maxRoles - currentRoles;

      const channelsStatus = channelsLeft > 30 ? '✅' : channelsLeft > 10 ? '⚠️' : '❌';
      const rolesStatus = rolesLeft > 20 ? '✅' : rolesLeft > 5 ? '⚠️' : '❌';

      reportItems.push({
        title: '5. Capacidad y Límites de la API',
        status: (channelsStatus === '✅' && rolesStatus === '✅') ? '✅' : '⚠️',
        desc: `• Canales: **${currentChannels} / ${maxChannels}** (${channelsLeft} disponibles) ${channelsStatus}\\n• Roles: **${currentRoles} / ${maxRoles}** (${rolesLeft} disponibles) ${rolesStatus}`
      });

      if (channelsStatus !== '✅') {
        fixes.push(`🔧 **Límite Canales:** Te quedan solo ${channelsLeft} canales antes de alcanzar el tope de 500 de Discord.`);
      }
      if (rolesStatus !== '✅') {
        fixes.push(`🔧 **Límite Roles:** Te quedan solo ${rolesLeft} roles antes de alcanzar el tope de 250 de Discord.`);
      }

      // 6. MÓDULOS DE BIENVENIDA Y VERIFICACIÓN
      const memberRole = guild.roles.cache.find(r =>
        r.name.toLowerCase() === 'miembro' ||
        r.name.toLowerCase().includes('miembro') ||
        r.name.toLowerCase() === 'member'
      );

      const rulesChannel = guild.channels.cache.find(c =>
        c.type === ChannelType.GuildText && (c.name.includes('reglas') || c.name.includes('rules'))
      );

      const welcomeChannel = guild.channels.cache.find(c =>
        c.type === ChannelType.GuildText && (c.name.includes('bienvenida') || c.name.includes('welcome'))
      );

      if (memberRole && (rulesChannel || welcomeChannel)) {
        reportItems.push({
          title: '6. Módulos de Verificación y Bienvenida',
          status: '✅',
          desc: `• Rol Miembro: <@&${memberRole.id}>\\n• Canal Reglas: ${rulesChannel ? `<#${rulesChannel.id}>` : '*No detectado*'} persona\\n• Canal Bienvenida: ${welcomeChannel ? `<#${welcomeChannel.id}>` : '*No detectado*'}`
        });
      } else {
        const missing = [];
        if (!memberRole) missing.push('Rol \`Miembro\`');
        if (!rulesChannel && !welcomeChannel) missing.push('Canal \`#reglas\` o \`#bienvenida\`');

        reportItems.push({
          title: '6. Módulos de Verificación y Bienvenida',
          status: '⚠️',
          desc: `Faltan elementos para el flujo de verificación: ${missing.join(', ')}.`
        });
        fixes.push(`🔧 **Módulos:** Ejecuta \`/asistente\` o \`/panel-reglas\` para crear automáticamente el canal de reglas y el rol Miembro.`);
      }

      // 7. LATENCIA
      const wsPing = client.ws.ping;
      const apiPing = Date.now() - interaction.createdTimestamp;
      const latencyStatus = wsPing < 200 ? '✅' : wsPing < 450 ? '⚠️' : '❌';

      reportItems.push({
        title: '7. Latencia y Conexión',
        status: latencyStatus,
        desc: `• WebSocket Ping: **${wsPing}ms**\\n• Roundtrip REST API: **${Math.abs(apiPing)}ms**\\n• Estado Gateway: **Conectado y Operativo**`
      });

      const diagnosticEmbed = new EmbedBuilder()
        .setColor(fixes.length === 0 ? '#2ECC71' : fixes.some(f => f.includes('❌')) ? '#ED4245' : '#F1C40F')
        .setTitle('🩺 Informe Integral de Autodiagnóstico del Bot')
        .setDescription(
          `Auditoría realizada en **${guild.name}** (\`${guild.id}\`).\\n` +
          `Resultado: **${reportItems.filter(i => i.status === '✅').length} superadas**, **${reportItems.filter(i => i.status === '⚠️').length} advertencias**, **${reportItems.filter(i => i.status === '❌').length} errores críticos**.`
        )
        .addFields(
          reportItems.map(item => ({
            name: `${item.status} ${item.title}`,
            value: item.desc,
            inline: false
          }))
        )
        .setFooter({ text: `Auditoría ejecutada por: ${interaction.user.tag}` })
        .setTimestamp();

      if (fixes.length > 0) {
        diagnosticEmbed.addFields({
          name: '🛠️ Guía Rápida de Soluciones Recomendadas',
          value: fixes.slice(0, 5).join('\\n\\n'),
          inline: false
        });
      }

      await interaction.editReply({
        embeds: [diagnosticEmbed]
      });

    } catch (error) {
      console.error('[ERROR] Error en comando /diagnostico:', error);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: '❌ Ocurrió un error inesperado al procesar el diagnóstico del sistema.'
        });
      } else {
        await interaction.reply({
          content: '❌ Ocurrió un error inesperado al procesar el diagnóstico del sistema.',
          ephemeral: true
        });
      }
    }
  }
};
