const wizardStore = new Map();
const EXPIRATION_TIME_MS = 15 * 60 * 1000; // 15 minutos

function getWizardKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function getWizardState(guildId, userId) {
  const key = getWizardKey(guildId, userId);
  return wizardStore.get(key) || null;
}

function initWizardState(guildId, userId, defaultServerName = '') {
  const key = getWizardKey(guildId, userId);

  if (wizardStore.has(key)) {
    clearTimeout(wizardStore.get(key).timeoutId);
  }

  const timeoutId = setTimeout(() => {
    deleteWizardState(guildId, userId);
    console.log(`[WIZARD] Estado expirado y limpiado para usuario ${userId} en servidor ${guildId}`);
  }, EXPIRATION_TIME_MS);

  const newState = {
    step: 1,
    template: 'comunidad',
    modules: ['tickets', 'memes'],
    roles: {
      admin: true,
      moderador: true,
      miembro: true,
      silenciado: true,
      vip: false
    },
    custom: {
      serverName: defaultServerName || '',
      categoryPrefix: '📁',
      decorativeEmoji: '⚡'
    },
    timeoutId,
    createdAt: Date.now()
  };

  wizardStore.set(key, newState);
  return newState;
}

function updateWizardState(guildId, userId, partialData) {
  const key = getWizardKey(guildId, userId);
  const current = wizardStore.get(key);
  if (!current) return null;

  clearTimeout(current.timeoutId);
  const timeoutId = setTimeout(() => {
    deleteWizardState(guildId, userId);
  }, EXPIRATION_TIME_MS);

  const updated = {
    ...current,
    ...partialData,
    timeoutId,
    updatedAt: Date.now()
  };

  wizardStore.set(key, updated);
  return updated;
}

function deleteWizardState(guildId, userId) {
  const key = getWizardKey(guildId, userId);
  if (wizardStore.has(key)) {
    clearTimeout(wizardStore.get(key).timeoutId);
    wizardStore.delete(key);
    return true;
  }
  return false;
}

module.exports = {
  getWizardState,
  initWizardState,
  updateWizardState,
  deleteWizardState
};
