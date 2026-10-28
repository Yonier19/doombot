const fs = require('fs');
const path = require('path');

function loadButtons(client) {
  const buttonsPath = path.join(__dirname, '../buttons');
  if (!fs.existsSync(buttonsPath)) return;

  const folders = fs.readdirSync(buttonsPath);
  let count = 0;

  for (const folder of folders) {
    const folderPath = path.join(buttonsPath, folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;

    const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.js'));
    for (const file of files) {
      const filePath = path.join(folderPath, file);
      try {
        const button = require(filePath);
        if (button.customId && typeof button.execute === 'function') {
          client.buttons.set(button.customId, button);
          count++;
          console.log(`  ✓ Botón registrado: [${button.customId}] (${file})`);
        } else {
          console.warn(`  ✗ [IGNORADO] ${filePath} debe exportar 'customId' y función 'execute'.`);
        }
      } catch (err) {
        console.error(`  ✗ Error al cargar manejador de botón en ${filePath}:`, err);
      }
    }
  }

  console.log(`[HANDLERS] Total de manejadores de botones cargados: ${count}`);
}

module.exports = { loadButtons };
