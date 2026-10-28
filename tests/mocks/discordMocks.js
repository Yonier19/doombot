const { PermissionFlagsBits, ChannelType, Collection } = require('discord.js');

function createMockRole(id, name, position = 1, permissions = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]) {
  const permSet = new Set(permissions);
  return {
    id,
    name,
    position,
    managed: false,
    permissions: {
      has: jest.fn(perm => permSet.has(perm))
    }
  };
}

function createMockChannel(id, name, type = ChannelType.GuildText, parentId = null) {
  return {
    id,
    name,
    type,
    parentId,
    isTextBased: () => type === ChannelType.GuildText,
    delete: jest.fn().mockResolvedValue(true),
    send: jest.fn().mockResolvedValue({ id: 'sent-msg-id' })
  };
}

function createMockGuild() {
  const roles = new Collection();
  const channels = new Collection();

  const everyoneRole = createMockRole('guild-id-123', '@everyone', 0, []);
  const botRole = createMockRole('bot-role-id', 'AutoSetupBot', 50, [
    PermissionFlagsBits.Administrator,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.ViewChannel
  ]);

  roles.set(everyoneRole.id, everyoneRole);
  roles.set(botRole.id, botRole);

  const guild = {
    id: 'guild-id-123',
    name: 'Servidor de Pruebas Unitarias',
    iconURL: () => 'https://cdn.discordapp.com/icons/123/abc.png',
    memberCount: 42,
    setName: jest.fn().mockResolvedValue(true),
    roles: {
      cache: roles,
      everyone: everyoneRole,
      create: jest.fn().mockImplementation(async (opts) => {
        const newRole = createMockRole(`role-${Date.now()}-${Math.random()}`, opts.name, 10, opts.permissions || []);
        roles.set(newRole.id, newRole);
        return newRole;
      })
    },
    channels: {
      cache: channels,
      create: jest.fn().mockImplementation(async (opts) => {
        const newCh = createMockChannel(`ch-${Date.now()}-${Math.random()}`, opts.name, opts.type, opts.parent);
        channels.set(newCh.id, newCh);
        return newCh;
      })
    },
    members: {
      cache: new Map(),
      me: {
        id: 'bot-client-id',
        user: { username: 'AutoSetupBot', tag: 'AutoSetupBot#0001' },
        roles: {
          highest: botRole,
          cache: new Map([[botRole.id, botRole]])
        },
        permissions: {
          has: jest.fn(perms => {
            if (Array.isArray(perms)) return perms.every(p => botRole.permissions.has(p));
            return botRole.permissions.has(perms);
          })
        }
      }
    }
  };

  return guild;
}

function createMockMember(userId = 'user-admin-123', isAdmin = true, guild) {
  const memberRoles = new Collection();
  return {
    id: userId,
    user: { id: userId, username: 'TesterUser', tag: 'TesterUser#1234' },
    guild,
    roles: {
      cache: memberRoles,
      highest: { position: 1 },
      add: jest.fn().mockImplementation(async (role) => {
        memberRoles.set(role.id, role);
        return true;
      }),
      remove: jest.fn().mockImplementation(async (role) => {
        memberRoles.delete(role.id);
        return true;
      })
    },
    permissions: {
      has: jest.fn(perm => {
        if (isAdmin) return true;
        if (perm === PermissionFlagsBits.Administrator) return false;
        if (perm === PermissionFlagsBits.ManageRoles) return false;
        if (perm === PermissionFlagsBits.ManageChannels) return false;
        return true;
      })
    }
  };
}

function createMockInteraction({
  type = 'chatInput',
  commandName = 'panel',
  customId = '',
  userId = 'user-admin-123',
  isAdmin = true,
  guild,
  options = {}
}) {
  const currentGuild = guild || createMockGuild();
  const member = createMockMember(userId, isAdmin, currentGuild);

  let responseCount = 0;

  const interaction = {
    id: 'interaction-id-999',
    type,
    commandName,
    customId,
    guildId: currentGuild.id,
    guild: currentGuild,
    member,
    user: member.user,
    channel: createMockChannel('current-ch-id', 'comandos-staff'),
    createdTimestamp: Date.now(),
    replied: false,
    deferred: false,
    isRepliable: () => true,
    isChatInputCommand: () => type === 'chatInput',
    isButton: () => type === 'button',
    isStringSelectMenu: () => type === 'selectMenu',
    isModalSubmit: () => type === 'modalSubmit',
    options: {
      getRole: jest.fn(name => options[name] || null),
      getChannel: jest.fn(name => options[name] || null),
      getString: jest.fn(name => options[name] || null),
      getInteger: jest.fn(name => options[name] || null),
      getBoolean: jest.fn(name => options[name] || null)
    },
    values: options.values || [],
    fields: {
      getTextInputValue: jest.fn(customId => options[customId] || '')
    },
    reply: jest.fn().mockImplementation(async () => {
      responseCount++;
      if (responseCount > 1) {
        throw new Error('Interaction already replied (Double Response Detected!)');
      }
      interaction.replied = true;
      return true;
    }),
    deferReply: jest.fn().mockImplementation(async () => {
      responseCount++;
      if (responseCount > 1) {
        throw new Error('Interaction already replied (Double Response Detected!)');
      }
      interaction.deferred = true;
      return true;
    }),
    deferUpdate: jest.fn().mockImplementation(async () => {
      responseCount++;
      if (responseCount > 1) {
        throw new Error('Interaction already replied (Double Response Detected!)');
      }
      interaction.deferred = true;
      return true;
    }),
    update: jest.fn().mockImplementation(async () => {
      responseCount++;
      if (responseCount > 1) {
        throw new Error('Interaction already replied (Double Response Detected!)');
      }
      interaction.replied = true;
      return true;
    }),
    editReply: jest.fn().mockResolvedValue(true),
    followUp: jest.fn().mockResolvedValue(true),
    showModal: jest.fn().mockImplementation(async () => {
      responseCount++;
      if (responseCount > 1) {
        throw new Error('Interaction already replied (Double Response Detected!)');
      }
      interaction.replied = true;
      return true;
    }),
    getResponseCount: () => responseCount
  };

  return interaction;
}

module.exports = {
  createMockRole,
  createMockChannel,
  createMockGuild,
  createMockMember,
  createMockInteraction
};
