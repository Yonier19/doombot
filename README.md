# Discord Bot v14 — Plantillas modulares, rangos y comunidad

Bot profesional de Discord en Node.js (20+) con **discord.js v14** equipado con:
1. **Creación reanudable (/creating y /setup):** un motor compartido con catálogo modular, resumen paginado, confirmación, progreso, pausa, cancelación y deshacer.
2. **Auto-Roles por Botones (/panel-roles):** Botones persistentes con formato `rol:ID_DEL_ROL`, verificación de jerarquía del bot y bloqueo estricto contra roles administrativos.
3. **Puerta de Entrada Interactiva (/panel-reglas):** Sistema de verificación donde los usuarios recién unidos solo ven el canal de reglas hasta pulsar **"📜 Aceptar reglas"**, momento en que reciben el rol **Miembro** y desbloquean el resto de la comunidad.

---

## 📌 Comandos Principales

- `/asistente`, `/setup [plantilla]` y `/creating [plantilla]`: Usan el mismo motor seguro para crear el catálogo completo de 38 categorías.
- `/panel-roles`: Publica un embed en cualquier canal con botones para alternar hasta 5 roles opcionales (notificaciones, intereses, etc.).
- `/panel-reglas`: Publica el embed normativo con el botón interactivo de verificación **"📜 Aceptar reglas"**.
- `/config-bienvenida`: Abre el panel persistente de bienvenida, despedida y anti-raid.
- `/configurar-rangos`: Crea y ordena los roles de rango, color e intereses; ejecútalo una vez como administrador.
- `/rango [usuario]` y `/ranking`: Consultan el progreso XP y muestran el top 10 del servidor.
- `/creating` y, opcionalmente, `!creating`: Muestra una confirmación y crea las categorías, canales y roles de la plantilla básica. Solo administradores pueden ejecutarlo; el reporte permite deshacer únicamente los elementos registrados como creados por el bot.

### Catálogo modular y creación

El catálogo fuente está en `src/config/base.json`, `src/config/categorias/*.json`, `src/config/intereses.json` y `src/config/modulos-opcionales.json`. Cada una de las 38 categorías contiene de 7 a 12 canales; el catálogo contiene 312 canales. Los archivos por categoría son la fuente que carga `templateLoader.js`. `src/config/templates.json` es una salida de compatibilidad que se regenera con `npm run generate:templates`.

Ejecuta `npm run validate:templates` para comprobar categorías, límites, nombres repetidos, tipos, topics, permisos, roles referenciados, privacidad y permisos privilegiados. La misma validación corre antes de mostrar la confirmación y bloquea el comando si encuentra un error. Cada plantilla tiene 38 categorías y 312 canales, por debajo del máximo de diseño de 400; cada categoría queda por debajo del máximo recomendado de 25 y del límite de Discord de 50. El catálogo combina canales de texto, voz, foros, anuncios y escenario.

Antes de crear, el bot comprueba permisos, jerarquía, capacidad de roles/canales y calcula tiempo estimado. El árbol se pagina con ◀️/▶️. Durante la ejecución muestra la barra de progreso cada 10 canales y permite ⏸️ pausar o ⏹️ cancelar. Las creaciones esperan 650 ms entre operaciones y respetan el tiempo de reintento si Discord devuelve rate limit. Los IDs se guardan inmediatamente en SQLite (`data/ranks.sqlite`, tablas `creation_batches` y `creation_entities`) y en el registro JSON existente para compatibilidad/deshacer. Una ejecución incompleta puede continuarse sin duplicar elementos, comparando ID persistido y nombre/tipo. La jerarquía de roles y las posiciones de categoría se aplican antes de terminar.

Para activar `!creating`, configura `ENABLE_PREFIX_COMMANDS=true` en `.env`, define `PREFIX` si quieres cambiar el prefijo (por defecto `!`) y habilita **Message Content Intent** en Discord Developer Portal. **Server Members Intent** también debe estar habilitado. El bot requiere **Manage Channels** y **Manage Roles**, y espacio suficiente por encima de los roles que administrará.

Los IDs de canales creados también están disponibles como referencias semánticas (`bienvenida`, `despedida`, `reglas`, `roles-y-niveles`, `chat-staff`, `registro-de-moderacion`, `registro-de-mensajes` y otras claves de canal). `getChannelReference(guildId, key, guild)` las resuelve por ID. El botón de deshacer elimina únicamente los elementos registrados en el batch.

Las ejecuciones interrumpidas de `/creating` quedan marcadas como incompletas. Al volver a ejecutar la misma plantilla, el bot ofrece continuarla y omite los elementos que ya existan. Los canales creados desde `➕ Crear sala` se guardan con referencias `temporary-voice:<channelId>:<ownerId>` en el mismo registro, se eliminan al quedar vacíos y se reconcilian al reiniciar. Cada sala incluye un panel en el chat del canal de voz para cambiar nombre y límite de usuarios, cerrar/abrir, ocultar/mostrar, transferir la propiedad y eliminar la sala. Estos controles son para su propietario o administradores. Esta función requiere `ManageChannels` y `MoveMembers`; el panel también requiere que el bot pueda ver y enviar mensajes en el canal de voz. No se incluyen integraciones con bots externos de música, tickets u otros servicios; esos módulos pueden resolver los canales compartidos por sus claves mediante `getChannelReference`/`getChannelReferences`.

### Rangos, XP y auto-roles

- `/configurar-rangos` crea los roles definidos en `src/config/ranks.json`, comprueba permisos privilegiados en roles automáticos/autoasignables y los ordena. `Owner`, `Admin`, `Moderador`, `Staff de apoyo` y `Silenciado` son manuales y nunca se conceden desde botones ni de forma automática.
- Cada mensaje de una persona otorga 20 XP como máximo una vez cada 60 segundos. La voz otorga 5 XP por minuto completo; se excluyen bots y el canal AFK. La fórmula acumulativa requiere `100 × nivel × (nivel + 1) / 2` XP para alcanzar un nivel.
- El rol de nivel más alto alcanzado se asigna en nivel 5 (`Activo`), 15 (`Habitual`) y 30 (`Leyenda`). Nombres, tasas y días de veterano se editan en `src/config/ranks.json`.
- VIP se sincroniza con el estado de Booster; Veterano se revisa al iniciar y diariamente después de 90 días en el servidor. Ejecuta `/configurar-rangos` para registrar los IDs de roles.
- Los roles de color e intereses incluidos en ese JSON son autoasignables mediante `/panel-roles`. Los botones usan IDs persistentes de rol y funcionan después de reiniciar; el usuario puede tener como máximo cinco roles con clave `interest_`.

La base `data/ranks.sqlite` crea automáticamente estas tablas:

| Tabla | Columnas y función |
|---|---|
| `member_xp` | `guild_id`, `user_id`, `xp`, `last_message_xp_at`; XP y cooldown por usuario/servidor. |
| `voice_sessions` | `guild_id`, `user_id`, `channel_id`, `last_awarded_at`; seguimiento de minutos de voz completos. |
| `rank_roles` | `guild_id`, `role_key`, `role_id`; mapeo persistente de roles por servidor. |

### Bienvenida, despedida y anti-raid

`guildMemberAdd` asigna `Nuevo`, muestra avatar, número de miembro y enlaces a reglas/roles, registra cuentas creadas hace menos de 7 días y puede enviar guía por DM. Al aceptar las reglas se añade `Miembro` y se retira `Nuevo`. `guildMemberRemove` publica una despedida con duración en el servidor y registra roles y motivo; el audit log se consulta solo si el bot tiene `ViewAuditLog`.

`/config-bienvenida` publica un panel persistente con interruptores, configuración de canales mediante ID/mención (o vacío para usar el nombre predeterminado) y modales para editar textos. Solo administradores pueden cambiar las opciones. Variables: `{usuario}`, `{servidor}`, `{numero}` y `{tiempo}`. La configuración se guarda en `data/welcome-config.json`. La imagen generada es opcional y no se incluye; el embed utiliza el avatar.

Al detectar más de 10 entradas en 60 segundos, se alerta en `#chat-staff` y se activa durante 15 minutos la verificación reforzada: las cuentas creadas hace menos de 7 días requieren aprobación manual del staff. Desactivar Anti-raid desde el panel cancela el modo activo.

El bot solicita `Guilds`, `GuildMembers`, `GuildMessages` y `GuildVoiceStates`. `Message Content Intent` solo se solicita cuando `ENABLE_PREFIX_COMMANDS=true`; los comandos con prefijo requieren que también lo habilites en Discord Developer Portal. Habilita **Server Members Intent** para gestionar miembros y roles automáticamente.

Los eventos se registran a través de un manejador que captura y registra sus errores; el proceso también registra `unhandledRejection` y `uncaughtException` para facilitar el diagnóstico.

---

## 🛡️ Medidas de Seguridad Implementadas

- **Anti-Escalamiento de Privilegios:** Ningún botón de rol puede otorgar roles que posean permisos de `Administrator`, `ManageGuild` o `ManageRoles`.
- **Verificación de Jerarquía:** El bot compara la posición de su rol más alto con los roles a otorgar antes de publicar y antes de ejecutar cada interacción.
- **Pausas Anti Rate-Limit:** Retardo de 400 ms entre creaciones masivas de canales y roles, con actualizaciones de progreso espaciadas.
- **Respuesta Efímera:** Respuestas privadas a los usuarios para evitar spam en los canales.
