const { ChannelType } = require('discord.js');

const limits = {
  channels: 500,
  designChannels: 400,
  roles: 250,
  channelsPerCategory: 50,
  channelsPerCategoryRecommended: 25
};

function channelType(definition) {
  const channelTypes = {
    texto: ChannelType.GuildText,
    text: ChannelType.GuildText,
    voz: ChannelType.GuildVoice,
    voice: ChannelType.GuildVoice,
    forum: ChannelType.GuildForum,
    announcement: ChannelType.GuildAnnouncement,
    stage: ChannelType.GuildStageVoice
  };
  return channelTypes[definition.tipo] || null;
}

function checkTemplateCapacity(guild, template, { categoryName = category => category.nombre } = {}) {
  const rolesToCreate = template.roles.filter(role =>
    !guild.roles.cache.some(existing => existing.name.toLocaleLowerCase() === role.nombre.toLocaleLowerCase())
  );
  const categories = template.categorias.map(category => {
    const name = categoryName(category);
    const existingCategory = guild.channels.cache.find(channel =>
      channel.type === ChannelType.GuildCategory &&
      channel.name.toLocaleLowerCase() === name.toLocaleLowerCase()
    );
    const channelsToCreate = category.canales.filter(definition =>
      channelType(definition) !== null &&
      !guild.channels.cache.some(existing =>
        existing.name.toLocaleLowerCase() === definition.nombre.toLocaleLowerCase() &&
        existing.type === channelType(definition)
      )
    );
    const currentChildren = existingCategory
      ? guild.channels.cache.filter(channel => channel.parentId === existingCategory.id).size
      : 0;

    return {
      name,
      existingCategory,
      channelsToCreate,
      projectedChildren: currentChildren + channelsToCreate.length
    };
  });

  const newCategoryCount = categories.filter(category => !category.existingCategory).length;
  const newChannelCount = categories.reduce((count, category) => count + category.channelsToCreate.length, 0);
  const projectedChannelCount = guild.channels.cache.size + newCategoryCount + newChannelCount;
  const projectedRoleCount = guild.roles.cache.size + rolesToCreate.length;
  const issues = [];
  const warnings = [];

  if (projectedChannelCount > limits.channels) {
    issues.push(`La estructura requiere ${projectedChannelCount} canales y categorías; el límite del servidor es ${limits.channels}.`);
  }
  if (projectedChannelCount > limits.designChannels) {
    issues.push(`La estructura dejaría ${projectedChannelCount} canales y categorías; el límite de diseño solicitado es ${limits.designChannels}.`);
  }
  if (projectedRoleCount > limits.roles) {
    issues.push(`La estructura requiere ${projectedRoleCount} roles; el límite del servidor es ${limits.roles}.`);
  }
  for (const category of categories) {
    if (category.projectedChildren > limits.channelsPerCategory) {
      issues.push(`La categoría ${category.name} tendría ${category.projectedChildren} canales; el máximo por categoría es ${limits.channelsPerCategory}.`);
    }
  }

  if (projectedChannelCount >= 450 && projectedChannelCount <= limits.channels) {
    warnings.push(`⚠️ El servidor quedaría con ${projectedChannelCount} de ${limits.channels} canales/categorías.`);
  }
  if (projectedRoleCount >= 225 && projectedRoleCount <= limits.roles) {
    warnings.push(`⚠️ El servidor quedaría con ${projectedRoleCount} de ${limits.roles} roles.`);
  }
  for (const category of categories) {
    if (category.projectedChildren >= 45 && category.projectedChildren <= limits.channelsPerCategory) {
      warnings.push(`⚠️ La categoría ${category.name} quedaría con ${category.projectedChildren} de ${limits.channelsPerCategory} canales.`);
    }
  }

  return {
    issues,
    warnings,
    rolesToCreate,
    categories,
    newCategoryCount,
    newChannelCount,
    projectedChannelCount,
    projectedRoleCount
  };
}

module.exports = { checkTemplateCapacity, limits };
