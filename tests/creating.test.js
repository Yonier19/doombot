const { ChannelType, PermissionFlagsBits } = require('discord.js');
const {
  createMockChannel,
  createMockGuild,
  createMockInteraction,
  createMockRole
} = require('./mocks/discordMocks');
const creatingCommand = require('../src/commands/servidor/creating');
const messageCreateEvent = require('../src/events/client/messageCreate');
const {
  handleCreatingButton,
  findResumableBatch,
  initializeBatch,
  setBatchStatus
} = require('../src/utils/creatingManager');
const templates = require('../src/config/templates.json');
const template = templates.comunidad;
const { checkTemplateCapacity } = require('../src/utils/templateCapacity');
const { executeWizardCreation } = require('../src/utils/wizardExecutor');

describe('/creating command', () => {
  const originalPrefixEnabled = process.env.ENABLE_PREFIX_COMMANDS;
  const originalPrefix = process.env.PREFIX;

  afterEach(() => {
    if (originalPrefixEnabled === undefined) delete process.env.ENABLE_PREFIX_COMMANDS;
    else process.env.ENABLE_PREFIX_COMMANDS = originalPrefixEnabled;
    if (originalPrefix === undefined) delete process.env.PREFIX;
    else process.env.PREFIX = originalPrefix;
    jest.restoreAllMocks();
  });

  test('denies non-administrators with the requested message', async () => {
    const interaction = createMockInteraction({
      commandName: 'creating',
      isAdmin: false
    });

    await creatingCommand.execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
      content: 'Necesitas permisos de administrador para usar este comando.',
      ephemeral: true
    }));
  });

  test('explains missing bot permissions before showing confirmation', async () => {
    const guild = createMockGuild();
    guild.id = 'creating-missing-permissions';
    guild.members.me.permissions.has = jest.fn(permission =>
      permission !== PermissionFlagsBits.ManageChannels
    );
    const interaction = createMockInteraction({ commandName: 'creating', guild });

    await creatingCommand.execute(interaction);

    expect(interaction.reply).toHaveBeenCalledTimes(1);
    expect(interaction.reply.mock.calls[0][0].content).toContain('Gestionar canales');
    expect(interaction.reply.mock.calls[0][0].components).toBeUndefined();
  });

  test('blocks roles at or above the bot role before confirmation', async () => {
    const guild = createMockGuild();
    guild.id = 'creating-hierarchy-test';
    guild.roles.cache.set('existing-admin', createMockRole('existing-admin', 'Admin', 50));
    const interaction = createMockInteraction({ commandName: 'creating', guild });

    await creatingCommand.execute(interaction);

    expect(interaction.reply.mock.calls[0][0].content).toContain('El rol del bot debe estar por encima');
    expect(interaction.reply.mock.calls[0][0].components).toBeUndefined();
  });

  test('recognizes all matching roles and channels as duplicates', async () => {
    const guild = createMockGuild();
    guild.id = 'creating-duplicate-test';
    for (const role of template.roles) {
      guild.roles.cache.set(`existing-${role.nombre}`, createMockRole(`existing-${role.nombre}`, role.nombre, 2));
    }
    for (const category of template.categorias) {
      guild.channels.cache.set(`existing-category-${category.nombre}`, createMockChannel(
        `existing-category-${category.nombre}`,
        category.nombre,
        ChannelType.GuildCategory
      ));
      for (const channel of category.canales) {
        const type = ({
          voice: ChannelType.GuildVoice,
          voz: ChannelType.GuildVoice,
          forum: ChannelType.GuildForum,
          announcement: ChannelType.GuildAnnouncement,
          stage: ChannelType.GuildStageVoice
        })[channel.tipo] || ChannelType.GuildText;
        guild.channels.cache.set(`existing-channel-${category.nombre}-${channel.nombre}`, createMockChannel(
          `existing-channel-${category.nombre}-${channel.nombre}`,
          channel.nombre,
          type
        ));
      }
    }
    const interaction = createMockInteraction({ commandName: 'creating', guild });

    await creatingCommand.execute(interaction);

    const embed = interaction.reply.mock.calls[0][0].embeds[0].toJSON();
    expect(embed.description).toContain('0 rol(es), 0 categoría(s) y 0 canal(es)');
  });

  test('persists an incomplete batch for safe continuation after restart', () => {
    const guildId = `resume-test-${Date.now()}`;
    initializeBatch(guildId, 'resume-batch', 'comunidad');
    expect(findResumableBatch(guildId, 'comunidad')).toBe('resume-batch');
    setBatchStatus(guildId, 'resume-batch', 'partial');
    expect(findResumableBatch(guildId, 'comunidad')).toBe('resume-batch');
    setBatchStatus(guildId, 'resume-batch', 'completed');
    expect(findResumableBatch(guildId, 'comunidad')).toBeNull();
  });

  test.each(Object.entries(templates))('%s template includes the modular professional structure', (key, currentTemplate) => {
    const categoriesByKey = new Map(currentTemplate.categorias.map(category => [category.key, category]));
    expect(currentTemplate.categorias).toHaveLength(38);
    expect(currentTemplate.categorias.reduce((count, category) => count + category.canales.length, 0)).toBeGreaterThanOrEqual(300);
    expect(currentTemplate.categorias.reduce((count, category) => count + category.canales.length, 0)).toBeLessThanOrEqual(400);
    for (const category of currentTemplate.categorias) {
      expect(category.canales.length).toBeGreaterThanOrEqual(7);
      expect(category.canales.length).toBeLessThanOrEqual(25);
      expect(category.nombre).toMatch(/^[^a-z]*[A-ZÁÉÍÓÚÜÑ]/u);
    }
    expect(categoriesByKey.get('inicio').canales.map(channel => channel.key)).toEqual(expect.arrayContaining([
      'bienvenida', 'reglas', 'anuncios', 'novedades', 'roles-y-niveles', 'faq', 'enlaces', 'verificacion', 'despedidas'
    ]));
    expect(categoriesByKey.get('soporte').canales.find(channel => channel.key === 'sugerencias').tipo).toBe('forum');
    expect(categoriesByKey.get('tienda').canales.find(channel => channel.key === 'resenas').tipo).toBe('forum');
    expect(categoriesByKey.get('escenarios').canales.some(channel => channel.tipo === 'stage')).toBe(true);
    expect(categoriesByKey.get('voz-general').canales.every(channel => channel.tipo === 'voice')).toBe(true);
    const channelsByKey = new Map(currentTemplate.categorias.flatMap(category => category.canales)
      .map(channel => [channel.key, channel]));
    for (const key of ['comandos-bot', 'musica-comandos', 'comandos-staff']) {
      expect(channelsByKey.get(key).botCommands).toBe(true);
    }
    expect(currentTemplate.roles.some(role => role.key === 'new' && role.nombre === 'Nuevo')).toBe(true);
    expect(categoriesByKey.get('staff').permisos.private).toBe(true);
    expect(categoriesByKey.get('registros').permisos.private).toBe(true);
    expect(categoriesByKey.get('vip-boosters').permisos.private).toBe(true);
    expect(categoriesByKey.get('inicio').permisos.newVisible).toBe(true);
    expect(categoriesByKey.get('informacion').permisos.newVisible).toBe(true);
    expect(categoriesByKey.get('soporte').permisos.newVisible).toBe(true);
    for (const category of currentTemplate.categorias) {
      expect(category.canales.length).toBeLessThanOrEqual(50);
      for (const channel of category.canales) {
        expect(channel.tema).toEqual(expect.any(String));
        expect(channel.slowmode).toEqual(expect.any(Number));
        expect(channel.nombre).toMatch(/[\p{Emoji}]/u);
      }
    }
  });

  test('prevents creating a template that exceeds the 500-channel server limit', async () => {
    const guild = createMockGuild();
    guild.id = 'creating-channel-limit-test';
    for (let index = 0; index < 490; index++) {
      const channel = createMockChannel(`existing-${index}`, `existing-${index}`);
      guild.channels.cache.set(channel.id, channel);
    }

    const capacity = checkTemplateCapacity(guild, template);
    expect(capacity.issues.some(issue => issue.includes('límite del servidor es 500'))).toBe(true);

    const interaction = createMockInteraction({ commandName: 'creating', guild });
    await creatingCommand.execute(interaction);
    expect(interaction.reply.mock.calls[0][0].content).toContain('límite del servidor es 500');
    expect(interaction.reply.mock.calls[0][0].components).toBeUndefined();
    expect(guild.channels.create).not.toHaveBeenCalled();
  });

  test('checks the 50-channel category limit and blocks setup before creating anything', async () => {
    const guild = createMockGuild();
    guild.id = 'setup-category-limit-test';
    const category = createMockChannel('crowded-category', '📁 📰 INFORMACIÓN ⚡', ChannelType.GuildCategory);
    guild.channels.cache.set(category.id, category);
    for (let index = 0; index < 50; index++) {
      const channel = createMockChannel(`child-${index}`, `child-${index}`, ChannelType.GuildText, category.id);
      guild.channels.cache.set(channel.id, channel);
    }
    const capacity = checkTemplateCapacity(guild, template, {
      categoryName: current => `📁 ${current.nombre} ⚡`
    });
    expect(capacity.issues.some(issue => issue.includes('máximo por categoría es 50'))).toBe(true);

    const interaction = createMockInteraction({ guild });
    await executeWizardCreation(interaction, {
      template: 'comunidad',
      roles: { admin: true, moderador: true, miembro: true, silenciado: true },
      modules: [],
      custom: { categoryPrefix: '📁', decorativeEmoji: '⚡', serverName: '' }
    });
    expect(interaction.editReply.mock.calls[0][0].content).toContain('máximo por categoría es 50');
    expect(guild.channels.create).not.toHaveBeenCalled();
    expect(guild.roles.create).not.toHaveBeenCalled();
  });

  test('checks the 250-role limit before creation', () => {
    const guild = createMockGuild();
    guild.id = 'creating-role-limit-test';
    for (let index = 0; index < 247; index++) {
      const role = createMockRole(`existing-role-${index}`, `existing-role-${index}`, 1);
      guild.roles.cache.set(role.id, role);
    }

    const capacity = checkTemplateCapacity(guild, template);
    expect(capacity.issues.some(issue => issue.includes('límite del servidor es 250'))).toBe(true);
  });

  test('shows confirmation and prevents another active run in the same guild', async () => {
    const guild = createMockGuild();
    guild.id = 'creating-lock-test';
    const first = createMockInteraction({ commandName: 'creating', guild });
    const second = createMockInteraction({ commandName: 'creating', guild });

    await creatingCommand.execute(first);
    await creatingCommand.execute(second);

    expect(first.reply.mock.calls[0][0].components).toHaveLength(2);
    expect(second.reply).toHaveBeenCalledWith(expect.objectContaining({
      content: 'Ya hay una creación en proceso.',
      ephemeral: true
    }));

    const cancelId = first.reply.mock.calls[0][0].components[1].components[1].data.custom_id;
    const outsider = createMockInteraction({
      type: 'button',
      customId: cancelId,
      userId: 'different-user',
      guild
    });
    await handleCreatingButton(outsider);
    expect(outsider.reply).toHaveBeenCalledWith(expect.objectContaining({
      content: 'Solo quien ejecutó la creación puede pulsar estos botones.',
      ephemeral: true
    }));

    const cancel = createMockInteraction({
      type: 'button',
      customId: cancelId,
      guild
    });
    await handleCreatingButton(cancel);
    expect(cancel.update).toHaveBeenCalledWith(expect.objectContaining({
      content: '❌ Creación cancelada. No se realizaron cambios.'
    }));
  });

  test('/creating accepts the selected template', async () => {
    const guild = createMockGuild();
    guild.id = 'creating-selected-template-test';
    const interaction = createMockInteraction({
      commandName: 'creating',
      guild,
      options: { plantilla: 'gaming' }
    });

    await creatingCommand.execute(interaction);

    let preview = interaction.reply.mock.calls[0][0];
    let nextPage;
    while (!preview.embeds[0].toJSON().description.includes('busco-equipo')) {
      const pageId = preview.components[0].components[1].data.custom_id;
      nextPage = createMockInteraction({ type: 'button', customId: pageId, guild });
      await handleCreatingButton(nextPage);
      preview = nextPage.update.mock.calls[0][0];
    }
    expect(preview.embeds[0].toJSON().description).toContain('busco-equipo');
    const cancelId = interaction.reply.mock.calls[0][0].components[1].components[1].data.custom_id;
    const cancel = createMockInteraction({ type: 'button', customId: cancelId, guild });
    await handleCreatingButton(cancel);
  });

  test('only the creator can use the undo button', async () => {
    const guild = createMockGuild();
    const interaction = createMockInteraction({
      type: 'button',
      customId: 'creating:undo:user-admin-123:nonce',
      userId: 'another-user',
      guild
    });

    await handleCreatingButton(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
      content: 'Solo quien ejecutó la creación puede deshacerla.',
      ephemeral: true
    }));
  });

  test('prefix handler is gated and ignores bots and DMs', async () => {
    const executePrefix = jest.spyOn(creatingCommand, 'executePrefix').mockResolvedValue();
    const createMessage = overrides => ({
      guild: { id: 'prefix-test' },
      author: { bot: false },
      content: '!creating',
      reply: jest.fn(),
      ...overrides
    });

    process.env.ENABLE_PREFIX_COMMANDS = 'false';
    await messageCreateEvent.execute(createMessage({}));
    process.env.ENABLE_PREFIX_COMMANDS = 'true';
    await messageCreateEvent.execute(createMessage({ guild: null }));
    await messageCreateEvent.execute(createMessage({ author: { bot: true } }));
    await messageCreateEvent.execute(createMessage({ content: 'hola' }));
    expect(executePrefix).not.toHaveBeenCalled();
  });

  test('prefix handler dispatches the configured prefix', async () => {
    const executePrefix = jest.spyOn(creatingCommand, 'executePrefix').mockResolvedValue();
    const message = {
      guild: { id: 'custom-prefix-test' },
      author: { bot: false },
      content: '$CREATING',
      reply: jest.fn()
    };
    process.env.ENABLE_PREFIX_COMMANDS = 'true';
    process.env.PREFIX = '$';

    await messageCreateEvent.execute(message);

    expect(executePrefix).toHaveBeenCalledWith(message);
  });
});
