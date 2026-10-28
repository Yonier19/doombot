const rankConfig = require('../config/ranks.json');
const { db } = require('./sqliteDatabase');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS member_xp (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
    last_message_xp_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS voice_sessions (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    last_awarded_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS rank_roles (
    guild_id TEXT NOT NULL,
    role_key TEXT NOT NULL,
    role_id TEXT NOT NULL,
    PRIMARY KEY (guild_id, role_key),
    UNIQUE (guild_id, role_id)
  );
`);

const getMember = db.prepare(
  'SELECT guild_id, user_id, xp, last_message_xp_at FROM member_xp WHERE guild_id = ? AND user_id = ?'
);
const ensureMember = db.prepare(
  'INSERT OR IGNORE INTO member_xp (guild_id, user_id) VALUES (?, ?)'
);
const awardMessageXp = db.prepare(`
  UPDATE member_xp
  SET xp = xp + @amount, last_message_xp_at = @now
  WHERE guild_id = @guildId AND user_id = @userId
    AND last_message_xp_at <= @cutoff
`);
const awardXp = db.prepare(`
  INSERT INTO member_xp (guild_id, user_id, xp)
  VALUES (@guildId, @userId, @amount)
  ON CONFLICT(guild_id, user_id) DO UPDATE SET xp = xp + excluded.xp
`);
const getTop = db.prepare(`
  SELECT user_id, xp FROM member_xp
  WHERE guild_id = ?
  ORDER BY xp DESC, user_id ASC
  LIMIT 10
`);
const upsertVoice = db.prepare(`
  INSERT INTO voice_sessions (guild_id, user_id, channel_id, last_awarded_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(guild_id, user_id) DO UPDATE SET
    channel_id = excluded.channel_id,
    last_awarded_at = excluded.last_awarded_at
`);
const getVoice = db.prepare(
  'SELECT channel_id, last_awarded_at FROM voice_sessions WHERE guild_id = ? AND user_id = ?'
);
const deleteVoice = db.prepare(
  'DELETE FROM voice_sessions WHERE guild_id = ? AND user_id = ?'
);
const getVoiceSessions = db.prepare(
  'SELECT guild_id, user_id, channel_id, last_awarded_at FROM voice_sessions'
);
const getRole = db.prepare(
  'SELECT role_id FROM rank_roles WHERE guild_id = ? AND role_key = ?'
);
const getRoleKey = db.prepare(
  'SELECT role_key FROM rank_roles WHERE guild_id = ? AND role_id = ?'
);
const allRoles = db.prepare(
  'SELECT role_key, role_id FROM rank_roles WHERE guild_id = ?'
);
const setRole = db.prepare(`
  INSERT INTO rank_roles (guild_id, role_key, role_id) VALUES (?, ?, ?)
  ON CONFLICT(guild_id, role_key) DO UPDATE SET role_id = excluded.role_id
`);
const updateVoiceTime = db.prepare(`
  UPDATE voice_sessions SET last_awarded_at = ?
  WHERE guild_id = ? AND user_id = ? AND last_awarded_at = ?
`);
const awardVoiceTransaction = db.transaction((guildId, userId, previous, now, xpPerMinute) => {
  const elapsedMinutes = Math.floor((now - previous) / 60000);
  if (elapsedMinutes < 1) return 0;
  const result = updateVoiceTime.run(now, guildId, userId, previous);
  if (!result.changes) return 0;
  const xp = elapsedMinutes * xpPerMinute;
  awardXp.run({ guildId, userId, amount: xp });
  return xp;
});

function xpForLevel(level) {
  return rankConfig.levelXpMultiplier * level * (level + 1) / 2;
}

function levelForXp(xp) {
  let level = Math.max(0, Math.floor((Math.sqrt(1 + 8 * xp / rankConfig.levelXpMultiplier) - 1) / 2));
  while (xp < xpForLevel(level)) level--;
  while (xp >= xpForLevel(level + 1)) level++;
  return level;
}

function getProgress(xp) {
  const level = levelForXp(xp);
  const currentFloor = xpForLevel(level);
  const nextFloor = xpForLevel(level + 1);
  return {
    level,
    xp,
    progress: xp - currentFloor,
    needed: nextFloor - currentFloor
  };
}

function getMemberXp(guildId, userId) {
  ensureMember.run(guildId, userId);
  return getMember.get(guildId, userId);
}

function awardMessage(guildId, userId, now = Date.now()) {
  ensureMember.run(guildId, userId);
  const result = awardMessageXp.run({
    amount: rankConfig.messageXp,
    now,
    cutoff: now - rankConfig.messageCooldownSeconds * 1000,
    guildId,
    userId
  });
  return result.changes === 1 ? getMember.get(guildId, userId) : null;
}

function addXp(guildId, userId, amount) {
  awardXp.run({ guildId, userId, amount });
  return getMemberXp(guildId, userId);
}

function getLeaderboard(guildId) {
  return getTop.all(guildId).map((entry, index) => ({
    ...entry,
    position: index + 1,
    ...getProgress(entry.xp)
  }));
}

function startVoiceSession(guildId, userId, channelId, now = Date.now()) {
  upsertVoice.run(guildId, userId, channelId, now);
}

function getVoiceSession(guildId, userId) {
  return getVoice.get(guildId, userId);
}

function stopVoiceSession(guildId, userId) {
  deleteVoice.run(guildId, userId);
}

function getAllVoiceSessions() {
  return getVoiceSessions.all();
}

function awardVoiceXp(guildId, userId, now = Date.now()) {
  const session = getVoiceSession(guildId, userId);
  if (!session) return 0;
  return awardVoiceTransaction(
    guildId,
    userId,
    session.last_awarded_at,
    now,
    rankConfig.voiceXpPerMinute
  );
}

function setRankRole(guildId, roleKey, roleId) {
  setRole.run(guildId, roleKey, roleId);
}

function getRankRole(guildId, roleKey) {
  return getRole.get(guildId, roleKey)?.role_id || null;
}

function getRankRoleKey(guildId, roleId) {
  return getRoleKey.get(guildId, roleId)?.role_key || null;
}

function getRankRoles(guildId) {
  return allRoles.all(guildId);
}

module.exports = {
  db,
  getProgress,
  levelForXp,
  getMemberXp,
  awardMessage,
  addXp,
  getLeaderboard,
  startVoiceSession,
  getVoiceSession,
  stopVoiceSession,
  getAllVoiceSessions,
  awardVoiceXp,
  setRankRole,
  getRankRole,
  getRankRoleKey,
  getRankRoles
};
