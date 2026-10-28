const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../src/config');
const categoryData = [
  ['inicio', '📌 INICIO', 'member', 'readOnly', [
    ['👋', 'bienvenida'], ['📜', 'reglas'], ['📢', 'anuncios'], ['🆕', 'novedades'],
    ['🏷️', 'roles-y-niveles'], ['❓', 'faq'], ['🔗', 'enlaces'], ['✅', 'verificacion'],
    ['👋', 'despedidas']
  ]],
  ['informacion', '📰 INFORMACIÓN', 'member', 'readOnly', [
    ['🗞️', 'noticias'], ['🔄', 'actualizaciones'], ['📝', 'changelog'], ['🤝', 'alianzas'],
    ['🎙️', 'normas-de-voz'], ['🤖', 'normas-de-bots'], ['🛡️', 'staff-equipo'], ['📌', 'avisos-importantes']
  ]],
  ['soporte', '🎫 SOPORTE', 'member', 'standard', [
    ['🎫', 'crear-ticket'], ['🚨', 'reportes'], ['💡', 'sugerencias', 'forum'],
    ['🆘', 'ayuda-general', 'forum'], ['⚖️', 'apelaciones'], ['🐛', 'bugs', 'forum'],
    ['🔒', 'tickets-cerrados', 'text', 'private']
  ]],
  ['comunidad-general', '💬 COMUNIDAD GENERAL', 'member', 'standard', [
    ['💬', 'general'], ['👋', 'presentaciones'], ['🌙', 'off-topic'], ['😂', 'memes'],
    ['🗣️', 'debates', 'forum'], ['❔', 'preguntas', 'forum'], ['🏅', 'logros'], ['📷', 'fotos']
  ]],
  ['diversion', '😂 DIVERSIÓN', 'member', 'standard', [
    ['😄', 'chistes'], ['🎞️', 'videos-graciosos'], ['🌀', 'shitpost'], ['🎯', 'retos'],
    ['🤫', 'confesiones'], ['🔤', 'juegos-de-palabras'], ['🧠', 'trivia'], ['🎲', 'juegos-rapidos']
  ]],
  ['vida-cotidiana', '🐾 VIDA COTIDIANA', 'member', 'standard', [
    ['🐾', 'mascotas'], ['🍽️', 'comida'], ['🥘', 'recetas'], ['✈️', 'viajes'],
    ['🏃', 'fitness'], ['💚', 'salud-mental'], ['🌅', 'buenos-dias'], ['🧭', 'consejos']
  ]],
  ['bots', '🤖 BOTS', 'member', 'standard', [
    ['🤖', 'comandos-bot', 'commands'], ['🏆', 'niveles'], ['🎁', 'sorteos'],
    ['🎮', 'juegos-bot'], ['🎵', 'musica-comandos', 'commands'], ['💰', 'economia-bot'],
    ['🧰', 'utilidades'], ['🗳️', 'encuestas-bot']
  ]],
  ['gaming-general', '🎮 GAMING GENERAL', 'gaming', 'standard', [
    ['🔎', 'busco-equipo', 'forum'], ['🎬', 'clips'], ['🏆', 'torneos'],
    ['🗞️', 'noticias-gaming'], ['🖥️', 'setups'], ['🏷️', 'ofertas-juegos'],
    ['😂', 'memes-gamer'], ['🎮', 'gaming-charla']
  ]],
  ['juegos-populares', '🕹️ JUEGOS POPULARES', 'gaming', 'standard', [
    ['🎮', 'minecraft'], ['🛡️', 'roblox'], ['🚗', 'grand-theft-auto'],
    ['🧙', 'genshin-impact'], ['⚔️', 'elden-ring'], ['🌌', 'destiny-2'],
    ['🏎️', 'rocket-league'], ['🧟', 'fortnite']
  ]],
  ['shooters', '🎯 SHOOTERS', 'gaming', 'standard', [
    ['🔫', 'valorant-general'], ['🗺️', 'valorant-mapas-y-estrategias', 'forum'],
    ['🧰', 'valorant-builds-y-agentes', 'forum'], ['🏅', 'valorant-ranked'],
    ['🔎', 'valorant-busco-equipo', 'forum'], ['🎬', 'valorant-clips'],
    ['🏆', 'valorant-competitivo'], ['🧠', 'estrategias-shooters', 'forum'],
    ['👥', 'busco-equipo-shooters', 'forum']
  ]],
  ['moba-estrategia', '⚔️ MOBA / ESTRATEGIA', 'gaming', 'standard', [
    ['⚔️', 'league-of-legends'], ['🔮', 'dota-2'], ['🏰', 'guia-de-builds', 'forum'],
    ['📚', 'guias-y-estrategias', 'forum'], ['🏅', 'ranked-y-competitivo'],
    ['🏆', 'torneos-moba'], ['🔎', 'busco-equipo-moba', 'forum'], ['🧠', 'meta-y-parches']
  ]],
  ['sandbox-supervivencia', '🧱 SANDBOX / SUPERVIVENCIA', 'gaming', 'standard', [
    ['🧱', 'minecraft-construcciones', 'forum'], ['🦖', 'ark-survival'],
    ['🌲', 'valheim'], ['🧟', 'rust'], ['🖥️', 'servidores-de-juego'],
    ['🧰', 'mods-y-recursos'], ['📸', 'capturas-y-builds'], ['🆘', 'ayuda-supervivencia', 'forum']
  ]],
  ['juegos-moviles', '📱 JUEGOS MÓVILES', 'gaming', 'standard', [
    ['📱', 'juegos-moviles-general'], ['🏆', 'clash-of-clans'], ['🪂', 'pubg-mobile'],
    ['🎯', 'call-of-duty-mobile'], ['🔎', 'busco-clan', 'forum'], ['📅', 'eventos-moviles'],
    ['🏷️', 'ofertas-moviles'], ['📖', 'guias-moviles', 'forum']
  ]],
  ['arte', '🎨 ARTE', 'art', 'standard', [
    ['🖌️', 'arte-digital'], ['✏️', 'dibujo'], ['🖼️', 'ilustracion'],
    ['🎨', 'diseno-grafico'], ['👾', 'pixel-art'], ['🧊', 'arte-3d'],
    ['💬', 'feedback-arte', 'forum'], ['🏅', 'retos-arte']
  ]],
  ['escritura', '✍️ ESCRITURA', 'member', 'standard', [
    ['📖', 'relatos'], ['🪶', 'poesia'], ['🌍', 'worldbuilding'],
    ['🎭', 'rol-texto'], ['💬', 'feedback-escritura', 'forum'], ['💡', 'ideas'],
    ['📚', 'libros'], ['📝', 'prompts-de-escritura']
  ]],
  ['fotografia-video', '📸 FOTOGRAFÍA Y VIDEO', 'member', 'standard', [
    ['📷', 'fotografia'], ['🎬', 'edicion-video'], ['🖼️', 'edicion-foto'],
    ['📸', 'equipo-fotografico'], ['🎓', 'tutoriales-foto-video'], ['🌟', 'showcase'],
    ['🏆', 'concursos-fotografia'], ['🎞️', 'cinematografia']
  ]],
  ['musica-social', '🎵 MÚSICA SOCIAL', 'music', 'standard', [
    ['🎧', 'recomendaciones-musicales'], ['📻', 'playlists'], ['🎚️', 'produccion-musical'],
    ['🎸', 'instrumentos'], ['🎤', 'covers'], ['📝', 'letras-musicales'],
    ['🎫', 'conciertos'], ['🎼', 'composicion-musical']
  ]],
  ['programacion', '💻 PROGRAMACIÓN', 'programming', 'standard', [
    ['🆘', 'ayuda-codigo', 'forum'], ['🌐', 'desarrollo-web'], ['🐍', 'python'],
    ['🟨', 'javascript'], ['📱', 'desarrollo-movil'], ['🗄️', 'bases-de-datos'],
    ['🚀', 'proyectos', 'forum'], ['📚', 'recursos-programacion'], ['🧪', 'pruebas-y-debug']
  ]],
  ['tecnologia', '🛠️ TECNOLOGÍA', 'technology', 'standard', [
    ['🗞️', 'noticias-tech'], ['🖥️', 'hardware'], ['💿', 'software'],
    ['📱', 'celulares'], ['🌐', 'redes'], ['🔐', 'ciberseguridad'],
    ['✨', 'inteligencia-artificial'], ['🧰', 'soporte-tecnico']
  ]],
  ['estudio', '📚 ESTUDIO', 'study', 'standard', [
    ['📝', 'tareas'], ['📚', 'recursos-estudio'], ['🆘', 'dudas-estudio', 'forum'],
    ['➗', 'matematicas'], ['🔬', 'ciencias'], ['🌐', 'idiomas-estudio'],
    ['🏛️', 'historia'], ['🧠', 'examenes'], ['📅', 'organizacion-estudio']
  ]],
  ['idiomas', '🌍 IDIOMAS', 'study', 'standard', [
    ['🇬🇧', 'ingles'], ['🇪🇸', 'espanol'], ['🇫🇷', 'frances'], ['🇩🇪', 'aleman'],
    ['🇯🇵', 'japones'], ['🤝', 'intercambio-idiomas', 'forum'],
    ['✍️', 'practica-escrita', 'forum'], ['🗣️', 'practica-conversacion']
  ]],
  ['trabajo-carrera', '💼 TRABAJO Y CARRERA', 'member', 'standard', [
    ['💼', 'ofertas-laborales'], ['📄', 'revision-de-cv', 'forum'], ['🧑‍💻', 'freelance'],
    ['🚀', 'emprendimiento'], ['🤝', 'networking'], ['🎤', 'entrevistas'],
    ['🏆', 'logros-profesionales'], ['📈', 'desarrollo-profesional']
  ]],
  ['finanzas', '💰 FINANZAS', 'member', 'standard', [
    ['💳', 'finanzas-personales'], ['🐷', 'ahorro'], ['📈', 'inversion'],
    ['💰', 'cripto'], ['📊', 'mercados'], ['🎓', 'educacion-financiera'],
    ['🧮', 'herramientas-financieras'], ['🛡️', 'prevencion-de-estafas']
  ]],
  ['tienda', '🛒 TIENDA', 'member', 'standard', [
    ['🛍️', 'catalogo'], ['📦', 'pedidos'], ['⭐', 'resenas', 'forum'],
    ['🏷️', 'ofertas-tienda'], ['❔', 'preguntas-productos', 'forum'],
    ['🚚', 'envios'], ['🛡️', 'garantias'], ['💳', 'metodos-de-pago']
  ]],
  ['cine-series', '🎬 CINE Y SERIES', 'member', 'standard', [
    ['🎥', 'peliculas'], ['📺', 'series'], ['🍿', 'estrenos'],
    ['🌟', 'recomendaciones-cine', 'forum'], ['📝', 'criticas-cine', 'forum'],
    ['🧩', 'teorias-cine'], ['🚫', 'spoilers'], ['🎞️', 'clasicos-del-cine']
  ]],
  ['anime-manga', '🎌 ANIME Y MANGA', 'anime', 'standard', [
    ['🎌', 'anime'], ['📚', 'manga'], ['🌟', 'recomendaciones-anime', 'forum'],
    ['🆕', 'estrenos-anime'], ['😂', 'memes-anime'], ['🎭', 'cosplay'],
    ['🖌️', 'fanart-anime'], ['🚫', 'spoilers-anime']
  ]],
  ['deportes', '⚽ DEPORTES', 'sports', 'standard', [
    ['⚽', 'futbol'], ['🏀', 'baloncesto'], ['🏅', 'deportes-general'],
    ['📊', 'resultados-deportivos'], ['🗣️', 'debates-deportivos'],
    ['🧢', 'fantasy-deportes'], ['🎲', 'apuestas-de-broma'],
    ['🏃', 'deporte-y-bienestar']
  ]],
  ['voz-general', '🔊 VOZ GENERAL', 'member', 'standard', [
    ['🔊', 'sala-general', 'voice'], ['🔊', 'sala-2', 'voice'], ['🔊', 'sala-3', 'voice'],
    ['🔊', 'sala-4', 'voice'], ['🔊', 'sala-5', 'voice'], ['🔊', 'sala-6', 'voice'],
    ['🌙', 'charla-tranquila', 'voice'], ['📺', 'streaming-general', 'voice'], ['💤', 'afk', 'voice']
  ]],
  ['voz-musica', '🎵 VOZ MÚSICA', 'music', 'standard', [
    ['🎵', 'musica-1', 'voice'], ['🎵', 'musica-2', 'voice'], ['🎵', 'musica-3', 'voice'],
    ['🎵', 'musica-4', 'voice'], ['🎵', 'musica-5', 'voice'], ['🌙', 'lofi', 'voice'],
    ['🎤', 'karaoke', 'voice'], ['🎧', 'dj', 'voice'], ['📜', 'cola-de-musica']
  ]],
  ['voz-gaming', '🎮 VOZ GAMING', 'gaming', 'standard', [
    ['🎮', 'gaming-1', 'voice'], ['🎮', 'gaming-2', 'voice'], ['🎮', 'gaming-3', 'voice'],
    ['🎮', 'gaming-4', 'voice'], ['🎮', 'gaming-5', 'voice'], ['🎮', 'gaming-6', 'voice'],
    ['🎮', 'gaming-7', 'voice'], ['🎮', 'gaming-8', 'voice'], ['👥', 'squad', 'voice'],
    ['🏅', 'ranked', 'voice'], ['🏆', 'torneo', 'voice']
  ]],
  ['voz-estudio', '📚 VOZ ESTUDIO', 'study', 'standard', [
    ['📚', 'estudio-1', 'voice'], ['📚', 'estudio-2', 'voice'], ['📚', 'estudio-3', 'voice'],
    ['📚', 'estudio-4', 'voice'], ['📚', 'estudio-5', 'voice'], ['📚', 'estudio-6', 'voice'],
    ['🍅', 'pomodoro', 'voice'], ['🤫', 'concentracion-silenciosa', 'voice'],
    ['🧑‍🏫', 'tutoria', 'voice']
  ]],
  ['salas-temporales', '➕ SALAS TEMPORALES', 'member', 'standard', [
    ['➕', 'crear-sala', 'voice', 'temporary-trigger'], ['👥', 'duo', 'voice', 'room-template'],
    ['👥', 'trio', 'voice', 'room-template'], ['🎮', 'squad', 'voice', 'room-template'],
    ['🔒', 'privada', 'voice', 'room-template'], ['💬', 'charla', 'voice', 'room-template'],
    ['📺', 'streaming', 'voice', 'room-template'], ['🎲', 'grupo-abierto', 'voice', 'room-template']
  ]],
  ['escenarios', '🎙️ ESCENARIOS', 'member', 'standard', [
    ['📡', 'eventos-live', 'stage'], ['🎙️', 'charlas', 'stage'], ['❓', 'ama', 'stage'],
    ['🎵', 'conciertos', 'stage'], ['🖥️', 'presentaciones', 'stage'],
    ['🗣️', 'panel-de-estrado', 'stage'], ['🙋', 'preguntas-escenario', 'stage'],
    ['📅', 'agenda-escenarios']
  ]],
  ['eventos', '🏆 EVENTOS', 'member', 'standard', [
    ['📅', 'calendario'], ['🏆', 'torneos-eventos'], ['📊', 'resultados-eventos'],
    ['🎁', 'sorteos-eventos'], ['🎨', 'concursos'], ['🔊', 'eventos-voz', 'voice'],
    ['🌟', 'hall-de-la-fama'], ['📣', 'inscripciones-eventos']
  ]],
  ['vip-boosters', '🌟 VIP Y BOOSTERS', 'vip', 'standard', [
    ['💎', 'chat-vip'], ['🔊', 'voz-vip', 'voice'], ['🎁', 'sorteos-vip'],
    ['💡', 'ideas-vip', 'forum'], ['🎁', 'beneficios-vip'], ['🗳️', 'sugerencias-vip', 'forum'],
    ['🖼️', 'galeria-vip'], ['📣', 'anuncios-vip']
  ]],
  ['staff', '🛡️ STAFF', 'staff', 'private', [
    ['🛡️', 'chat-staff'], ['📢', 'anuncios-staff'], ['🤖', 'comandos-staff', 'commands'],
    ['🤝', 'reuniones', 'voice'], ['⚖️', 'sanciones'], ['📨', 'apelaciones-staff'],
    ['✅', 'tareas-staff', 'forum'], ['🗒️', 'notas-staff']
  ]],
  ['registros', '📜 REGISTROS', 'staff', 'private', [
    ['🛡️', 'registro-de-moderacion'], ['💬', 'registro-de-mensajes'], ['🔊', 'registro-de-voz'],
    ['🚪', 'registro-de-entradas-y-salidas'], ['🏷️', 'registro-de-roles'],
    ['🗂️', 'registro-de-canales'], ['🎫', 'registro-de-tickets'], ['🤖', 'registro-de-bot']
  ]],
  ['archivo', '🗄️ ARCHIVO', 'member', 'readOnly', [
    ['🗄️', 'canales-historicos'], ['📢', 'anuncios-antiguos'], ['🏆', 'eventos-pasados'],
    ['🎫', 'tickets-antiguos'], ['📜', 'reglas-anteriores'], ['🗞️', 'noticias-archivadas'],
    ['🌟', 'galeria-historica'], ['📚', 'recursos-archivados']
  ]]
];

const categoryTopics = {
  inicio: 'Información esencial y verificación para comenzar en la comunidad.',
  informacion: 'Comunicados, novedades y orientación oficial del servidor.',
  soporte: 'Solicitudes de ayuda, incidencias y atención de soporte.',
  'comunidad-general': 'Conversación general, presentaciones e intercambio entre miembros.',
  diversion: 'Humor y actividades ligeras de la comunidad.',
  'vida-cotidiana': 'Conversaciones y experiencias de la vida diaria.',
  bots: 'Comandos y funciones de bots disponibles en el servidor.',
  'gaming-general': 'Comunidad, noticias y actividades generales de videojuegos.',
  'juegos-populares': 'Espacios de conversación para juegos populares configurables.',
  shooters: 'Cooperativo, estrategias y novedades de juegos de disparos.',
  'moba-estrategia': 'Estrategias, partidas competitivas y aprendizaje de MOBA.',
  'sandbox-supervivencia': 'Construcciones, supervivencia, mods y servidores de juego.',
  'juegos-moviles': 'Juegos móviles, clanes, eventos y guías.',
  arte: 'Creación artística, exhibición y crítica constructiva.',
  escritura: 'Escritura creativa, lectura e intercambio de textos.',
  'fotografia-video': 'Fotografía, edición y producción audiovisual.',
  'musica-social': 'Conversación y creación alrededor de la música.',
  programacion: 'Ayuda técnica y desarrollo de software.',
  tecnologia: 'Tecnología, equipos, software y seguridad digital.',
  estudio: 'Apoyo académico, recursos y espacios de estudio.',
  idiomas: 'Aprendizaje, práctica e intercambio de idiomas.',
  'trabajo-carrera': 'Desarrollo profesional, oportunidades y networking.',
  finanzas: 'Educación y conversación responsable sobre finanzas.',
  tienda: 'Catálogo, pedidos, reseñas y soporte de productos.',
  'cine-series': 'Cine, series, recomendaciones y críticas.',
  'anime-manga': 'Anime, manga, cultura y creaciones de fans.',
  deportes: 'Deportes, análisis y conversación recreativa.',
  'voz-general': 'Salas de voz para conversar y compartir en comunidad.',
  'voz-musica': 'Salas de voz para música, karaoke y escucha social.',
  'voz-gaming': 'Salas de voz para juegos casuales y competitivos.',
  'voz-estudio': 'Salas de voz para estudiar, tutorías y concentración.',
  'salas-temporales': 'Canal de acceso y plantillas para salas de voz temporales.',
  escenarios: 'Canales de escenario para eventos y presentaciones en vivo.',
  eventos: 'Organización, anuncios y resultados de eventos comunitarios.',
  'vip-boosters': 'Beneficios y espacios reservados para VIP y boosters.',
  staff: 'Coordinación interna del equipo de moderación.',
  registros: 'Registros internos para moderación y diagnóstico.',
  archivo: 'Contenido histórico conservado en modo de solo lectura.'
};

const base = {
  version: 2,
  roles: [
    { key: 'owner', nombre: 'Owner', color: '#F1C40F', permisos: ['Administrator'], automatic: false },
    { key: 'admin', nombre: 'Admin', color: '#E74C3C', permisos: ['Administrator'], automatic: false },
    { key: 'moderator', nombre: 'Moderador', color: '#3498DB', permisos: ['ManageMessages', 'KickMembers', 'BanMembers', 'ModerateMembers'], automatic: false },
    { key: 'support', nombre: 'Staff de apoyo', color: '#9B59B6', permisos: [], automatic: false },
    { key: 'booster', nombre: 'VIP / Booster', color: '#FF73FA', permisos: [], automatic: true },
    { key: 'veteran', nombre: 'Veterano', color: '#D4AC0D', permisos: [], automatic: true },
    { key: 'legend', nombre: 'Leyenda', color: '#E67E22', permisos: [], automatic: true },
    { key: 'regular', nombre: 'Habitual', color: '#8E44AD', permisos: [], automatic: true },
    { key: 'active', nombre: 'Activo', color: '#2ECC71', permisos: [], automatic: true },
    { key: 'member', nombre: 'Miembro', color: '#27AE60', permisos: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'Connect', 'Speak', 'UseApplicationCommands'], automatic: true },
    { key: 'new', nombre: 'Nuevo', color: '#95A5A6', permisos: [], automatic: true },
    { key: 'muted', nombre: 'Silenciado', color: '#7F8C8D', permisos: [], automatic: false },
    ...[
      ['gaming', '🎮 Gaming', '#5865F2'], ['art', '🎨 Arte', '#E67E22'],
      ['programming', '💻 Programación', '#3498DB'], ['anime', '🎌 Anime', '#9B59B6'],
      ['sports', '⚽ Deportes', '#2ECC71'], ['music', '🎵 Música', '#1ABC9C'],
      ['study', '📚 Estudio', '#F1C40F'], ['technology', '🛠️ Tecnología', '#34495E']
    ].map(([key, nombre, color]) => ({
      key: `interest_${key}`, nombre, color, permisos: [], automatic: false, selfAssignable: true
    }))
  ]
};

const readOnlyCategories = new Set(['inicio', 'informacion', 'archivo']);
const categoryFiles = [];

function makeChannel(categoryKey, item, index, rules) {
  const [emoji, slug, explicitType, behavior] = item;
  let type = explicitType || 'text';
  if (categoryKey === 'inicio' && slug === 'anuncios') type = 'announcement';
  const channelType = type === 'commands' ? 'text' : type;
  const readableName = slug.replace(/-/g, ' ');
  const topic = `${categoryTopics[categoryKey]} Canal de ${readableName}. Comparte contenido relacionado con respeto y sigue las reglas del servidor.`;
  const channel = {
    key: slug,
    nombre: `${emoji}・${slug}`,
    tipo: channelType,
    tema: topic,
    slowmode: type === 'forum' ? 10 : type === 'commands' ? 2 : ['text', 'announcement'].includes(type) ? 3 : 0,
    permisos: rules
  };
  if (type === 'forum') channel.forum = { defaultReactionEmoji: '💬', defaultSortOrder: 'LatestActivity' };
  if (type === 'commands') channel.botCommands = true;
  if (behavior === 'private') channel.privado = true;
  if (behavior === 'temporary-trigger') channel.temporaryRoomTrigger = true;
  if (behavior === 'room-template') channel.temporaryRoomTemplate = true;
  if (channelType === 'voice' || channelType === 'stage') channel.slowmode = 0;
  return channel;
}

for (const [key, name, audience, mode, items] of categoryData) {
  const permissions = {
    audience,
    readOnly: mode === 'readOnly',
    private: mode === 'private' || audience === 'vip' || audience === 'staff'
  };
  if (['inicio', 'informacion', 'soporte'].includes(key)) permissions.newVisible = true;
  const rules = { ...permissions };
  const channels = items.map((item, index) => makeChannel(key, item, index, rules));
  const category = {
    key,
    nombre: name,
    tema: categoryTopics[key],
    permisos: permissions,
    privado: permissions.private,
    soloLectura: mode === 'readOnly',
    canales: channels
  };
  const filePath = path.join(root, 'categorias', `${key}.json`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(category, null, 2)}\n`, 'utf8');
  categoryFiles.push(filePath);
}

const interests = {
  maxPerUser: 5,
  interests: [
    { key: 'gaming', roleKey: 'interest_gaming', label: '🎮 Gaming', categories: ['gaming-general', 'juegos-populares', 'shooters', 'moba-estrategia', 'sandbox-supervivencia', 'juegos-moviles', 'voz-gaming'] },
    { key: 'art', roleKey: 'interest_art', label: '🎨 Arte', categories: ['arte'] },
    { key: 'programming', roleKey: 'interest_programming', label: '💻 Programación', categories: ['programacion'] },
    { key: 'anime', roleKey: 'interest_anime', label: '🎌 Anime', categories: ['anime-manga'] },
    { key: 'sports', roleKey: 'interest_sports', label: '⚽ Deportes', categories: ['deportes'] },
    { key: 'music', roleKey: 'interest_music', label: '🎵 Música', categories: ['musica-social', 'voz-musica'] },
    { key: 'study', roleKey: 'interest_study', label: '📚 Estudio', categories: ['estudio', 'idiomas', 'voz-estudio'] },
    { key: 'technology', roleKey: 'interest_technology', label: '🛠️ Tecnología', categories: ['tecnologia'] }
  ]
};

const optionalModules = {
  modules: [
    { key: 'tickets', label: 'Sistema de tickets', category: 'soporte', channel: 'crear-ticket' },
    { key: 'temporary-voice', label: 'Salas temporales', category: 'salas-temporales', channel: 'crear-sala' },
    { key: 'music', label: 'Comandos de música', category: 'bots', channel: 'musica-comandos' },
    { key: 'giveaways', label: 'Sorteos', category: 'bots', channel: 'sorteos' },
    { key: 'economy', label: 'Economía del bot', category: 'bots', channel: 'economia-bot' }
  ]
};

fs.writeFileSync(path.join(root, 'base.json'), `${JSON.stringify(base, null, 2)}\n`, 'utf8');
fs.writeFileSync(path.join(root, 'intereses.json'), `${JSON.stringify(interests, null, 2)}\n`, 'utf8');
fs.writeFileSync(path.join(root, 'modulos-opcionales.json'), `${JSON.stringify(optionalModules, null, 2)}\n`, 'utf8');
const categories = categoryFiles.map(filePath => JSON.parse(fs.readFileSync(filePath, 'utf8')));
const templateNames = {
  comunidad: 'Comunidad completa',
  gaming: 'Comunidad gaming',
  estudio: 'Comunidad de estudio',
  tienda: 'Tienda y soporte'
};
const templates = Object.fromEntries(Object.entries(templateNames).map(([key, nombre]) => [
  key,
  {
    nombre,
    roles: base.roles,
    categorias: categories
  }
]));
fs.writeFileSync(path.join(root, 'templates.json'), `${JSON.stringify(templates, null, 2)}\n`, 'utf8');
console.log(`Generados ${categoryFiles.length} archivos de categoría en ${path.join(root, 'categorias')}.`);
