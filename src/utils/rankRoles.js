const { PermissionFlagsBits } = require('discord.js');
const rankConfig = require('../config/ranks.json');
const rankStore = require('./rankStore');

const forbiddenAutomaticPermissions = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.ModerateMembers
];
const manualRoleNames = new Set(
  rankConfig.rolesTopToBottom
    .filter(role => !role.automatic && !role.selfAssignable)
    .map(role => normalizeName(role.name))
);
const missingRoleWarnings = new Set();

function normalizeName(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function hasForbiddenPermissions(role) {
  return forbiddenAutomaticPermissions.some(permission => role.permissions.has(permission));
}

function isProtectedRole(guildId, role) {
  if (!role) return true;
  const mappedKey = rankStore.getRankRoleKey(guildId, role.id);
  if (mappedKey) {
    const definition = rankConfig.rolesTopToBottom.find(item => item.key === mappedKey);
    return !definition?.selfAssignable;
  }
  if (manualRoleNames.has(normalizeName(role.name))) return true;
  return rankConfig.rolesTopToBottom.some(definition =>
    (definition.automatic || !definition.selfAssignable) &&
    normalizeName(definition.name) === normalizeName(role.name)
  );
}

function resolveRole(guild, key) {
  const roleId = rankStore.getRankRole(guild.id, key);
  if (roleId) return guild.roles.cache.get(roleId) || null;
  const definition = rankConfig.rolesTopToBottom.find(role => role.key === key);
  return definition
    ? guild.roles.cache.find(role => normalizeName(role.name) === normalizeName(definition.name)) || null
    : null;
}

async function canManageRole(guild, role, automatic) {
  const botMember = guild.members.me || await guild.members.fetchMe();
  if (role.managed) {
    return { ok: false, reason: `El rol @${role.name} está administrado por una integración y no puede gestionarse.` };
  }
  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return { ok: false, reason: 'Al bot le falta Gestionar roles (ManageRoles).' };
  }
  if (botMember.roles.highest.position <= role.position) {
    return {
      ok: false,
      reason: `El rol del bot debe estar por encima de @${role.name} para poder asignarlo.`
    };
  }
  if (automatic && hasForbiddenPermissions(role)) {
    return {
      ok: false,
      reason: `El rol automático @${role.name} tiene permisos privilegiados y se bloqueó su asignación.`
    };
  }
  return { ok: true };
}

async function setMemberRole(member, key, shouldHave, reason) {
  const role = resolveRole(member.guild, key);
  if (!role) {
    const warningKey = `${member.guild.id}:${key}`;
    if (!missingRoleWarnings.has(warningKey)) {
      missingRoleWarnings.add(warningKey);
      console.warn(`[RANGOS] Falta el rol configurado "${key}" en ${member.guild.id}; usa /configurar-rangos.`);
    }
    return false;
  }
  const definition = rankConfig.rolesTopToBottom.find(item => item.key === key);
  if (!definition?.automatic) {
    console.error(`[RANGOS] Se bloqueó un intento de asignación automática del rol manual "${key}" en ${member.guild.id}.`);
    return false;
  }
  const safety = await canManageRole(member.guild, role, Boolean(definition?.automatic));
  if (!safety.ok) {
    console.warn(`[RANGOS] No se pudo gestionar ${role.name} para ${member.id}: ${safety.reason}`);
    return false;
  }
  const currentlyHasRole = member.roles.cache.has(role.id);
  if (currentlyHasRole === shouldHave) return true;
  if (shouldHave) await member.roles.add(role, reason);
  else await member.roles.remove(role, reason);
  return true;
}

async function syncLevelRole(member, level) {
  const levelRoles = rankConfig.rolesTopToBottom.filter(role => Number.isInteger(role.level));
  const desiredRole = [...levelRoles]
    .filter(role => level >= role.level)
    .sort((a, b) => b.level - a.level)[0];
  for (const definition of levelRoles) {
    await setMemberRole(
      member,
      definition.key,
      definition.key === desiredRole?.key,
      `Actualización automática del nivel ${level}`
    );
  }
}

module.exports = {
  normalizeName,
  hasForbiddenPermissions,
  isProtectedRole,
  resolveRole,
  canManageRole,
  setMemberRole,
  syncLevelRole,
  forbiddenAutomaticPermissions
};
