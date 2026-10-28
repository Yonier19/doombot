require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Options,
  Collection
} = require('discord.js');
const { initializeDatabase, closeDatabase } = require('./utils/sqliteDatabase');
const {
  startBackupScheduler,
  stopBackupScheduler
} = require('./utils/backupManager');

const token = process.env.DISCORD_TOKEN || process.env.TOKEN;
const prefixCommandsEnabled = process.env.ENABLE_PREFIX_COMMANDS === 'true';
let client;
let shutdownStarted = false;

if (!token) {
  console.error('[ERROR FATAL] Falta DISCORD_TOKEN (o TOKEN) en el archivo .env.');
  process.exitCode = 1;
}

process.on('unhandledRejection', (reason) => {
  console.error('[ANTI-CRASH] Promesa rechazada no manejada:', reason);
});

process.on('uncaughtException', (error, origin) => {
  console.error('[ANTI-CRASH] Excepción no capturada; el proceso seguirá activo:', error, 'Origen:', origin);
});

async function shutdown(signal) {
  if (shutdownStarted) return;
  shutdownStarted = true;
  console.log(`[CIERRE] Señal ${signal}; cerrando el bot de forma ordenada.`);
  stopBackupScheduler();
  try {
    client?.destroy();
    closeDatabase();
  } catch (error) {
    console.error('[CIERRE] Error durante el cierre:', error);
    process.exitCode = 1;
  }
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

async function startBot() {
  if (!token) return;
  await initializeDatabase();

  const intents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates
  ];
  if (prefixCommandsEnabled) intents.push(GatewayIntentBits.MessageContent);

  client = new Client({
    intents,
    makeCache: Options.cacheWithLimits({
      ...Options.DefaultMakeCacheSettings,
      GuildMemberManager: 100,
      MessageManager: 0,
      PresenceManager: 0
    })
  });

  client.commands = new Collection();
  client.buttons = new Collection();
  client.cooldowns = new Collection();

  if (prefixCommandsEnabled) {
    console.log('[INTENTS] Comandos con prefijo activados; habilita Message Content Intent en Discord Developer Portal.');
  }
  if (process.env.ENABLE_MUSIC === 'true') {
    console.warn('[MÚSICA] ENABLE_MUSIC=true, pero este proyecto no incluye un módulo de música. El bot continuará sin cargar FFmpeg.');
  } else {
    console.log('[MÚSICA] Módulo de música desactivado (ENABLE_MUSIC=false).');
  }

  startBackupScheduler();

  const { loadCommands } = require('./handlers/commandHandler');
  const { loadButtons } = require('./handlers/buttonHandler');
  const { loadEvents } = require('./handlers/eventHandler');
  loadCommands(client);
  loadButtons(client);
  loadEvents(client);

  try {
    await client.login(token);
    console.log('[BOT] Inicio de sesión completado; discord.js gestionará la reconexión del Gateway.');
  } catch (error) {
    console.error('[ERROR] No se pudo iniciar sesión con Discord:', error);
    if (error.code === 4014 || error.rawError?.code === 4014) {
      console.error('[INTENTS NO PERMITIDOS] Activa Server Members Intent en Discord Developer Portal > Applications > tu aplicación > Bot > Privileged Gateway Intents.');
    }
    process.exitCode = 1;
    await shutdown('error de inicio');
  }
}

void startBot().catch(async error => {
  console.error('[ERROR FATAL] No se pudo iniciar el bot:', error);
  process.exitCode = 1;
  await shutdown('error de inicialización');
});
