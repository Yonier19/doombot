const fs = require('fs');
const path = require('path');

const configDirectory = __dirname;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadTemplateCatalog() {
  const base = readJson(path.join(configDirectory, 'base.json'));
  const categoryDirectory = path.join(configDirectory, 'categorias');
  const categories = fs.readdirSync(categoryDirectory)
    .filter(file => file.endsWith('.json'))
    .sort()
    .map(file => readJson(path.join(categoryDirectory, file)));
  const names = {
    comunidad: 'Comunidad completa',
    gaming: 'Comunidad gaming',
    estudio: 'Comunidad de estudio',
    tienda: 'Tienda y soporte'
  };
  return Object.fromEntries(Object.entries(names).map(([key, nombre]) => [
    key,
    {
      nombre,
      roles: base.roles,
      categorias: categories
    }
  ]));
}

module.exports = loadTemplateCatalog();
