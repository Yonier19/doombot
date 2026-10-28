require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');

if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID) {
  console.error('[ERROR] Se requieren DISCORD_TOKEN y CLIENT_ID en el archivo .env.');
  process.exit(1);
}

const commandFolders = fs.readdirSync(commandsPath);

for (const folder of commandFolders) {
  const folderPath = path.join(commandsPath, folder);
  if (fs.statSync(folderPath).isDirectory()) {
    const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
      const filePath = path.join(folderPath, file);
      const command = require(filePath);
      if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
      } else {
        console.warn(`[ADVERTENCIA] ${filePath} no exporta 'data' o 'execute'.`);
      }
    }
  }
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`[REGISTRO] Sincronizando ${commands.length} comando(s) con la API REST de Discord...`);

    if (process.env.GUILD_ID) {
      const data = await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands }
      );
      console.log(`[ÉXITO] Se registraron ${data.length} comandos instantáneamente en el servidor ${process.env.GUILD_ID}.`);
    } else {
      const data = await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands }
      );
      console.log(`[ÉXITO] Se registraron ${data.length} comandos globales en Discord.`);
    }
  } catch (error) {
    console.error('[ERROR] Error al registrar comandos:', error);
    process.exitCode = 1;
  }
})();
