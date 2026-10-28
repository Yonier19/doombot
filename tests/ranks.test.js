const rankStore = require('../src/utils/rankStore');
const rankConfig = require('../src/config/ranks.json');
const { isProtectedRole, hasForbiddenPermissions } = require('../src/utils/rankRoles');
const { isYoungAccount, startRaidWindow, renderDuration } = require('../src/utils/memberLifecycle');
const { getConfig, buildPanel, interpolate } = require('../src/utils/welcomeConfig');
const { requiresManualApproval } = require('../src/utils/welcomeInteractions');
const { handleWelcomeInteraction } = require('../src/utils/welcomeInteractions');
const { createMockInteraction } = require('./mocks/discordMocks');
const { PermissionFlagsBits } = require('discord.js');

describe('sistema de rangos', () => {
  const guildId = `rank-test-${Date.now()}`;
  const userId = 'user-rank-test';

  afterAll(() => {
    rankStore.db.prepare('DELETE FROM member_xp WHERE guild_id = ?').run(guildId);
    rankStore.db.prepare('DELETE FROM voice_sessions WHERE guild_id = ?').run(guildId);
    rankStore.db.prepare('DELETE FROM rank_roles WHERE guild_id = ?').run(guildId);
  });

  test('calculates progression and awards message XP once per cooldown', () => {
    expect(rankStore.getProgress(0)).toEqual({
      level: 0,
      xp: 0,
      progress: 0,
      needed: rankConfig.levelXpMultiplier
    });
    const first = rankStore.awardMessage(guildId, userId, 1_000_000);
    expect(first.xp).toBe(rankConfig.messageXp);
    expect(rankStore.awardMessage(guildId, userId, 1_030_000)).toBeNull();
    const afterCooldown = rankStore.awardMessage(guildId, userId, 1_060_000);
    expect(afterCooldown.xp).toBe(rankConfig.messageXp * 2);
  });

  test('awards voice XP in elapsed whole minutes and returns the top 10', () => {
    rankStore.startVoiceSession(guildId, userId, 'voice-test', 2_000_000);
    expect(rankStore.awardVoiceXp(guildId, userId, 2_180_000)).toBe(rankConfig.voiceXpPerMinute * 3);
    expect(rankStore.getLeaderboard(guildId)[0]).toEqual(expect.objectContaining({
      user_id: userId,
      level: 0,
      xp: rankConfig.messageXp * 2 + rankConfig.voiceXpPerMinute * 3
    }));
    rankStore.stopVoiceSession(guildId, userId);
  });

  test('prevents manual and automatic rank roles from being self-assigned', () => {
    expect(isProtectedRole('unconfigured-guild', { id: 'owner', name: 'Owner' })).toBe(true);
    expect(isProtectedRole('unconfigured-guild', { id: 'member', name: 'Miembro' })).toBe(true);
    expect(isProtectedRole('unconfigured-guild', { id: 'color', name: '🔴 Rojo' })).toBe(false);
    expect(hasForbiddenPermissions({
      permissions: { has: permission => permission === PermissionFlagsBits.ManageRoles }
    })).toBe(true);
  });

  test('detects young accounts, raid threshold and membership duration', () => {
    const now = 10 * 24 * 60 * 60 * 1000;
    expect(isYoungAccount({ createdTimestamp: now - 6 * 24 * 60 * 60 * 1000 }, now)).toBe(true);
    expect(isYoungAccount({ createdTimestamp: now - 7 * 24 * 60 * 60 * 1000 }, now)).toBe(false);
    for (let index = 0; index < 10; index++) {
      expect(startRaidWindow('raid-test-guild', now + index)).toBe(false);
    }
    expect(startRaidWindow('raid-test-guild', now + 10)).toBe(true);
    expect(renderDuration(26 * 60 * 60 * 1000 + 5 * 60 * 1000)).toBe('1 día y 2 horas y 5 minutos');
  });

  test('enforces manual verification only for young accounts during active raid mode', () => {
    const member = { user: { createdTimestamp: Date.now() - 2 * 24 * 60 * 60 * 1000 } };
    expect(requiresManualApproval(member, { raidModeUntil: Date.now() + 60_000 })).toBe(true);
    expect(requiresManualApproval(member, { raidModeUntil: 0 })).toBe(false);
    expect(interpolate('{usuario} · {servidor} · {numero}', {
      usuario: '@persona',
      servidor: 'Comunidad',
      numero: '42'
    })).toBe('@persona · Comunidad · 42');
  });

  test('builds a persistent admin panel with bounded component rows', () => {
    const panel = buildPanel(getConfig(`welcome-test-${Date.now()}`), { name: 'Servidor de prueba' });
    expect(panel.components).toHaveLength(3);
    const buttonIds = panel.components[2].toJSON().components.map(component => component.custom_id);
    expect(buttonIds).toEqual(['wcfg:channels', 'wcfg:edit', 'wcfg:preview']);
  });

  test.each(['wcfg:channels', 'wcfg:edit'])('builds a valid modal for %s', async customId => {
    const interaction = createMockInteraction({
      type: 'button',
      customId,
      guild: undefined
    });
    await handleWelcomeInteraction(interaction);
    expect(interaction.showModal).toHaveBeenCalledTimes(1);
    const modal = interaction.showModal.mock.calls[0][0].toJSON();
    expect(modal.components.length).toBeGreaterThan(0);
    for (const row of modal.components) {
      expect(row.components[0].label.length).toBeLessThanOrEqual(45);
    }
  });

  test('keeps every automatic and self-assignable configured role free of privileged permissions', () => {
    for (const role of rankConfig.rolesTopToBottom.filter(item => item.automatic || item.selfAssignable)) {
      expect(role.permissions).not.toEqual(expect.arrayContaining([
        'Administrator',
        'ManageRoles',
        'ManageChannels',
        'KickMembers',
        'BanMembers'
      ]));
    }
  });
});
