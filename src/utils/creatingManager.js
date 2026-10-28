const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits
} = require('discord.js');
const templates = require('../config/templateLoader');
const { checkTemplateCapacity } = require('./templateCapacity');
const rankStore = require('./rankStore');
const { db } = rankStore;

const activeGuilds = new Set();
const sessionsByGuild = new Map();
const cooldownByGuild = new Map();
const registryPath = path.join(__dirname, '../../data/creating-created.json');
const creationDelayMs = 650;
const confirmationLifetimeMs = 5 * 60 * 1000;
const cooldownMs = 30 * 1000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

class RegistryPersistenceError extends Error {}

db.exec(`
  CREATE TABLE IF NOT EXISTS creation_batches (
    guild_id TEXT NOT NULL,
    batch_id TEXT NOT NULL,
    template_key TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, batch_id)
  );
  CREATE TABLE IF NOT EXISTS creation_entities (
    guild_id TEXT NOT NULL,
    batch_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('roles', 'categories', 'channels')),
    entity_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, batch_id, kind, entity_id)
  );
  CREATE TABLE IF NOT EXISTS creation_entity_refs (
    guild_id TEXT NOT NULL,
    batch_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('roles', 'categories', 'channels')),
    definition_key TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    PRIMARY KEY (guild_id, batch_id, kind, definition_key)
  );
`);

const selectCreationBatches = db.prepare(
  'SELECT batch_id, template_key, status, created_at, updated_at FROM creation_batches WHERE guild_id = ?'
);
const selectCreationEntities = db.prepare(
  'SELECT batch_id, kind, entity_id FROM creation_entities WHERE guild_id = ?'
);
const selectCreationEntityRefs = db.prepare(
  'SELECT batch_id, kind, definition_key, entity_id FROM creation_entity_refs WHERE guild_id = ?'
);
const selectCreationGuilds = db.prepare(`
  SELECT guild_id FROM creation_batches
  UNION
  SELECT guild_id FROM creation_entities
  UNION
  SELECT guild_id FROM creation_entity_refs
`);

function hydrateRegistryFromDatabase(registry) {
  const guildIds = new Set(selectCreationGuilds.all().map(row => row.guild_id));
  for (const guildId of guildIds) {
    const entry = registry[guildId] || { roles: [], categories: [], channels: [], channelRefs: {}, batches: {} };
    if (!entry.channelRefs) entry.channelRefs = {};
    if (!entry.batches) entry.batches = {};
    for (const batchRow of selectCreationBatches.all(guildId)) {
      const batch = entry.batches[batchRow.batch_id] || { roles: [], categories: [], channels: [] };
      batch.templateKey = batchRow.template_key;
      batch.status = batchRow.status;
      batch.createdAt = batchRow.created_at;
      batch.updatedAt = batchRow.updated_at;
      entry.batches[batchRow.batch_id] = batch;
    }
    for (const entityRow of selectCreationEntities.all(guildId)) {
      const batch = entry.batches[entityRow.batch_id] || {
        roles: [], categories: [], channels: [], status: 'partial'
      };
      if (!batch[entityRow.kind].includes(entityRow.entity_id)) {
        batch[entityRow.kind].push(entityRow.entity_id);
      }
      if (!entry[entityRow.kind].includes(entityRow.entity_id)) {
        entry[entityRow.kind].push(entityRow.entity_id);
      }
      entry.batches[entityRow.batch_id] = batch;
    }
    for (const reference of selectCreationEntityRefs.all(guildId)) {
      const batch = entry.batches[reference.batch_id] || {
        roles: [], categories: [], channels: [], status: 'partial'
      };
      if (!batch.entityRefs) batch.entityRefs = { roles: {}, categories: {}, channels: {} };
      batch.entityRefs[reference.kind][reference.definition_key] = reference.entity_id;
      entry.batches[reference.batch_id] = batch;
    }
    registry[guildId] = entry;
  }
  return registry;
}

function fileErrorCause(error) {
  if (error instanceof SyntaxError) return 'el archivo JSON está dañado o tiene un formato inválido';
  if (error.message === 'el contenido no tiene el formato esperado' ||
      error.message?.startsWith('registro inválido para el servidor')) {
    return error.message;
  }
  const knownCauses = {
    EACCES: 'el proceso no tiene permiso para acceder al archivo',
    EPERM: 'el sistema operativo denegó el acceso al archivo',
    ENOSPC: 'no queda espacio disponible en el disco'
  };
  return knownCauses[error.code] || `falló el acceso al archivo${error.code ? ` (${error.code})` : ''}`;
}

function readRegistry() {
  try {
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
      throw new Error('el contenido no tiene el formato esperado');
    }
    for (const [guildId, entry] of Object.entries(registry)) {
      if (!entry || !['roles', 'categories', 'channels'].every(kind =>
        Array.isArray(entry[kind]) && entry[kind].every(id => typeof id === 'string')
        ) || (entry.channelRefs !== undefined && (
          !entry.channelRefs || typeof entry.channelRefs !== 'object' ||
        Object.values(entry.channelRefs).some(id => typeof id !== 'string')
        )) || (entry.batches !== undefined && (
          !entry.batches || typeof entry.batches !== 'object' ||
          Object.values(entry.batches).some(batch => !batch ||
            !['roles', 'categories', 'channels'].every(kind =>
              Array.isArray(batch[kind]) && batch[kind].every(id => typeof id === 'string')
            )
          )
        ))) {
        throw new Error(`registro inválido para el servidor ${guildId}`);
      }
    }
    return hydrateRegistryFromDatabase(registry);
  } catch (error) {
    if (error.code === 'ENOENT') return hydrateRegistryFromDatabase({});
    throw new RegistryPersistenceError(`No se pudo leer el registro de elementos creados: ${fileErrorCause(error)}. No se iniciaron cambios.`);
  }
}

function writeRegistry(registry) {
  try {
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    const temporaryPath = `${registryPath}.${process.pid}.${randomUUID()}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, registryPath);
  } catch (error) {
    throw new RegistryPersistenceError(`No se pudo guardar el registro de elementos creados: ${fileErrorCause(error)}.`);
  }
}

function trackCreated(guildId, kind, id, referenceKey, batchId) {
  const registry = readRegistry();
  const entry = registry[guildId] || { roles: [], categories: [], channels: [], channelRefs: {}, batches: {} };
  if (!entry.channelRefs) entry.channelRefs = {};
  if (!entry.batches) entry.batches = {};
  if (!entry[kind].includes(id)) entry[kind].push(id);
  if (kind === 'channels' && referenceKey) {
    const references = Array.isArray(referenceKey) ? referenceKey : [referenceKey];
    for (const reference of references) {
      if (reference) entry.channelRefs[reference] = id;
    }
  }
  if (batchId) {
    const batch = entry.batches[batchId] || { roles: [], categories: [], channels: [] };
    if (!batch[kind].includes(id)) batch[kind].push(id);
    if (!batch.entityRefs) batch.entityRefs = { roles: {}, categories: {}, channels: {} };
    const entityKey = Array.isArray(referenceKey) ? referenceKey[0] : referenceKey;
    if (entityKey) batch.entityRefs[kind][entityKey] = id;
    entry.batches[batchId] = batch;
  }
  registry[guildId] = entry;
  const persist = db.transaction(() => {
    if (batchId) {
      db.prepare(`
        INSERT OR IGNORE INTO creation_entities (guild_id, batch_id, kind, entity_id, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(guildId, batchId, kind, id, Date.now());
      const entityKey = Array.isArray(referenceKey) ? referenceKey[0] : referenceKey;
      if (entityKey) {
        db.prepare(`
          INSERT INTO creation_entity_refs (guild_id, batch_id, kind, definition_key, entity_id)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(guild_id, batch_id, kind, definition_key) DO UPDATE SET entity_id = excluded.entity_id
        `).run(guildId, batchId, kind, entityKey, id);
      }
    }
    writeRegistry(registry);
  });
  persist();
}

function trackChannelReference(guildId, referenceKey, id) {
  const registry = readRegistry();
  const entry = registry[guildId] || { roles: [], categories: [], channels: [], channelRefs: {} };
  if (!entry.channelRefs) entry.channelRefs = {};
  entry.channelRefs[referenceKey] = id;
  registry[guildId] = entry;
  writeRegistry(registry);
}

function clearChannelReference(guildId, referenceKey) {
  const registry = readRegistry();
  const entry = registry[guildId];
  if (!entry?.channelRefs) return;
  delete entry.channelRefs[referenceKey];
  if (!entry.roles.length && !entry.categories.length && !entry.channels.length &&
      !Object.keys(entry.channelRefs).length && !Object.keys(entry.batches || {}).length) {
    delete registry[guildId];
  }
  writeRegistry(registry);
}

function findResumableBatch(guildId, templateKey) {
  const persisted = db.prepare(`
    SELECT batch_id FROM creation_batches
    WHERE guild_id = ? AND template_key = ? AND status IN ('in_progress', 'partial')
    ORDER BY created_at DESC LIMIT 1
  `).get(guildId, templateKey);
  if (persisted) return persisted.batch_id;
  const batches = readRegistry()[guildId]?.batches || {};
  const candidates = Object.entries(batches)
    .filter(([, batch]) =>
      batch.templateKey === templateKey &&
      ['in_progress', 'partial'].includes(batch.status)
    )
    .sort((left, right) => (right[1].createdAt || 0) - (left[1].createdAt || 0));
  return candidates[0]?.[0] || null;
}

function initializeBatch(guildId, batchId, templateKey) {
  const registry = readRegistry();
  const entry = registry[guildId] || { roles: [], categories: [], channels: [], channelRefs: {}, batches: {} };
  if (!entry.batches) entry.batches = {};
  const batch = entry.batches[batchId] || { roles: [], categories: [], channels: [] };
  batch.templateKey = templateKey;
  batch.status = 'in_progress';
  batch.createdAt = batch.createdAt || Date.now();
  entry.batches[batchId] = batch;
  registry[guildId] = entry;
  const now = Date.now();
  db.prepare(`
    INSERT INTO creation_batches (guild_id, batch_id, template_key, status, created_at, updated_at)
    VALUES (?, ?, ?, 'in_progress', ?, ?)
    ON CONFLICT(guild_id, batch_id) DO UPDATE SET
      template_key = excluded.template_key, status = 'in_progress', updated_at = excluded.updated_at
  `).run(guildId, batchId, templateKey, batch.createdAt, now);
  writeRegistry(registry);
}

function setBatchStatus(guildId, batchId, status) {
  const registry = readRegistry();
  const entry = registry[guildId];
  const batch = entry?.batches?.[batchId];
  if (!batch) return;
  if (status === 'completed' &&
      !batch.roles.length && !batch.categories.length && !batch.channels.length) {
    delete entry.batches[batchId];
    db.prepare('DELETE FROM creation_batches WHERE guild_id = ? AND batch_id = ?').run(guildId, batchId);
    if (!entry.roles.length && !entry.categories.length && !entry.channels.length &&
        !Object.keys(entry.channelRefs || {}).length && !Object.keys(entry.batches).length) {
      delete registry[guildId];
    }
    writeRegistry(registry);
    return;
  }
  batch.status = status;
  batch.updatedAt = Date.now();
  db.prepare(`
    UPDATE creation_batches SET status = ?, updated_at = ?
    WHERE guild_id = ? AND batch_id = ?
  `).run(status, batch.updatedAt, guildId, batchId);
  writeRegistry(registry);
}

async function getChannelReference(guildId, referenceKey, guild) {
  const channelId = readRegistry()[guildId]?.channelRefs?.[referenceKey];
  if (!channelId) return null;
  return guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId);
}

function getChannelReferences(guildId) {
  return { ...(readRegistry()[guildId]?.channelRefs || {}) };
}

function forgetCreated(guildId, kind, id, batchId) {
  const registry = readRegistry();
  const entry = registry[guildId];
  if (!entry) return;
  entry[kind] = entry[kind].filter(savedId => savedId !== id);
  for (const [idOfBatch, batch] of Object.entries(entry.batches || {})) {
    if (batch[kind]) batch[kind] = batch[kind].filter(savedId => savedId !== id);
    if (idOfBatch === batchId &&
        !batch.roles.length && !batch.categories.length && !batch.channels.length) {
      delete entry.batches[idOfBatch];
    }
  }
  if (kind === 'channels' && entry.channelRefs) {
    for (const [key, channelId] of Object.entries(entry.channelRefs)) {
      if (channelId === id) delete entry.channelRefs[key];
    }
  }
  if (batchId) {
    db.prepare(`
      DELETE FROM creation_entities
      WHERE guild_id = ? AND batch_id = ? AND kind = ? AND entity_id = ?
    `).run(guildId, batchId, kind, id);
    db.prepare(`
      DELETE FROM creation_entity_refs
      WHERE guild_id = ? AND batch_id = ? AND kind = ? AND entity_id = ?
    `).run(guildId, batchId, kind, id);
  }
  for (const [idOfBatch, batch] of Object.entries(entry.batches || {})) {
    if (idOfBatch === batchId && !batch.roles.length && !batch.categories.length && !batch.channels.length) {
      db.prepare('DELETE FROM creation_batches WHERE guild_id = ? AND batch_id = ?').run(guildId, idOfBatch);
    }
  }
  if (!entry.roles.length && !entry.categories.length && !entry.channels.length &&
      !Object.keys(entry.channelRefs || {}).length && !Object.keys(entry.batches || {}).length) {
    delete registry[guildId];
  }
  writeRegistry(registry);
}

function registryCount(guildId, batchId) {
  const entry = readRegistry()[guildId];
  if (!entry) return 0;
  const selected = batchId ? entry.batches?.[batchId] : entry;
  return selected
    ? selected.roles.length + selected.categories.length + selected.channels.length
    : 0;
}

function releaseGuild(guildId) {
  activeGuilds.delete(guildId);
  sessionsByGuild.delete(guildId);
}

function findByNameAndType(guild, name, type) {
  const normalizedName = name.toLocaleLowerCase();
  if (type === 'role') {
    return guild.roles.cache.find(role => role.name.toLocaleLowerCase() === normalizedName);
  }
  const channelType = type === 'category'
    ? ChannelType.GuildCategory
    : type === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText;
  return guild.channels.cache.find(channel =>
    channel.type === channelType && channel.name.toLocaleLowerCase() === normalizedName
  );
}

async function getPersistedEntity(guild, kind, id) {
  if (!id) return null;
  const manager = kind === 'roles' ? guild.roles : guild.channels;
  const cached = manager.cache.get(id);
  if (cached) return cached;
  try {
    return await (kind === 'roles' ? guild.roles.fetch(id) : guild.channels.fetch(id));
  } catch (error) {
    const code = error.code ?? error.rawError?.code;
    if (code === 10003 || code === 10011) return null;
    throw error;
  }
}

function resolveDiscordChannelType(type) {
  const types = {
    texto: ChannelType.GuildText,
    text: ChannelType.GuildText,
    voz: ChannelType.GuildVoice,
    voice: ChannelType.GuildVoice,
    forum: ChannelType.GuildForum,
    announcement: ChannelType.GuildAnnouncement,
    stage: ChannelType.GuildStageVoice,
    category: ChannelType.GuildCategory
  };
  return types[typeof type === 'string' ? type.trim().toLocaleLowerCase() : type] ?? null;
}

function resolveForumReactionEmoji(emoji) {
  if (!emoji) return undefined;
  if (typeof emoji !== 'string') return emoji;
  return { id: null, name: emoji };
}

async function orderCreatedRoles(guild, roles) {
  if (typeof guild.roles.fetch === 'function') await guild.roles.fetch();
  const botMember = typeof guild.members.fetchMe === 'function'
    ? await guild.members.fetchMe()
    : guild.members.me;
  const availablePositions = Math.max(0, botMember.roles.highest.position - 1);
  if (roles.length > availablePositions) return false;

  await guild.roles.setPositions(roles.map((role, index) => ({
    role: role.id,
    position: botMember.roles.highest.position - index - 1
  })));
  return true;
}

function saveRankRole(guildId, definition, role) {
  if (!role || !definition.key) return;
  const configuredRole = require('../config/ranks.json').rolesTopToBottom
    .find(candidate => candidate.key === definition.key);
  if (configuredRole) rankStore.setRankRole(guildId, definition.key, role.id);
}

async function validateSetup(guild, template) {
  const templateValidation = require('../config/validar-plantillas').validate({ print: false });
  readRegistry();
  const issues = [];
  if (!templateValidation.valid) {
    issues.push('El catálogo de plantillas contiene errores. Ejecuta `node src/config/validar-plantillas.js` y corrige las filas marcadas ❌.');
  }
  const botMember = guild.members.me || await guild.members.fetchMe();
  const requiredPermissions = [
    [PermissionFlagsBits.ManageChannels, 'Gestionar canales (ManageChannels)'],
    [PermissionFlagsBits.ManageRoles, 'Gestionar roles (ManageRoles)']
  ];
  const missingPermissions = requiredPermissions
    .filter(([permission]) => !botMember.permissions.has(permission))
    .map(([, label]) => label);

  if (missingPermissions.length) {
    issues.push(
      `Al bot le falta: ${missingPermissions.join(' y ')}. En la configuración del servidor, concede esos permisos al bot y vuelve a intentarlo.`
    );
  }

  const highestPosition = botMember.roles.highest.position;
  const rolesAboveBot = template.roles
    .map(role => findByNameAndType(guild, role.nombre, 'role'))
    .filter(role => role && role.position >= highestPosition);
  if (rolesAboveBot.length) {
    issues.push(
      `El rol del bot debe estar por encima de ${rolesAboveBot.map(role => `@${role.name}`).join(', ')}. En Ajustes del servidor > Roles, mueve el rol del bot por encima de esos roles.`
    );
  }

  const capacity = checkTemplateCapacity(guild, template);
  issues.push(...capacity.issues);
  return {
    issues,
    plan: {
      rolesToCreate: capacity.rolesToCreate,
      categoriesToCreate: capacity.categories.filter(category => !category.existingCategory),
      channelsToCreate: capacity.categories.flatMap(category => category.channelsToCreate)
    },
    warnings: capacity.warnings,
    botMember
  };
}

function makePreview(guild, userId, nonce, template, plan, warnings, resuming = false) {
  const pageSize = 5;
  const pageCount = Math.ceil(template.categorias.length / pageSize);
  const page = sessionsByGuild.get(guild.id)?.previewPage || 0;
  const categorySummary = template.categorias.slice(page * pageSize, (page + 1) * pageSize).map(category =>
    `**${category.nombre}**\n${category.canales.map(channel =>
      `└ ${channel.tipo === 'voice' || channel.tipo === 'stage' ? '🔊' : channel.tipo === 'forum' ? '🗂️' : channel.tipo === 'announcement' ? '📢' : '#'} ${channel.nombre}`
    ).join('\n')}`
  ).join('\n');
  const roleSummary = template.roles.map(role => `• ${role.nombre}`).join('\n');
  const totalNew = plan.rolesToCreate.length + plan.categoriesToCreate.length + plan.channelsToCreate.length;
  const estimatedMinutes = Math.ceil(totalNew * creationDelayMs / 60_000);
  const description = [
    'Se crearán los elementos que todavía no existan (canales comparados por nombre y tipo).',
    ...(resuming ? ['\n♻️ **Continuación:** se reanudará una ejecución incompleta; los elementos existentes se omitirán y no se duplicarán.'] : []),
    '',
    categorySummary,
    '',
    `**Roles**\n${roleSummary}`,
    '',
    `**Pendientes:** ${plan.rolesToCreate.length} rol(es), ${plan.categoriesToCreate.length} categoría(s) y ${plan.channelsToCreate.length} canal(es).`,
    `**Total de plantilla:** ${template.categorias.reduce((count, category) => count + category.canales.length, 0)} canales en ${template.categorias.length} categorías.`,
    `**Estimación:** aproximadamente ${estimatedMinutes} minuto(s) de creación.`,
    `**Árbol, página ${page + 1}/${pageCount}:**`,
    ...warnings
  ].join('\n');
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(`Confirmar ${template.nombre} para ${guild.name}`)
    .setDescription(description)
    .setFooter({ text: 'La estructura privada de STAFF solo será visible para Admin y Moderador.' });
  const paginationRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`creating:page:${userId}:${nonce}:prev`).setLabel('◀️').setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
    new ButtonBuilder().setCustomId(`creating:page:${userId}:${nonce}:next`).setLabel('▶️').setStyle(ButtonStyle.Secondary).setDisabled(page >= pageCount - 1)
  );
  const confirmRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`creating:confirm:${userId}:${nonce}`)
      .setLabel('✅ Confirmar')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`creating:cancel:${userId}:${nonce}`)
      .setLabel('❌ Cancelar')
      .setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [embed], components: [paginationRow, confirmRow] };
}

function describeError(error) {
  const code = error?.code ?? error?.rawError?.code;
  if (code === 50013) return 'Discord denegó la acción por permisos insuficientes o por la jerarquía de roles.';
  if (code === 30005) return 'Se alcanzó el límite máximo de roles del servidor.';
  if (code === 30013) return 'Se alcanzó el límite máximo de canales del servidor.';
  if (code === 50035) return 'Discord rechazó los datos de configuración del elemento.';
  return `Discord no pudo completar la acción${code ? ` (código ${code})` : ''}. Revisa los permisos, la jerarquía y los límites del servidor.`;
}

function setFor(entry, kind) {
  if (!entry[kind]) entry[kind] = [];
  return entry[kind];
}

async function trackCreatedEntity(guildId, kind, entity, referenceKey, batchId) {
  try {
    trackCreated(guildId, kind, entity.id, referenceKey, batchId);
  } catch (error) {
    console.error(`[CREATING] No se pudo registrar ${kind} ${entity.id}:`, error);
    try {
      await entity.delete('Limpieza: no se pudo guardar el registro de /creating');
    } catch (cleanupError) {
      console.error(`[CREATING] Tampoco se pudo limpiar ${kind} ${entity.id}:`, cleanupError);
      throw new RegistryPersistenceError(`${error.message} Además, no se pudo borrar el elemento recién creado (${describeError(cleanupError)}).`);
    }
    throw new RegistryPersistenceError(error.message);
  }
  return entity;
}

async function createAndTrack(guildId, kind, create, referenceKey, batchId) {
  return trackCreatedEntity(guildId, kind, await create(), referenceKey, batchId);
}

function makeOverwrites(guild, roleMap, {
  permissions = {},
  privateChannel = false,
  botCommands = false,
  type = 'text'
} = {}) {
  const everyoneId = guild.roles.everyone?.id || guild.id;
  const channelPermissions = permissions || {};
  const audience = channelPermissions.audience || 'member';
  const readonly = Boolean(channelPermissions.readOnly);
  const isPrivate = privateChannel || Boolean(channelPermissions.private);
  const viewPermissions = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory];
  const writePermissions = type === 'voice' || type === 'stage'
    ? [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
    : [
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.SendMessagesInThreads,
      PermissionFlagsBits.AddReactions,
      ...(type === 'forum' ? [PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.CreatePrivateThreads] : [])
    ];
  const overwrites = [{
    id: everyoneId,
    deny: [PermissionFlagsBits.ViewChannel, ...writePermissions]
  }];
  const rolesToAllow = new Map();
  const audienceRoleKey = {
    member: 'member',
    gaming: 'interest_gaming',
    art: 'interest_art',
    programming: 'interest_programming',
    anime: 'interest_anime',
    sports: 'interest_sports',
    music: 'interest_music',
    study: 'interest_study',
    technology: 'interest_technology',
    vip: 'booster'
  }[audience];

  if (audience === 'staff' || (isPrivate && audience !== 'vip')) {
    for (const key of ['admin', 'moderator']) {
      const role = roleMap.get(key);
      if (role) rolesToAllow.set(role.id, role);
    }
  } else if (audienceRoleKey) {
    const role = roleMap.get(audienceRoleKey);
    if (role) rolesToAllow.set(role.id, role);
  }

  const newRole = roleMap.get('new');
  if (channelPermissions.newVisible && newRole) rolesToAllow.set(newRole.id, newRole);

  for (const role of rolesToAllow.values()) {
    const deny = [];
    if (readonly || (role === newRole)) deny.push(...writePermissions);
    const allow = [...viewPermissions, ...(!readonly && role !== newRole ? writePermissions : [])];
    if (botCommands && role === roleMap.get('member')) {
      allow.push(PermissionFlagsBits.UseApplicationCommands);
    }
    overwrites.push({ id: role.id, allow, deny });
  }

  for (const key of ['owner', 'admin', 'moderator']) {
    const role = roleMap.get(key);
    if (!role) continue;
    const deny = readonly ? [...writePermissions] : [];
    if (!rolesToAllow.has(role.id)) {
      overwrites.push({ id: role.id, allow: [...viewPermissions, ...(readonly ? [] : writePermissions)], deny });
    }
  }

  const mutedRole = roleMap.get('muted');
  if (mutedRole) {
    overwrites.push({
      id: mutedRole.id,
      deny: [
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.SendMessagesInThreads,
        PermissionFlagsBits.CreatePublicThreads,
        PermissionFlagsBits.CreatePrivateThreads,
        PermissionFlagsBits.AddReactions,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak
      ]
    });
  }

  return overwrites;
}

function channelReferenceAliases(channelKey) {
  const aliases = {
    bienvenida: ['bienvenida', 'welcome'],
    despedidas: ['despedida', 'goodbye'],
    reglas: ['reglas', 'rules'],
    'roles-y-niveles': ['roles-y-niveles', 'roles'],
    'crear-sala': ['crear-sala', 'modulo-voz-temporal']
  };
  return aliases[channelKey] || [];
}

function progressComponents(session) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`creating:pause:${session.ownerId}:${session.nonce}`)
      .setLabel(session.pauseRequested ? '▶️ Reanudar' : '⏸️ Pausar')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`creating:stop:${session.ownerId}:${session.nonce}`)
      .setLabel('⏹️ Cancelar')
      .setStyle(ButtonStyle.Danger)
  )];
}

function buildResultEmbed(created, skipped, errors) {
  const format = entries => entries.length
    ? entries.map(item => `• ${item}`).join('\n')
    : 'Ninguno';
  const truncate = text => text.length > 1024 ? `${text.slice(0, 1018)}…` : text;
  return new EmbedBuilder()
    .setColor(errors.length ? '#FEE75C' : '#57F287')
    .setTitle('Resultado de la creación')
    .addFields(
      { name: `✅ Creado (${created.length})`, value: truncate(format(created)) },
      { name: `⏭️ Omitido (${skipped.length})`, value: truncate(format(skipped)) },
      { name: `❌ Errores (${errors.length})`, value: truncate(format(errors)) }
    )
    .setTimestamp();
}

async function logCreationAudit(guild, executorId, templateName, created, skipped, errors) {
  let channel;
  try {
    channel = await getChannelReference(guild.id, 'registro-de-moderacion', guild);
  } catch (error) {
    console.error(`[CREATING] No se pudo resolver el registro de moderación de ${guild.id}:`, error);
    return;
  }
  if (!channel?.isTextBased()) {
    console.warn(`[CREATING] No se encontró #registro-de-moderación en ${guild.id}; el resultado se conserva en la respuesta del comando.`);
    return;
  }
  const format = values => values.length
    ? values.slice(0, 8).map(value => `• ${value}`).join('\n').slice(0, 1024)
    : 'Ninguno';
  const embed = new EmbedBuilder()
    .setColor(errors.length ? '#FEE75C' : '#57F287')
    .setTitle('Registro de configuración del servidor')
    .setDescription(`**Ejecutado por:** <@${executorId}>\n**Plantilla:** ${templateName}`)
    .addFields(
      { name: `✅ Creados (${created.length})`, value: format(created) },
      { name: `⏭️ Omitidos (${skipped.length})`, value: format(skipped) },
      { name: `❌ Errores (${errors.length})`, value: format(errors) }
    )
    .setTimestamp();
  try {
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
  } catch (error) {
    console.error(`[CREATING] No se pudo publicar el resultado en #registro-de-moderación de ${guild.id}:`, error);
  }
}

async function runCreation(guild, session, template) {
  const created = [];
  const skipped = [];
  const errors = [];
  const roleMap = new Map();
  const categoryMap = new Map();
  const totalSteps = template.roles.length +
    template.categorias.length +
    template.categorias.reduce((count, category) => count + category.canales.length, 0);
  let completedSteps = 0;
  let completedChannels = 0;
  const totalChannels = template.categorias.reduce((count, category) => count + category.canales.length, 0);
  let lastProgressAt = Date.now();
  let fatalError = null;
  let persistenceFailure = false;
  let cancelled = false;
  const savedBatch = readRegistry()[guild.id]?.batches?.[session.batchId] || {};
  const savedEntityRefs = savedBatch.entityRefs || {};

  async function waitForRunControl() {
    while (session.pauseRequested && !session.cancelRequested) {
      await sleep(300);
    }
    return !session.cancelRequested;
  }

  async function updateProgress(label, channelStep = false) {
    completedSteps++;
    if (channelStep) completedChannels++;
    if (!channelStep || (completedChannels % 10 !== 0 && completedChannels !== totalChannels)) return;
    const percent = Math.round(completedSteps / totalSteps * 100);
    const filled = Math.round(percent / 100 * 6);
    const content = `⏳ ${label}\n${'▰'.repeat(filled)}${'▱'.repeat(6 - filled)} ${percent}%`;
    const wait = Math.max(0, 1000 - (Date.now() - lastProgressAt));
    if (wait) await sleep(wait);
    lastProgressAt = Date.now();
    try {
      await session.update({ content, embeds: [], components: progressComponents(session) });
    } catch (error) {
      if (!session.progressUpdateFailed) {
        console.error('[CREATING] No se pudo actualizar el mensaje de progreso:', error);
        errors.push('No se pudo actualizar el mensaje de progreso; la creación continuó.');
        session.progressUpdateFailed = true;
      }
    }
  }

  async function recordCreation(kind, label, operation, referenceKey, entityKey) {
    try {
      while (true) {
        try {
          const entity = await createAndTrack(
            guild.id,
            kind,
            operation,
            kind === 'channels' ? referenceKey : entityKey,
            session.batchId
          );
          created.push(label);
          return entity;
        } catch (error) {
          const retryAfter = error.retry_after ?? error.rawError?.retry_after ?? error.data?.retry_after;
          if ((error.code === 429 || error.status === 429) && Number.isFinite(Number(retryAfter))) {
            const retryMs = Number(retryAfter) < 100 ? Number(retryAfter) * 1000 : Number(retryAfter);
            console.warn(`[CREATING] Rate limit al crear ${label}; reintentando en ${retryMs} ms.`);
            await sleep(retryMs);
            continue;
          }
          throw error;
        }
      }
    } catch (error) {
      console.error(`[CREATING] ${label}:`, error);
      errors.push(`${label}: ${describeError(error)}`);
      if (error instanceof RegistryPersistenceError) {
        persistenceFailure = true;
        fatalError = error;
      }
      return null;
    } finally {
      await sleep(creationDelayMs);
    }
  }

  for (const definition of template.roles) {
    if (!await waitForRunControl()) { cancelled = true; break; }
    if (fatalError) break;
    const existing = await getPersistedEntity(
      guild, 'roles', savedEntityRefs.roles?.[definition.key]
    ) || findByNameAndType(guild, definition.nombre, 'role');
    if (existing) {
      skipped.push(`Rol ${existing.name}`);
      roleMap.set(definition.key || definition.nombre, existing);
      saveRankRole(guild.id, definition, existing);
    } else {
      const permissions = definition.permisos.map(name => PermissionFlagsBits[name]);
      const role = await recordCreation(
        'roles',
        `Rol ${definition.nombre}`,
        () => guild.roles.create({
          name: definition.nombre,
          color: definition.color,
          hoist: definition.hoist,
          permissions,
          reason: 'Estructura base creada con /creating'
        }),
        undefined,
        definition.key
      );
      if (role) {
        roleMap.set(definition.key || definition.nombre, role);
        saveRankRole(guild.id, definition, role);
      }
    }
    if (!roleMap.has(definition.key || definition.nombre)) {
      fatalError = new Error(`No se pudo provisionar el rol requerido ${definition.nombre}.`);
    }
    await updateProgress(`Procesando rol ${definition.nombre}`);
  }

  for (const definition of template.categorias) {
    if (!await waitForRunControl()) { cancelled = true; break; }
    if (fatalError) break;
    let category = await getPersistedEntity(
      guild, 'categories', savedEntityRefs.categories?.[definition.key]
    ) || findByNameAndType(guild, definition.nombre, 'category');
    if (category) {
      skipped.push(`Categoría ${category.name}`);
    } else {
      category = await recordCreation(
        'categories',
        `Categoría ${definition.nombre}`,
        () => guild.channels.create({
          name: definition.nombre,
          type: ChannelType.GuildCategory,
          position: template.categorias.indexOf(definition),
          permissionOverwrites: makeOverwrites(guild, roleMap, {
            permissions: definition.permisos,
            privateChannel: Boolean(definition.privado),
            type: 'text'
          }),
          reason: `Estructura base creada con /creating: ${definition.nombre}`
        }),
        undefined,
        definition.key
      );
    }
    if (category) categoryMap.set(definition.key || definition.nombre, category);
    if (category) categoryMap.set(definition.nombre, category);
    if (!category) {
      fatalError = new Error(`No se pudo provisionar la categoría ${definition.nombre}.`);
      errors.push(`Categoría ${definition.nombre}: la creación falló y se detuvo la plantilla para evitar canales huérfanos.`);
    } else if (typeof category.setPosition === 'function') {
      try {
        await category.setPosition(template.categorias.indexOf(definition));
      } catch (error) {
        errors.push(`Orden de categoría ${definition.nombre}: ${describeError(error)}`);
      }
    } else {
      errors.push(`Orden de categoría ${definition.nombre}: el canal no permite cambiar su posición.`);
    }
    await updateProgress(`Procesando categoría ${definition.nombre}`);
  }

  const rolesInHierarchy = template.roles.map(definition =>
    roleMap.get(definition.key || definition.nombre)
  ).filter(Boolean);
  if (rolesInHierarchy.length) {
    if (typeof guild.roles.setPositions === 'function') {
      try {
        const ordered = await orderCreatedRoles(guild, rolesInHierarchy);
        if (!ordered) {
          skipped.push('Orden de roles: se conservaron las posiciones asignadas por Discord porque no había espacio suficiente debajo del rol del bot.');
        }
      } catch (error) {
        console.error('[CREATING] No se pudo ordenar la jerarquía de roles:', error);
        errors.push(`Jerarquía de roles: ${describeError(error)}`);
      }
    } else {
      errors.push('El administrador de roles no permite ordenar la jerarquía en esta versión de discord.js.');
    }
  }

  for (const categoryDefinition of template.categorias) {
    for (const definition of categoryDefinition.canales) {
      if (!await waitForRunControl()) { cancelled = true; break; }
      if (fatalError) break;
      const expectedType = resolveDiscordChannelType(definition.tipo);
      if (expectedType === null) {
        errors.push(`Canal ${definition.nombre}: tipo de canal no reconocido (${definition.tipo}).`);
        await updateProgress(`Canal no válido ${definition.nombre}`, true);
        continue;
      }
      const existing = await getPersistedEntity(
        guild, 'channels', savedEntityRefs.channels?.[definition.key]
      ) || guild.channels.cache.find(channel =>
        channel.type === expectedType &&
        channel.name.toLocaleLowerCase() === definition.nombre.toLocaleLowerCase()
      );

      if (existing) {
        skipped.push(`Canal ${existing.name}`);
        try {
          for (const reference of [definition.key, ...(definition.referencias || []), ...channelReferenceAliases(definition.key)]) {
            if (reference) trackChannelReference(guild.id, reference, existing.id);
          }
        } catch (error) {
          errors.push(`Referencia de canal ${definition.key}: ${error.message}`);
        }
      } else {
        const parent = categoryMap.get(categoryDefinition.key || categoryDefinition.nombre);
        if (!parent) {
          errors.push(`Canal ${definition.nombre}: no se creó ni encontró la categoría ${categoryDefinition.nombre}.`);
        } else {
          const channel = await recordCreation('channels', `Canal ${definition.nombre}`, () =>
            guild.channels.create({
              name: definition.nombre,
              type: expectedType,
              parent: parent.id,
              topic: [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum].includes(expectedType)
                ? definition.tema
                : undefined,
              rateLimitPerUser: [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum].includes(expectedType)
                ? definition.slowmode ?? 0
                : undefined,
              defaultReactionEmoji: expectedType === ChannelType.GuildForum
                ? resolveForumReactionEmoji(definition.forum?.defaultReactionEmoji)
                : undefined,
              defaultSortOrder: expectedType === ChannelType.GuildForum
                ? definition.forum?.defaultSortOrder
                : undefined,
              permissionOverwrites: makeOverwrites(guild, roleMap, {
                permissions: definition.permisos || categoryDefinition.permisos,
                privateChannel: Boolean(definition.privado || categoryDefinition.privado),
                botCommands: Boolean(definition.botCommands),
                type: definition.tipo
              }),
              reason: `Estructura base creada con /creating: ${definition.nombre}`
            }),
            [definition.key, ...(definition.referencias || []), ...channelReferenceAliases(definition.key)],
            definition.key
          );
          if (channel && definition.temporaryRoomTemplate) session.temporaryRoomTemplateIds.push(channel.id);
        }
      }
      await updateProgress(`Procesando canal ${definition.nombre}`, true);
    }
    if (fatalError || cancelled) break;
  }

  if (session.cancelRequested) {
    cancelled = true;
    errors.push('Ejecución cancelada por el administrador; los elementos ya creados se conservaron.');
  }
  if (fatalError) {
    errors.push(`Se detuvo la creación para evitar elementos sin registrar: ${fatalError.message}`);
  }
  try {
    setBatchStatus(guild.id, session.batchId, errors.length || cancelled ? 'partial' : 'completed');
  } catch (error) {
    console.error('[CREATING] No se pudo guardar el estado final de la ejecución:', error);
    errors.push('No se pudo guardar el estado final; la ejecución permanece marcada para reanudarse.');
  }
  await logCreationAudit(guild, session.ownerId, template.nombre, created, skipped, errors);

  const embed = buildResultEmbed(created, skipped, errors);
  const hasUndoItems = registryCount(guild.id, session.batchId) > 0;
  const components = hasUndoItems
    ? [new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`creating:undo:${session.ownerId}:${session.batchId}`)
        .setLabel('🧹 Deshacer lo creado')
        .setStyle(ButtonStyle.Danger)
    )]
    : [];

  cooldownByGuild.set(guild.id, Date.now() + cooldownMs);
  releaseGuild(guild.id);
  try {
    await session.update({
      content: persistenceFailure
        ? '⚠️ La creación se detuvo porque no se pudo guardar el registro de forma segura.'
        : null,
      embeds: [embed],
      components
    });
  } catch (error) {
    console.error('[CREATING] No se pudo publicar el reporte final:', error);
  }
}

async function beginCreating({
  guild,
  member,
  user,
  respond,
  update,
  defer,
  setResponse,
  templateKey = 'comunidad'
}) {
  if (!member?.permissions?.has(PermissionFlagsBits.Administrator)) {
    return respond({ content: 'Necesitas permisos de administrador para usar este comando.' });
  }
  if (!guild) {
    return respond({ content: '❌ Este comando solo se puede usar dentro de un servidor.' });
  }

  const currentSession = sessionsByGuild.get(guild.id);
  if (currentSession?.status === 'pending' &&
      Date.now() - currentSession.createdAt >= confirmationLifetimeMs) {
    releaseGuild(guild.id);
  } else if (activeGuilds.has(guild.id)) {
    return respond({ content: 'Ya hay una creación en proceso.' });
  }

  const cooldownUntil = cooldownByGuild.get(guild.id) || 0;
  if (cooldownUntil > Date.now()) {
    const seconds = Math.ceil((cooldownUntil - Date.now()) / 1000);
    return respond({ content: `⏱️ Espera ${seconds} segundo(s) antes de volver a ejecutar la creación.` });
  }

  const selectedTemplate = templates[templateKey];
  if (!selectedTemplate) {
    return respond({ content: '❌ La plantilla solicitada no existe. Elige comunidad, gaming, estudio o tienda.' });
  }

  if (defer) await defer();

  let validation;
  try {
    validation = await validateSetup(guild, selectedTemplate);
    if (validation.issues.length) {
      return respond({ content: `❌ No se puede iniciar la creación:\n${validation.issues.map(issue => `• ${issue}`).join('\n')}` });
    }
  } catch (error) {
    console.error('[CREATING] Falló la validación inicial:', error);
    const cause = error instanceof RegistryPersistenceError ? error.message : describeError(error);
    return respond({ content: `❌ No se pudo verificar la configuración antes de crear elementos: ${cause}` });
  }

  if (activeGuilds.has(guild.id)) {
    return respond({ content: 'Ya hay una creación en proceso.' });
  }
  const cooldownAfterValidation = cooldownByGuild.get(guild.id) || 0;
  if (cooldownAfterValidation > Date.now()) {
    const seconds = Math.ceil((cooldownAfterValidation - Date.now()) / 1000);
    return respond({ content: `⏱️ Espera ${seconds} segundo(s) antes de volver a ejecutar la creación.` });
  }

  let resumableBatchId;
  try {
    resumableBatchId = findResumableBatch(guild.id, templateKey);
  } catch (error) {
    const cause = error instanceof RegistryPersistenceError ? error.message : describeError(error);
    return respond({ content: `❌ No se pudo comprobar si había una ejecución incompleta: ${cause}` });
  }
  const nonce = randomUUID().replace(/-/g, '').slice(0, 16);
  const session = {
    ownerId: user.id,
    nonce,
    batchId: resumableBatchId || randomUUID().replace(/-/g, ''),
    resuming: Boolean(resumableBatchId),
    templateKey,
    template: selectedTemplate,
    plan: validation.plan,
    previewPage: 0,
    status: 'pending',
    createdAt: Date.now(),
    warnings: validation.warnings,
    pauseRequested: false,
    cancelRequested: false,
    temporaryRoomTemplateIds: [],
    update
  };
  activeGuilds.add(guild.id);
  sessionsByGuild.set(guild.id, session);

  try {
    const response = await respond(makePreview(
      guild,
      user.id,
      nonce,
      selectedTemplate,
      validation.plan,
      validation.warnings,
      session.resuming
    ));
    if (setResponse) setResponse(response);
  } catch (error) {
    releaseGuild(guild.id);
    throw error;
  }
}

async function sendComponentError(interaction, content) {
  if (interaction.replied || interaction.deferred) {
    return interaction.followUp({ content, ephemeral: true });
  }
  return interaction.reply({ content, ephemeral: true });
}

async function handleUndo(interaction, ownerId, batchId) {
  if (interaction.user.id !== ownerId) {
    return sendComponentError(interaction, 'Solo quien ejecutó la creación puede deshacerla.');
  }
  if (!interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
    return sendComponentError(interaction, 'Necesitas permisos de administrador para deshacer los elementos creados.');
  }

  await interaction.update({
    content: '⏳ Deshaciendo únicamente los elementos registrados como creados por este bot…',
    embeds: [],
    components: []
  });
  const update = payload => interaction.editReply(payload);
  const deleted = [];
  const missing = [];
  const errors = [];

  try {
    const registry = readRegistry();
    const entry = registry[interaction.guildId];
    if (!entry) {
      return update({
        content: 'ℹ️ No hay elementos registrados para deshacer en este servidor.',
        embeds: [],
        components: []
      });
    }
    const batch = entry.batches?.[batchId] ||
      (!entry.batches && { roles: entry.roles, categories: entry.categories, channels: entry.channels });
    if (!batch) {
      return update({
        content: 'ℹ️ No hay elementos registrados para deshacer en esta ejecución.',
        embeds: [],
        components: []
      });
    }

    const collections = [
      ['channels', interaction.guild.channels, 'canal'],
      ['categories', interaction.guild.channels, 'categoría'],
      ['roles', interaction.guild.roles, 'rol']
    ];

    for (const [kind, manager, label] of collections) {
      for (const id of [...setFor(batch, kind)]) {
        try {
          const entity = manager.cache.get(id) ||
            await (kind === 'roles'
              ? interaction.guild.roles.fetch(id)
              : interaction.guild.channels.fetch(id));
          if (entity) {
            await entity.delete('Deshacer elementos registrados por /creating');
            deleted.push(`${label} ${entity.name}`);
            await sleep(creationDelayMs);
          } else {
            missing.push(`${label} ${id} (ya no existía)`);
          }
          forgetCreated(interaction.guildId, kind, id, batchId);
        } catch (error) {
          console.error(`[CREATING] No se pudo deshacer ${label} ${id}:`, error);
          errors.push(`${label} ${id}: ${describeError(error)}`);
        }
      }
    }

    const remaining = registryCount(interaction.guildId, batchId);
    const embed = new EmbedBuilder()
      .setColor(errors.length ? '#FEE75C' : '#57F287')
      .setTitle('Reporte de deshacer')
      .addFields(
        { name: `✅ Eliminado (${deleted.length})`, value: deleted.join('\n').slice(0, 1024) || 'Ninguno' },
        { name: `⏭️ Ya no existía (${missing.length})`, value: missing.join('\n').slice(0, 1024) || 'Ninguno' },
        { name: `❌ Errores (${errors.length})`, value: errors.join('\n').slice(0, 1024) || 'Ninguno' }
      );
    const components = remaining
      ? [new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`creating:undo:${ownerId}:${batchId}`)
          .setLabel('🧹 Reintentar deshacer')
          .setStyle(ButtonStyle.Danger)
      )]
      : [];
    return update({ content: null, embeds: [embed], components });
  } catch (error) {
    console.error('[CREATING] No se pudo completar el deshacer:', error);
    const cause = error instanceof RegistryPersistenceError ? error.message : describeError(error);
    return update({
      content: `❌ No se pudo completar el deshacer: ${cause}`,
      embeds: [],
      components: []
    });
  }
}

async function handleCreatingButton(interaction) {
  const [namespace, action, ownerId, nonce, pageDirection] = interaction.customId.split(':');
  if (namespace !== 'creating') return false;

  if (action === 'undo') {
    await handleUndo(interaction, ownerId, nonce);
    return true;
  }
  const session = sessionsByGuild.get(interaction.guildId);
  if (!session || session.nonce !== nonce || session.ownerId !== ownerId) {
    await sendComponentError(interaction, 'Esta confirmación ya expiró o no está disponible. Ejecuta /creating nuevamente.');
    return true;
  }
  if (interaction.user.id !== session.ownerId) {
    await sendComponentError(interaction, 'Solo quien ejecutó la creación puede pulsar estos botones.');
    return true;
  }

  if (action === 'pause' || action === 'stop') {
    if (session.status !== 'running') {
      await sendComponentError(interaction, 'La creación ya no está en ejecución.');
      return true;
    }
    if (action === 'pause') {
      session.pauseRequested = !session.pauseRequested;
      await interaction.reply({
        content: session.pauseRequested
          ? '⏸️ Creación pausada. Pulsa ▶️ Reanudar en el mensaje de progreso para continuar.'
          : '▶️ Creación reanudada.',
        ephemeral: true
      });
    } else {
      session.cancelRequested = true;
      session.pauseRequested = false;
      await interaction.reply({
        content: '⏹️ Solicitud de cancelación recibida. Se conservarán los elementos ya creados y el reporte ofrecerá deshacerlos.',
        ephemeral: true
      });
    }
    return true;
  }

  if (session.status !== 'pending') {
    await sendComponentError(interaction, 'Esta confirmación ya expiró o no está disponible.');
    return true;
  }

  if (action === 'page') {
    const pageCount = Math.ceil(session.template.categorias.length / 5);
    session.previewPage = Math.max(0, Math.min(pageCount - 1,
      session.previewPage + (pageDirection === 'next' ? 1 : -1)));
    await interaction.update(makePreview(
      interaction.guild,
      session.ownerId,
      session.nonce,
      session.template,
      session.plan,
      session.warnings,
      session.resuming
    ));
    return true;
  }

  if (action === 'cancel') {
    releaseGuild(interaction.guildId);
    await interaction.update({
      content: '❌ Creación cancelada. No se realizaron cambios.',
      embeds: [],
      components: []
    });
    return true;
  }

  if (action !== 'confirm') return false;
  if (!interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
    releaseGuild(interaction.guildId);
    await interaction.update({
      content: 'Necesitas permisos de administrador para confirmar la creación.',
      embeds: [],
      components: []
    });
    return true;
  }

  session.status = 'running';
  let validation;
  try {
    const selectedTemplate = session.template;
    validation = await validateSetup(interaction.guild, selectedTemplate);
    if (validation.issues.length) {
      releaseGuild(interaction.guildId);
      await interaction.update({
        content: `❌ La configuración cambió y no se puede iniciar:\n${validation.issues.map(issue => `• ${issue}`).join('\n')}`,
        embeds: [],
        components: []
      });
      return true;
    }
    const newlyFoundWarnings = validation.warnings.filter(warning =>
      !session.warnings.includes(warning)
    );
    if (newlyFoundWarnings.length) {
      session.status = 'pending';
      session.createdAt = Date.now();
      session.warnings = validation.warnings;
      await interaction.update(
        makePreview(
          interaction.guild,
          session.ownerId,
          session.nonce,
          selectedTemplate,
          validation.plan,
          validation.warnings,
          session.resuming
        )
      );
      return true;
    }
    initializeBatch(interaction.guildId, session.batchId, session.templateKey);
    await interaction.update({
      content: '⏳ Iniciando creación de la estructura del servidor…\n▱▱▱▱▱▱ 0%',
      embeds: [],
      components: progressComponents(session)
    });
    await runCreation(interaction.guild, session, selectedTemplate);
  } catch (error) {
    console.error('[CREATING] Error inesperado al confirmar la creación:', error);
    releaseGuild(interaction.guildId);
    cooldownByGuild.set(interaction.guildId, Date.now() + cooldownMs);
    const cause = error instanceof RegistryPersistenceError ? error.message : describeError(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({
        content: `❌ La creación se interrumpió por un error inesperado: ${cause}`,
        embeds: [],
        components: []
      });
    } else {
      await sendComponentError(interaction, `❌ No se pudo iniciar la creación: ${cause}`);
    }
  }
  return true;
}

module.exports = {
  beginCreating,
  handleCreatingButton,
  trackCreatedEntity,
  trackChannelReference,
  clearChannelReference,
  findResumableBatch,
  initializeBatch,
  setBatchStatus,
  logCreationAudit,
  getChannelReference,
  getChannelReferences,
  resolveDiscordChannelType,
  resolveForumReactionEmoji,
  orderCreatedRoles
};
