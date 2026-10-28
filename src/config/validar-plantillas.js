const fs = require('fs');
const path = require('path');
const { ChannelType, PermissionFlagsBits } = require('discord.js');

const configPath = __dirname;
const base = JSON.parse(fs.readFileSync(path.join(configPath, 'base.json'), 'utf8'));
const interests = JSON.parse(fs.readFileSync(path.join(configPath, 'intereses.json'), 'utf8'));
const categoryDirectory = path.join(configPath, 'categorias');
const categoryFiles = fs.readdirSync(categoryDirectory)
  .filter(file => file.endsWith('.json'))
  .sort();
const categories = categoryFiles.map(file =>
  JSON.parse(fs.readFileSync(path.join(categoryDirectory, file), 'utf8'))
);

const errors = [];
const warnings = [];
const roleKeys = new Set(base.roles.map(role => role.key));
const categoryKeys = new Set();
const categoryNames = new Set();
const channelNames = new Map();
const allowedTypes = new Set(['text', 'voice', 'forum', 'announcement', 'stage']);
const automaticForbidden = [
  'Administrator', 'ManageRoles', 'ManageChannels', 'ManageGuild', 'ManageWebhooks',
  'KickMembers', 'BanMembers', 'ModerateMembers'
];
const expectedChannelTypes = {
  text: ChannelType.GuildText,
  voice: ChannelType.GuildVoice,
  forum: ChannelType.GuildForum,
  announcement: ChannelType.GuildAnnouncement,
  stage: ChannelType.GuildStageVoice
};

function error(where, message) {
  errors.push({ estado: '❌', donde: where, resultado: message });
}

function warning(where, message) {
  warnings.push({ estado: '⚠️', donde: where, resultado: message });
}

function validate({ print = require.main === module } = {}) {
  errors.length = 0;
  warnings.length = 0;
  categoryKeys.clear();
  categoryNames.clear();
  channelNames.clear();
  const totalChannels = categories.reduce((count, category) =>
    count + category.canales.length, 0);
  if (categories.length < 35 || categories.length > 40) {
    error('Categorías', `Debe haber de 35 a 40; hay ${categories.length}.`);
  }
  if (totalChannels > 400) {
    error('Total de canales', `Hay ${totalChannels}; el máximo del diseño es 400.`);
  }
  if (totalChannels < 300) {
    error('Total de canales', `Hay ${totalChannels}; el mínimo solicitado es 300.`);
  }

  for (const role of base.roles) {
    if (!role.key || !role.nombre || !Array.isArray(role.permisos)) {
      error('Roles', `Definición inválida: ${JSON.stringify(role)}.`);
    }
    if ((role.automatic || role.selfAssignable) &&
        role.permisos.some(permission => automaticForbidden.includes(permission))) {
      error(`Rol ${role.nombre}`, 'Un rol automático o autoasignable incluye permisos privilegiados.');
    }
    if (role.permisos.some(permission => !Object.prototype.hasOwnProperty.call(PermissionFlagsBits, permission))) {
      error(`Rol ${role.nombre}`, 'Incluye un nombre de permiso de Discord desconocido.');
    }
  }

  for (const [index, category] of categories.entries()) {
    const where = `Categoría ${category.nombre || index + 1}`;
    if (!category.key || categoryKeys.has(category.key)) {
      error(where, `Clave de categoría vacía o duplicada: ${category.key}.`);
    }
    categoryKeys.add(category.key);
    const normalizedCategoryName = category.nombre.toLocaleLowerCase();
    if (categoryNames.has(normalizedCategoryName)) error(where, 'Nombre de categoría duplicado.');
    categoryNames.add(normalizedCategoryName);
    if (!/^[^a-z]*[A-ZÁÉÍÓÚÜÑ]/u.test(category.nombre)) {
      error(where, 'El nombre debe incluir emoji y estar en mayúsculas.');
    }
    if (category.nombre.length > 100) error(where, 'El nombre supera 100 caracteres.');
    if (!Array.isArray(category.canales)) {
      error(where, 'Falta la lista de canales.');
      continue;
    }
    if (category.canales.length < 7) {
      error(where, `Tiene ${category.canales.length} canales; el mínimo es 7.`);
    }
    if (category.canales.length > 25 && category.canales.length <= 50) {
      warning(where, `Tiene ${category.canales.length} canales; el máximo recomendado es 25.`);
    }
    if (category.canales.length > 50) {
      error(where, `Tiene ${category.canales.length} canales; el límite de Discord es 50.`);
    }
    const audience = category.permisos?.audience;
    if (!['member', 'gaming', 'art', 'programming', 'anime', 'sports', 'music', 'study', 'technology', 'vip', 'staff'].includes(audience)) {
      error(where, `Audiencia no reconocida: ${audience}.`);
    }
    const roleForAudience = {
      member: 'member',
      gaming: 'interest_gaming',
      art: 'interest_art',
      programming: 'interest_programming',
      anime: 'interest_anime',
      sports: 'interest_sports',
      music: 'interest_music',
      study: 'interest_study',
      technology: 'interest_technology',
      vip: 'booster',
      staff: 'admin'
    }[audience];
    if (roleForAudience && !roleKeys.has(roleForAudience)) {
      error(where, `El rol de audiencia ${roleForAudience} no existe en base.json.`);
    }
    if (category.privado && audience === 'everyone') {
      error(where, '@everyone puede ver una categoría marcada como privada.');
    }

    for (const channel of category.canales) {
      const channelWhere = `${where} / ${channel.nombre}`;
      if (!channel.key || !channel.nombre || channel.nombre.length > 100) {
        error(channelWhere, 'Nombre/clave vacíos o nombre con más de 100 caracteres.');
      }
      if (!/^[^a-z]*[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(channel.nombre.replace(/^[^・]*・/u, ''))) {
        error(channelWhere, 'El nombre debe usar emoji・minúsculas-con-guiones.');
      }
      if (!allowedTypes.has(channel.tipo)) {
        error(channelWhere, `Tipo de canal no reconocido: ${channel.tipo}.`);
      }
      if (channel.tema.length > 1024) error(channelWhere, 'El tema supera 1024 caracteres.');
      if (channel.tema.length === 0) error(channelWhere, 'Falta el tema descriptivo.');
      if (!Number.isInteger(channel.slowmode) || channel.slowmode < 0 || channel.slowmode > 21600) {
        error(channelWhere, 'El slowmode debe ser un entero entre 0 y 21600 segundos.');
      }
      if (!channel.permisos || channel.permisos.audience !== audience) {
        error(channelWhere, 'Los permisos del canal no coinciden con la audiencia de su categoría.');
      }
      if (channel.permisos?.audience &&
          !['member', 'gaming', 'art', 'programming', 'anime', 'sports', 'music', 'study', 'technology', 'vip', 'staff'].includes(channel.permisos.audience)) {
        error(channelWhere, `Audiencia de canal no reconocida: ${channel.permisos.audience}.`);
      }
      if (!channel.nombre.includes('・')) error(channelWhere, 'Falta el separador emoji・.');
      if (channel.permisos?.audience === 'everyone') {
        error(channelWhere, '@everyone está configurado como audiencia permitida.');
      }
      if (channel.tipo === 'forum' && !channel.forum) {
        error(channelWhere, 'Los foros requieren opciones de foro.');
      }
      if (channel.tipo === 'announcement' &&
          expectedChannelTypes.announcement !== ChannelType.GuildAnnouncement) {
        error(channelWhere, 'El tipo de anuncio no coincide con discord.js.');
      }
      const normalized = channel.nombre.toLocaleLowerCase();
      const prior = channelNames.get(normalized);
      if (prior) error(channelWhere, `Nombre duplicado también usado en ${prior}.`);
      else channelNames.set(normalized, where);
    }
  }

  for (const interest of interests.interests) {
    if (!roleKeys.has(interest.roleKey)) {
      error(`Interés ${interest.key}`, `No existe el rol ${interest.roleKey}.`);
    }
    for (const categoryKey of interest.categories) {
      if (!categoryKeys.has(categoryKey)) {
        error(`Interés ${interest.key}`, `No existe la categoría ${categoryKey}.`);
      }
    }
  }

  for (const category of categories) {
    if (category.permisos?.audience === 'staff' &&
        (!category.privado || category.permisos.private !== true)) {
      error(`Categoría ${category.nombre}`, 'La categoría staff debe bloquear la visibilidad de @everyone.');
    }
    if (category.permisos?.audience === 'vip' &&
        (!category.privado || category.permisos.private !== true)) {
      error(`Categoría ${category.nombre}`, 'La categoría VIP debe ser privada para los demás roles.');
    }
  }

  const rows = [
    { estado: categories.length >= 35 && categories.length <= 40 ? '✅' : '❌', donde: 'Categorías', resultado: `${categories.length} categorías (35–40).` },
    { estado: totalChannels >= 300 && totalChannels <= 400 ? '✅' : '❌', donde: 'Canales', resultado: `${totalChannels} canales (300–400).` },
    ...warnings,
    ...errors
  ];
  if (print) console.table(rows);
  return { valid: errors.length === 0, errors, warnings, categories, totalChannels };
}

if (require.main === module) {
  const result = validate();
  if (!result.valid) process.exitCode = 1;
}

module.exports = { validate, expectedChannelTypes };
