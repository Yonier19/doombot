const fs = require('fs');
const path = require('path');

function loadEvents(client) {
  const eventsPath = path.join(__dirname, '../events');
  if (!fs.existsSync(eventsPath)) return;

  const eventFolders = fs.readdirSync(eventsPath);
  let count = 0;

  async function dispatch(event, eventName, args) {
    try {
      await event.execute(...args, client);
    } catch (error) {
      console.error(`[EVENTOS] Error no controlado en ${eventName}:`, error);
    }
  }

  for (const folder of eventFolders) {
    const folderPath = path.join(eventsPath, folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;

    const eventFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));
    for (const file of eventFiles) {
      const filePath = path.join(folderPath, file);
      try {
        const event = require(filePath);
        if (event.name && typeof event.execute === 'function') {
          if (event.once) {
            client.once(event.name, (...args) => {
              void dispatch(event, `${folder}/${file}`, args);
            });
          } else {
            client.on(event.name, (...args) => {
              void dispatch(event, `${folder}/${file}`, args);
            });
          }
          count++;
          console.log(`  ✓ Evento registrado: [${event.name}] (${folder}/${file})`);
        } else {
          console.warn(`  ✗ [IGNORADO] ${filePath} debe exportar 'name' y función 'execute'.`);
        }
      } catch (err) {
        console.error(`  ✗ Error al cargar evento en ${filePath}:`, err);
      }
    }
  }

  console.log(`[HANDLERS] Total de eventos cargados: ${count}`);
}

module.exports = { loadEvents };
