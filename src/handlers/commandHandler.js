const fs = require('fs');
const path = require('path');

function loadCommands(client) {
  const commandsPath = path.join(__dirname, '../commands');
  if (!fs.existsSync(commandsPath)) return;

  const commandFolders = fs.readdirSync(commandsPath);
  let count = 0;

  for (const folder of commandFolders) {
    const folderPath = path.join(commandsPath, folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;

    const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
      const filePath = path.join(folderPath, file);
      try {
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
          client.commands.set(command.data.name, command);
          count++;
          console.log(`  ✓ Comando registrado: /${command.data.name} (${folder}/${file})`);
        } else {
          console.warn(`  ✗ [IGNORADO] ${filePath} debe exportar 'data' y función 'execute'.`);
        }
      } catch (err) {
        console.error(`  ✗ Error al cargar comando en ${filePath}:`, err);
      }
    }
  }

  console.log(`[HANDLERS] Total de comandos de barra cargados: ${count}`);
}

module.exports = { loadCommands };
