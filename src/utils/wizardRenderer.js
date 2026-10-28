const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} = require('discord.js');
const templates = require('../config/templates.json');

const AVAILABLE_MODULES = [
  { value: 'musica', label: 'Canales de Música', emoji: '🎵', desc: 'Comandos y salas dedicadas a música' },
  { value: 'sorteos', label: 'Sorteos y Eventos', emoji: '🎉', desc: 'Canal para rifas, sorteos y premios' },
  { value: 'tickets', label: 'Sistema de Tickets', emoji: '🎫', desc: 'Canal de soporte y apertura de tickets' },
  { value: 'memes', label: 'Memes y Humor', emoji: '🤣', desc: 'Zona multimedia para memes de la comunidad' },
  { value: 'voz_temporal', label: 'Canales de Voz Temporal', emoji: '🔊', desc: 'Salas de voz dinámicas autogestionadas' }
];

function renderWizardStep(guildId, userId, state, guild) {
  const currentStep = state.step || 1;

  // PASO 1: ELEGIR PLANTILLA
  if (currentStep === 1) {
    const selectedTemplate = templates[state.template] || templates.comunidad;

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('🚀 Asistente de Configuración - Paso 1: Elegir Plantilla')
      .setDescription(
        'Selecciona la plantilla base para tu servidor en el menú desplegable inferior.\n' +
        'Cada plantilla incluye información, comunidad, bots, música, voz, soporte, staff privado y canales extra adaptados a su temática.'
      )
      .addFields(
        {
          name: '📌 Plantilla Seleccionada Actualmente',
          value: `**${selectedTemplate.nombre}**\n${selectedTemplate.descripcion}\n\n**Estructura:** ${selectedTemplate.categorias.length} categorías, ${selectedTemplate.categorias.reduce((count, category) => count + category.canales.length, 0)} canales y ${selectedTemplate.roles.length} roles.`,
          inline: false
        }
      )
      .setFooter({ text: 'Paso 1 de 5: Selección de Plantilla • Estado conservado en memoria' })
      .setTimestamp();

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`wizard:template:select:${userId}`)
      .setPlaceholder('Haz clic aquí para seleccionar una plantilla...')
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setValue('comunidad')
          .setLabel('Comunidad')
          .setDescription('Social, creadores de contenido y charlas')
          .setEmoji('🌐')
          .setDefault(state.template === 'comunidad'),
        new StringSelectMenuOptionBuilder()
          .setValue('gaming')
          .setLabel('Gaming')
          .setDescription('Clanes, torneos y salas de escuadras')
          .setEmoji('🎮')
          .setDefault(state.template === 'gaming'),
        new StringSelectMenuOptionBuilder()
          .setValue('estudio')
          .setLabel('Estudio')
          .setDescription('Academias, biblioteca silenciosa y tutorías')
          .setEmoji('📚')
          .setDefault(state.template === 'estudio'),
        new StringSelectMenuOptionBuilder()
          .setValue('tienda')
          .setLabel('Tienda/Soporte')
          .setDescription('Ventas, tickets de atención y catálogo')
          .setEmoji('🛒')
          .setDefault(state.template === 'tienda')
      );

    const menuRow = new ActionRowBuilder().addComponents(selectMenu);

    const buttonRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`wizard:step:2:${userId}`)
        .setLabel('Siguiente')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('➡️'),
      new ButtonBuilder()
        .setCustomId(`wizard:cancel:${userId}`)
        .setLabel('Cancelar Asistente')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌')
    );

    return { embeds: [embed], components: [menuRow, buttonRow] };
  }

  // PASO 2: ELEGIR MÓDULOS OPCIONALES
  if (currentStep === 2) {
    const activeModuleLabels = state.modules.length > 0
      ? state.modules.map(m => {
          const found = AVAILABLE_MODULES.find(am => am.value === m);
          return found ? `${found.emoji} **${found.label}**` : `• ${m}`;
        }).join('\n')
      : '*Ningún módulo opcional seleccionado*';

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('📦 Asistente de Configuración - Paso 2: Módulos Opcionales')
      .setDescription(
        'Elige qué canales y funciones extra deseas incorporar a tu servidor.\n' +
        'Puedes seleccionar múltiples opciones en el menú desplegable (o deseleccionar todas si prefieres una configuración minimalista).'
      )
      .addFields(
        {
          name: '✨ Módulos Activos en este Momento',
          value: activeModuleLabels,
          inline: false
        }
      )
      .setFooter({ text: 'Paso 2 de 5: Módulos Opcionales • El botón Atrás conserva lo elegido' })
      .setTimestamp();

    const multiSelect = new StringSelectMenuBuilder()
      .setCustomId(`wizard:modules:select:${userId}`)
      .setPlaceholder('Selecciona los módulos opcionales...')
      .setMinValues(0)
      .setMaxValues(AVAILABLE_MODULES.length)
      .addOptions(
        AVAILABLE_MODULES.map(mod =>
          new StringSelectMenuOptionBuilder()
            .setValue(mod.value)
            .setLabel(mod.label)
            .setDescription(mod.desc)
            .setEmoji(mod.emoji)
            .setDefault(state.modules.includes(mod.value))
        )
      );

    const menuRow = new ActionRowBuilder().addComponents(multiSelect);

    const buttonRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`wizard:step:1:${userId}`)
        .setLabel('Atrás')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⬅️'),
      new ButtonBuilder()
        .setCustomId(`wizard:step:3:${userId}`)
        .setLabel('Siguiente')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('➡️'),
      new ButtonBuilder()
        .setCustomId(`wizard:cancel:${userId}`)
        .setLabel('Cancelar')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌')
    );

    return { embeds: [embed], components: [menuRow, buttonRow] };
  }

  // PASO 3: ROLES BASE (INTERRUPTORES)
  if (currentStep === 3) {
    const rolesStatus = [
      `• **Admin:** ${state.roles.admin ? '✅ Activado' : '❌ Desactivado'}`,
      `• **Moderador:** ${state.roles.moderador ? '✅ Activado' : '❌ Desactivado'}`,
      `• **Miembro:** ${state.roles.miembro ? '✅ Activado (Auto-Rol)' : '❌ Desactivado'}`,
      `• **Silenciado:** ${state.roles.silenciado ? '✅ Activado' : '❌ Desactivado'}`,
      `• **VIP:** ${state.roles.vip ? '✅ Activado' : '❌ Desactivado'}`
    ].join('\n');

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('🎭 Asistente de Configuración - Paso 3: Roles Base')
      .setDescription(
        'Pulsa los botones interactivos para activar (✅) o desactivar (❌) los roles que se crearán y configurarán con permisos en tu servidor.'
      )
      .addFields(
        {
          name: '⚙️ Estado de Roles',
          value: rolesStatus,
          inline: false
        }
      )
      .setFooter({ text: 'Paso 3 de 5: Roles Base del Servidor • Presiona cada botón para conmutar' })
      .setTimestamp();

    const toggleRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`wizard:toggle:admin:${userId}`)
        .setLabel(`Admin ${state.roles.admin ? '✅' : '❌'}`)
        .setStyle(state.roles.admin ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`wizard:toggle:moderador:${userId}`)
        .setLabel(`Mod ${state.roles.moderador ? '✅' : '❌'}`)
        .setStyle(state.roles.moderador ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`wizard:toggle:miembro:${userId}`)
        .setLabel(`Miembro ${state.roles.miembro ? '✅' : '❌'}`)
        .setStyle(state.roles.miembro ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`wizard:toggle:silenciado:${userId}`)
        .setLabel(`Silenciado ${state.roles.silenciado ? '✅' : '❌'}`)
        .setStyle(state.roles.silenciado ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`wizard:toggle:vip:${userId}`)
        .setLabel(`VIP ${state.roles.vip ? '✅' : '❌'}`)
        .setStyle(state.roles.vip ? ButtonStyle.Success : ButtonStyle.Secondary)
    );

    const navRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`wizard:step:2:${userId}`)
        .setLabel('Atrás')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⬅️'),
      new ButtonBuilder()
        .setCustomId(`wizard:step:4:${userId}`)
        .setLabel('Siguiente')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('➡️'),
      new ButtonBuilder()
        .setCustomId(`wizard:cancel:${userId}`)
        .setLabel('Cancelar')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌')
    );

    return { embeds: [embed], components: [toggleRow, navRow] };
  }

  // PASO 4: PERSONALIZAR (MODAL)
  if (currentStep === 4) {
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('✏️ Asistente de Configuración - Paso 4: Personalización')
      .setDescription(
        'Puedes personalizar el nombre del servidor, el prefijo decorativo para las categorías y un emoji temático.\n' +
        'Haz clic en el botón **"✏️ Personalizar nombres"** para abrir el formulario modal.'
      )
      .addFields(
        {
          name: '🏷️ Nombre del Servidor',
          value: state.custom.serverName || `*Sin cambios* (\`${guild ? guild.name : 'Servidor Actual'}\`)`,
          inline: true
        },
        {
          name: '📂 Prefijo de Categorías',
          value: `\`${state.custom.categoryPrefix || '📁'}\``,
          inline: true
        },
        {
          name: '✨ Emoji Decorativo',
          value: `${state.custom.decorativeEmoji || '⚡'}`,
          inline: true
        }
      )
      .setFooter({ text: 'Paso 4 de 5: Personalización de Nombres y Estilo' })
      .setTimestamp();

    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`wizard:modal:open:${userId}`)
        .setLabel('Personalizar nombres')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✏️')
    );

    const navRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`wizard:step:3:${userId}`)
        .setLabel('Atrás')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⬅️'),
      new ButtonBuilder()
        .setCustomId(`wizard:step:5:${userId}`)
        .setLabel('Siguiente')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('➡️'),
      new ButtonBuilder()
        .setCustomId(`wizard:cancel:${userId}`)
        .setLabel('Cancelar')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌')
    );

    return { embeds: [embed], components: [actionRow, navRow] };
  }

  // PASO 5: RESUMEN FINAL
  const tpl = templates[state.template] || templates.comunidad;

  const activeRoles = Object.entries(state.roles)
    .filter(([, active]) => active)
    .map(([r]) => `• ${r.toUpperCase()}`)
    .join('\n') || 'Ninguno';

  const activeModules = state.modules.length > 0
    ? state.modules.map(m => {
        const found = AVAILABLE_MODULES.find(am => am.value === m);
        return found ? `• ${found.emoji} ${found.label}` : `• ${m}`;
      }).join('\n')
    : 'Ninguno (Solo plantilla base)';

  const embed = new EmbedBuilder()
    .setColor('#57F287')
    .setTitle('📋 Asistente de Configuración - Paso 5: Resumen Final')
    .setDescription(
      'Revisa cuidadosamente la configuración que has diseñado antes de ejecutar la creación.\n' +
      'Puedes pulsar **⬅️ Atrás** en cualquier momento para modificar cualquier sección conservando tus selecciones.'
    )
    .addFields(
      {
        name: '🌐 Plantilla Elegida',
        value: `**${tpl.nombre}**\n${tpl.descripcion}`,
        inline: false
      },
      {
        name: '📦 Módulos Opcionales Incluidos',
        value: activeModules,
        inline: true
      },
      {
        name: '🎭 Roles Base a Crear',
        value: activeRoles,
        inline: true
      },
      {
        name: '🎨 Estilo y Nombres',
        value: [
          `• **Nombre servidor:** ${state.custom.serverName || '(Mantener actual)'}`,
          `• **Prefijo categorías:** \`${state.custom.categoryPrefix || '📁'}\``,
          `• **Emoji decorativo:** ${state.custom.decorativeEmoji || '⚡'}`
        ].join('\n'),
        inline: false
      },
      {
        name: '🛡️ Garantía de Integridad',
        value: '• Los canales y roles que ya existan serán **omitidos sin duplicarse**.\n• Se aplicarán pausas automáticas de 850ms contra Rate Limits.',
        inline: false
      }
    )
    .setFooter({ text: 'Paso 5 de 5: Resumen y Confirmación Final' })
    .setTimestamp();

  const finalRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`wizard:confirm:${userId}`)
      .setLabel('Confirmar e Iniciar')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅'),
    new ButtonBuilder()
      .setCustomId(`wizard:step:4:${userId}`)
      .setLabel('Atrás')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('⬅️'),
    new ButtonBuilder()
      .setCustomId(`wizard:cancel:${userId}`)
      .setLabel('Cancelar')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌')
  );

  return { embeds: [embed], components: [finalRow] };
}

module.exports = {
  renderWizardStep,
  AVAILABLE_MODULES
};
