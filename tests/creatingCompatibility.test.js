const { ChannelType } = require('discord.js');
const {
  resolveDiscordChannelType,
  resolveForumReactionEmoji,
  orderCreatedRoles
} = require('../src/utils/creatingManager');

describe('/creating Discord compatibility', () => {
  test.each([
    ['text', ChannelType.GuildText],
    [' TEXT ', ChannelType.GuildText],
    ['voice', ChannelType.GuildVoice],
    ['forum', ChannelType.GuildForum],
    ['announcement', ChannelType.GuildAnnouncement],
    ['stage', ChannelType.GuildStageVoice]
  ])('resolves channel type %s', (type, expected) => {
    expect(resolveDiscordChannelType(type)).toBe(expected);
  });

  test('converts a Unicode forum reaction into Discord API shape', () => {
    expect(resolveForumReactionEmoji('💬')).toEqual({ id: null, name: '💬' });
    expect(resolveForumReactionEmoji(undefined)).toBeUndefined();
  });

  test('refreshes the bot role position before ordering the new roles', async () => {
    const calls = [];
    const guild = {
      roles: {
        fetch: jest.fn(async () => calls.push('fetch-roles')),
        setPositions: jest.fn(async positions => calls.push(positions))
      },
      members: {
        fetchMe: jest.fn(async () => {
          calls.push('fetch-bot');
          return { roles: { highest: { position: 23 } } };
        })
      }
    };

    await expect(orderCreatedRoles(guild, [{ id: 'owner' }, { id: 'admin' }])).resolves.toBe(true);

    expect(calls).toEqual([
      'fetch-roles',
      'fetch-bot',
      [{ role: 'owner', position: 22 }, { role: 'admin', position: 21 }]
    ]);
  });

  test('does not try to place more roles than fit below the bot role', async () => {
    const guild = {
      roles: {
        fetch: jest.fn(),
        setPositions: jest.fn()
      },
      members: {
        fetchMe: jest.fn(async () => ({ roles: { highest: { position: 2 } } }))
      }
    };

    await expect(orderCreatedRoles(guild, Array.from({ length: 20 }, (_, id) => ({ id })))
      ).resolves.toBe(false);

    expect(guild.roles.setPositions).not.toHaveBeenCalled();
  });
});
