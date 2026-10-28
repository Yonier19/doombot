const fs = require('fs');
const path = require('path');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');

const configPath = path.join(__dirname, '../../data/welcome-config.json');
const defaultConfig = {
  channels: { welcome: null, goodbye: null, staff: null, memberLog: null, modLog: null },
  features: {
    welcome: true,
    assignNew: true,
    dmGuide: false,
    antiRaid: true,
    markYoungAccounts: true,
    goodbye: true,
    departureLog: true,
    auditLog: true
  },
  welcomeTitle: '¡Bienvenido a {servidor}!',
  welcomeText: 'Hola {usuario}, nos alegra tenerte aquí. Eres el miembro número **{numero}**. Revisa {reglas} y descubre {roles}.',
  goodbyeText: '{usuario} ha salido de **{servidor}**. Permaneció en el servidor durante {tiempo}.',
  raidModeUntil: 0
};

function cloneDefaults() {
  return JSON.parse(JSON.stringify(defaultConfig));
}

function readAll() {
  try {
    const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('el archivo no contiene un objeto de configuración');
    }
    return data;
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw new Error(`No se pudo leer ${configPath}: ${error.message}`);
  }
}

function getConfig(guildId) {
  const config = { ...cloneDefaults(), ...(readAll()[guildId] || {}) };
  config.channels = { ...defaultConfig.channels, ...(config.channels || {}) };
  config.features = { ...defaultConfig.features, ...(config.features || {}) };
  return config;
}

function updateConfig(guildId, updater) {
  const all = readAll();
  const current = { ...cloneDefaults(), ...(all[guildId] || {}) };
  current.channels = { ...defaultConfig.channels, ...(current.channels || {}) };
  current.features = { ...defaultConfig.features, ...(current.features || {}) };
  const updated = typeof updater === 'function' ? updater(current) || current : updater;
  all[guildId] = updated;
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const temporaryPath = `${configPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(all, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, configPath);
  return getConfig(guildId);
}

function interpolate(text, values) {
  return text.replace(/\{(usuario|servidor|numero|tiempo|reglas|roles)\}/g, (_, key) => values[key] ?? '');
}

function featureButton(label, key, enabled) {
  return new ButtonBuilder()
    .setCustomId(`wcfg:toggle:${key}`)
    .setLabel(`${enabled ? '✅' : '❌'} ${label}`)
    .setStyle(enabled ? ButtonStyle.Success : ButtonStyle.Secondary);
}

function buildPanel(config, guild) {
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('⚙️ Configuración de bienvenida y despedida')
    .setDescription([
      'Los cambios se guardan por servidor y los botones siguen funcionando después de reiniciar el bot.',
      '',
      `**Canal bienvenida:** ${config.channels.welcome ? `<#${config.channels.welcome}>` : 'Automático (#bienvenida)'}`,
      `**Canal despedida:** ${config.channels.goodbye ? `<#${config.channels.goodbye}>` : 'Automático (#despedidas)'}`,
      `**Canal staff:** ${config.channels.staff ? `<#${config.channels.staff}>` : 'Automático (#chat-staff)'}`,
      `**Registro entradas/salidas:** ${config.channels.memberLog ? `<#${config.channels.memberLog}>` : 'Automático (#registro-de-entradas-y-salidas)'}`,
      `**Registro moderación:** ${config.channels.modLog ? `<#${config.channels.modLog}>` : 'Automático (#registro-de-moderación)'}`,
      `**Modo reforzado anti-raid:** ${config.raidModeUntil > Date.now() ? `Activo hasta <t:${Math.floor(config.raidModeUntil / 1000)}:R>` : 'Inactivo'}`
    ].join('\n'))
    .setFooter({ text: `${guild.name} • Solo administradores pueden cambiar este panel.` });

  const featureRows = [
    [
      ['Bienvenida', 'welcome'],
      ['Rol Nuevo', 'assignNew'],
      ['DM guía', 'dmGuide'],
      ['Anti-raid', 'antiRaid']
    ],
    [
      ['Marcar cuentas <7 días', 'markYoungAccounts'],
      ['Despedida', 'goodbye'],
      ['Registro de salida', 'departureLog'],
      ['Consultar audit log', 'auditLog']
    ]
  ].map(items => new ActionRowBuilder().addComponents(
    items.map(([label, key]) => featureButton(label, key, config.features[key]))
  ));

  const welcomeChannel = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('wcfg:channels')
      .setLabel('📍 Configurar canales')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('wcfg:edit')
      .setLabel('✏️ Editar textos')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('wcfg:preview')
      .setLabel('👁️ Vista previa')
      .setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [embed], components: [...featureRows, welcomeChannel] };
}

module.exports = { defaultConfig, getConfig, updateConfig, interpolate, buildPanel };
