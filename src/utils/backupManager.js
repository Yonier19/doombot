const fs = require('fs');
const path = require('path');
const { db, getDatabasePath } = require('./sqliteDatabase');

const backupDirectory = path.resolve(process.cwd(), 'data', 'backups');
const backupPrefix = 'ranks-';
const maximumBackups = 10;
const backupIntervalMs = 6 * 60 * 60 * 1000;
let backupTimer = null;
let activeBackup = null;

function listBackups() {
  if (!fs.existsSync(backupDirectory)) return [];
  return fs.readdirSync(backupDirectory)
    .filter(name => name.startsWith(backupPrefix) && name.endsWith('.sqlite'))
    .map(name => ({
      name,
      path: path.join(backupDirectory, name),
      modifiedAt: fs.statSync(path.join(backupDirectory, name)).mtimeMs
    }))
    .sort((left, right) => right.modifiedAt - left.modifiedAt);
}

async function backupNow() {
  if (activeBackup) return activeBackup;
  activeBackup = (async () => {
    await fs.promises.mkdir(backupDirectory, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${backupPrefix}${timestamp}.sqlite`;
    const destination = path.join(backupDirectory, filename);
    const temporaryPath = `${destination}.${process.pid}.tmp`;
    const bytes = Buffer.from(db.export());
    await fs.promises.writeFile(temporaryPath, bytes);
    await fs.promises.rename(temporaryPath, destination);

    const backups = listBackups();
    await Promise.all(backups.slice(maximumBackups).map(file =>
      fs.promises.unlink(file.path)
    ));
    console.log(`[RESPALDO] Base de datos respaldada en ${destination}`);
    return destination;
  })();
  try {
    return await activeBackup;
  } finally {
    activeBackup = null;
  }
}

function getLastBackup() {
  const [latest] = listBackups();
  return latest ? new Date(latest.modifiedAt) : null;
}

function startBackupScheduler() {
  if (backupTimer) return;
  void backupNow().catch(error => {
    console.error('[RESPALDO] Falló el respaldo inicial:', error);
  });
  backupTimer = setInterval(() => {
    void backupNow().catch(error => {
      console.error('[RESPALDO] Falló el respaldo automático:', error);
    });
  }, backupIntervalMs);
  backupTimer.unref?.();
}

function stopBackupScheduler() {
  if (backupTimer) clearInterval(backupTimer);
  backupTimer = null;
}

function getDatabaseBackupName() {
  return path.basename(getDatabasePath());
}

module.exports = {
  backupNow,
  getLastBackup,
  getDatabaseBackupName,
  listBackups,
  startBackupScheduler,
  stopBackupScheduler
};
