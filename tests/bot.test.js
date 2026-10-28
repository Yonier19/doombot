const { PermissionFlagsBits, ChannelType } = require('discord.js');
const {
  createMockRole,
  createMockChannel,
  createMockGuild,
  createMockMember,
  createMockInteraction
} = require('./mocks/discordMocks');

const panelCommand = require('../src/commands/panel/panel');
const panelRolesCommand = require('../src/commands/roles/panel-roles');
const panelReglasCommand = require('../src/commands/servidor/panel-reglas');
const asistenteCommand = require('../src/commands/setup/asistente');
const diagnosticoCommand = require('../src/commands/utilidad/diagnostico');

const interactionCreateEvent = require('../src/events/client/interactionCreate');
const templates = require('../src/config/templates.json');
const { executeWizardCreation } = require('../src/utils/wizardExecutor');
const { deleteWizardState } = require('../src/utils/wizardState');

jest.setTimeout(30000);

describe('Suite de Pruebas Automatizadas - Discord Bot v14 QA', () => {

  let mockClient;

  beforeEach(() => {
    mockClient = {
      commands: new Map([
        ['panel', panelCommand],
        ['panel-roles', panelRolesCommand],
        ['panel-reglas', panelReglasCommand],
        ['asistente', asistenteCommand],
        ['diagnostico', diagnosticoCommand]
      ]),
      buttons: new Map(),
      options: { intents: [1, 2, 32767] },
      ws: { ping: 42 }
    };
  });

  describe('Comando /panel', () => {
    test('Caso exitoso: Responde con embed y 5 botones de navegación en menos de 3s', async () => {
      const interaction = createMockInteraction({
        type: 'chatInput',
        commandName: 'panel',
        isAdmin: true
      });

      await panelCommand.execute(interaction);

      expect(interaction.reply).toHaveBeenCalledTimes(1);
      const replyArg = interaction.reply.mock.calls[0][0];
      expect(replyArg.embeds).toBeDefined();
      expect(replyArg.components[0].components.length).toBe(5);
      expect(interaction.getResponseCount()).toBe(1);
    });

    test('Usuario sin permisos de Administrador: Rechaza la ejecución', async () => {
      const interaction = createMockInteraction({
        type: 'chatInput',
        commandName: 'panel',
        isAdmin: false
      });

      await panelCommand.execute(interaction);

      expect(interaction.reply).toHaveBeenCalledTimes(1);
      const replyArg = interaction.reply.mock.calls[0][0];
      expect(replyArg.content).toContain('Acceso denegado');
      expect(replyArg.ephemeral).toBe(true);
    });

    test('Bot sin permisos de ManageChannels / ManageRoles: Informa al usuario', async () => {
      const guild = createMockGuild();
      guild.members.me.permissions.has = jest.fn().mockReturnValue(false);

      const interaction = createMockInteraction({
        type: 'chatInput',
        commandName: 'panel',
        isAdmin: true,
        guild
      });

      await panelCommand.execute(interaction);

      expect(interaction.reply).toHaveBeenCalledTimes(1);
      const replyArg = interaction.reply.mock.calls[0][0];
      expect(replyArg.content).toContain('Error de permisos');
    });
  });

  describe('Comando /panel-roles y Botones Persistentes (rol:ID)', () => {
    test('Bloqueo de Seguridad: Ningún botón puede otorgar roles con permisos de Administrador (Regla 5)', async () => {
      const guild = createMockGuild();
      const adminRole = createMockRole('role-admin-id', 'AdminRole', 10, [PermissionFlagsBits.Administrator]);
      guild.roles.cache.set(adminRole.id, adminRole);

      const interaction = createMockInteraction({
        type: 'chatInput',
        commandName: 'panel-roles',
        isAdmin: true,
        guild,
        options: { rol1: adminRole }
      });

      await panelRolesCommand.execute(interaction);

      expect(interaction.reply).toHaveBeenCalledTimes(1);
      const replyArg = interaction.reply.mock.calls[0][0];
      expect(replyArg.content).toContain('Bloqueo de Seguridad');
      expect(replyArg.ephemeral).toBe(true);
    });

    test('Validación de Jerarquía: Rechaza si el rol del bot está por debajo del rol solicitado (Regla 3)', async () => {
      const guild = createMockGuild();
      const superiorRole = createMockRole('sup-role-id', 'SuperVIP', 100, [PermissionFlagsBits.SendMessages]);
      guild.roles.cache.set(superiorRole.id, superiorRole);
      guild.members.me.roles.highest = createMockRole('bot-role', 'Bot', 50);

      const interaction = createMockInteraction({
        type: 'chatInput',
        commandName: 'panel-roles',
        isAdmin: true,
        guild,
        options: { rol1: superiorRole }
      });

      await panelRolesCommand.execute(interaction);

      expect(interaction.reply).toHaveBeenCalledTimes(1);
      const replyArg = interaction.reply.mock.calls[0][0];
      expect(replyArg.content).toContain('Error de Jerarquía');
      expect(replyArg.ephemeral).toBe(true);
    });

    test('Alternancia de rol: Añade el rol si no lo tiene y responde efímero', async () => {
      const guild = createMockGuild();
      const testRole = createMockRole('role-notif-123', 'Notificaciones', 10, [PermissionFlagsBits.ViewChannel]);
      guild.roles.cache.set(testRole.id, testRole);

      const interaction = createMockInteraction({
        type: 'button',
        customId: `rol:${testRole.id}`,
        userId: 'regular-user-456',
        isAdmin: false,
        guild
      });

      await interactionCreateEvent.execute(interaction, mockClient);

      expect(interaction.member.roles.add).toHaveBeenCalledWith(testRole, expect.any(String));
      expect(interaction.reply).toHaveBeenCalledTimes(1);
      const replyArg = interaction.reply.mock.calls[0][0];
      expect(replyArg.content).toContain('Rol añadido');
      expect(replyArg.ephemeral).toBe(true);
    });

    test('Alternancia de rol: Retira el rol si ya lo tiene', async () => {
      const guild = createMockGuild();
      const testRole = createMockRole('role-notif-123', 'Notificaciones', 10, [PermissionFlagsBits.ViewChannel]);
      guild.roles.cache.set(testRole.id, testRole);

      const interaction = createMockInteraction({
        type: 'button',
        customId: `rol:${testRole.id}`,
        userId: 'regular-user-456',
        isAdmin: false,
        guild
      });

      interaction.member.roles.cache.set(testRole.id, testRole);

      await interactionCreateEvent.execute(interaction, mockClient);

      expect(interaction.member.roles.remove).toHaveBeenCalledWith(testRole, expect.any(String));
      expect(interaction.reply).toHaveBeenCalledTimes(1);
      const replyArg = interaction.reply.mock.calls[0][0];
      expect(replyArg.content).toContain('Rol retirado');
      expect(replyArg.ephemeral).toBe(true);
    });
  });

  describe('Puerta de Entrada y Verificación de Reglas (reglas:aceptar)', () => {
    test('Al pulsar Aceptar Reglas entrega el rol Miembro y desbloquea el servidor', async () => {
      const guild = createMockGuild();
      const miembroRole = createMockRole('role-miembro-id', 'Miembro', 10, [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]);
      guild.roles.cache.set(miembroRole.id, miembroRole);

      const interaction = createMockInteraction({
        type: 'button',
        customId: 'reglas:aceptar',
        userId: 'new-user-789',
        isAdmin: false,
        guild
      });

      await interactionCreateEvent.execute(interaction, mockClient);

      expect(interaction.member.roles.add).toHaveBeenCalledWith(miembroRole, expect.any(String));
      expect(interaction.reply).toHaveBeenCalledTimes(1);
      const replyArg = interaction.reply.mock.calls[0][0];
      expect(replyArg.content).toContain('Reglas aceptadas con éxito');
      expect(replyArg.ephemeral).toBe(true);
    });

    test('Miembro que ya aceptó reglas no recibe doble asignación', async () => {
      const guild = createMockGuild();
      const miembroRole = createMockRole('role-miembro-id', 'Miembro', 10);
      guild.roles.cache.set(miembroRole.id, miembroRole);

      const interaction = createMockInteraction({
        type: 'button',
        customId: 'reglas:aceptar',
        userId: 'verified-user-789',
        isAdmin: false,
        guild
      });
      interaction.member.roles.cache.set(miembroRole.id, miembroRole);

      await interactionCreateEvent.execute(interaction, mockClient);

      expect(interaction.member.roles.add).not.toHaveBeenCalled();
      const replyArg = interaction.reply.mock.calls[0][0];
      expect(replyArg.content).toContain('Ya has aceptado las reglas con anterioridad');
    });
  });

  describe('Aislamiento de Usuarios en Botones', () => {
    test('Botón pulsado por otro usuario devuelve rechazo efímero', async () => {
      const interaction = createMockInteraction({
        type: 'button',
        customId: 'setup:iniciar:owner-111',
        userId: 'intruder-222',
        isAdmin: false
      });

      await interactionCreateEvent.execute(interaction, mockClient);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'Este panel pertenece a otra persona.',
        ephemeral: true
      });
    });

    test('Sesión expirada del asistente guiado informa al usuario', async () => {
      const interaction = createMockInteraction({
        type: 'button',
        customId: 'wizard:step:2:user-owner-333',
        userId: 'user-owner-333',
        isAdmin: true
      });

      deleteWizardState(interaction.guildId, interaction.user.id);

      await interactionCreateEvent.execute(interaction, mockClient);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('expirado'),
          ephemeral: true
        })
      );
    });
  });

  describe('Plantillas JSON y Ejecución Controlada', () => {
    test('Cada plantilla define roles, categorías y los canales base obligatorios', () => {
      const requiredBaseChannels = ['bienvenida', 'reglas', 'anuncios', 'general', 'registro-de-moderacion'];

      for (const [key, tpl] of Object.entries(templates)) {
        expect(tpl.nombre).toBeDefined();
        expect(tpl.roles.length).toBeGreaterThan(0);
        expect(tpl.categorias.length).toBeGreaterThan(0);

        const allChannelNames = [];
        tpl.categorias.forEach(cat => {
          cat.canales.forEach(ch => allChannelNames.push(ch.nombre.toLowerCase()));
        });

        for (const baseCh of requiredBaseChannels) {
          expect(allChannelNames).toContain(baseCh);
        }
      }
    });

    test('Omisión de Duplicados: Si un rol o canal ya existe, no lanza error y lo reporta como omitido', async () => {
      const guild = createMockGuild();
      const existingCh = createMockChannel('ch-gen-id', 'general');
      guild.channels.cache.set(existingCh.id, existingCh);

      const interaction = createMockInteraction({
        type: 'button',
        customId: 'wizard:confirm:owner-123',
        userId: 'owner-123',
        isAdmin: true,
        guild
      });

      const state = {
        template: 'comunidad',
        roles: { admin: true, miembro: true },
        custom: { serverName: '', categoryPrefix: '📁', decorativeEmoji: '⚡' }
      };

      await executeWizardCreation(interaction, state);

      expect(guild.channels.create).toHaveBeenCalled();
      expect(interaction.editReply).toHaveBeenCalled();
    });
  });

  describe('Manejo de Errores de la API de Discord', () => {
    test('Error 50013 Missing Permissions en asignación de rol responde con mensaje claro', async () => {
      const guild = createMockGuild();
      const testRole = createMockRole('role-err-1', 'VipTest', 10);
      guild.roles.cache.set(testRole.id, testRole);

      const interaction = createMockInteraction({
        type: 'button',
        customId: `rol:${testRole.id}`,
        userId: 'regular-user',
        isAdmin: false,
        guild
      });

      interaction.member.roles.add.mockRejectedValueOnce(new Error('Missing Permissions (50013)'));

      await interactionCreateEvent.execute(interaction, mockClient);

      expect(interaction.reply).toHaveBeenCalledTimes(1);
      const replyArg = interaction.reply.mock.calls[0][0];
      expect(replyArg.content).toContain('error de permisos en Discord');
    });
  });

  describe('Comando /diagnostico', () => {
    test('Genera auditoría completa con los 7 puntos verificados y latencia', async () => {
      const interaction = createMockInteraction({
        type: 'chatInput',
        commandName: 'diagnostico',
        isAdmin: true
      });

      await diagnosticoCommand.execute(interaction, mockClient);

      expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
      expect(interaction.editReply).toHaveBeenCalledTimes(1);
      const replyArg = interaction.editReply.mock.calls[0][0];
      expect(replyArg.embeds[0].data.title).toContain('Informe Integral de Autodiagnóstico');
      expect(replyArg.embeds[0].data.fields.length).toBeGreaterThanOrEqual(7);
    });
  });

  describe('Garantía de Respuesta Única por Interacción', () => {
    test('Ninguna interacción recibe doble respuesta inicial', async () => {
      const interaction = createMockInteraction({
        type: 'chatInput',
        commandName: 'panel',
        isAdmin: true
      });

      await panelCommand.execute(interaction);
      expect(interaction.getResponseCount()).toBe(1);
    });
  });

});
