/**
 * ContaQuest · Proxy de IA + Cuentas (Google Apps Script)
 * --------------------------------------------------------
 * Maneja 2 tipos de petición:
 *  A) IA  (campo "mode"):   "cards" (apuntes->tarjetas) | "exam" (tarjetas->examen)
 *  B) Cuentas (campo "action"): "signup" | "login" | "load" | "save"
 *
 * La API key vive en Propiedades del script (NUNCA en el sitio público).
 * Los datos de cada usuario se guardan como un archivo JSON en tu Google Drive
 * (carpeta "ContaQuest Data"). La contraseña se guarda cifrada (SHA-256 + sal).
 *
 * Propiedades del script:
 *   ANTHROPIC_API_KEY  -> tu llave sk-ant-...   (obligatoria para la IA)
 *   APP_TOKEN          -> palabra secreta (opcional, recomendada)
 *
 * Despliega como "Aplicación web": Ejecutar como = Tú, Acceso = Cualquier persona.
 * (Al redesplegar pedirá un permiso NUEVO de Google Drive: acéptalo.)
 */

const MODEL = 'claude-opus-4-8';

/* ====================== IA ====================== */
const SYSTEM_CARDS =
  'Eres un asistente que convierte los apuntes de clase de un estudiante de la carrera ' +
  '"Dirección y Administración de PyMEs" en tarjetas de estudio (flashcards) en español de México. ' +
  'A partir de los apuntes, genera entre 8 y 20 tarjetas claras, precisas y correctas. ' +
  'Cada tarjeta tiene una pregunta (q) breve y una respuesta (a) concisa pero completa. ' +
  'Prioriza conceptos, definiciones, fórmulas, clasificaciones y datos clave (contabilidad, cargos y abonos, ' +
  'finanzas, fiscal/contribuciones, emprendimiento y creación de empresas). ' +
  'No inventes información que no esté en los apuntes. Responde ÚNICAMENTE con el JSON solicitado.';

const SCHEMA_CARDS = {
  type: 'object',
  properties: {
    cards: {
      type: 'array',
      items: { type: 'object', properties: { q: { type: 'string' }, a: { type: 'string' } }, required: ['q', 'a'], additionalProperties: false }
    }
  },
  required: ['cards'], additionalProperties: false
};

const SYSTEM_EXAM =
  'Eres un generador de exámenes interactivos estilo Duolingo para un estudiante de la carrera ' +
  '"Dirección y Administración de PyMEs". Recibirás una lista de tarjetas (concepto y su respuesta). ' +
  'Con ese contenido crea un examen dividido en lecciones cortas. REGLAS: ' +
  'entre 2 y 4 lecciones; cada lección de 4 a 6 preguntas; mezcla los tres tipos de pregunta. ' +
  'Cada pregunta SIEMPRE debe traer TODOS estos campos (rellena los que no apliquen con valores vacíos): ' +
  '"tipo" es uno de: "opcion", "vf", "escribe". ' +
  'Si tipo="opcion": "opciones" = 4 opciones (distractores plausibles), "correcta" = índice 0-based, "vf"=false, "respuesta"="". ' +
  'Si tipo="vf": "q" es una afirmación, "vf" = true/false, "opciones"=[], "correcta"=0, "respuesta"="". ' +
  'Si tipo="escribe": "respuesta" = respuesta corta esperada, "opciones"=[], "correcta"=0, "vf"=false. ' +
  '"exp" = explicación breve (1 frase). Todo en español de México. Básate SOLO en las tarjetas dadas. ' +
  'No repitas preguntas. Responde ÚNICAMENTE con el JSON solicitado.';

const SCHEMA_EXAM = {
  type: 'object',
  properties: {
    titulo: { type: 'string' },
    lecciones: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          titulo: { type: 'string' },
          preguntas: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                tipo: { type: 'string', enum: ['opcion', 'vf', 'escribe'] },
                q: { type: 'string' }, opciones: { type: 'array', items: { type: 'string' } },
                correcta: { type: 'integer' }, vf: { type: 'boolean' }, respuesta: { type: 'string' }, exp: { type: 'string' }
              },
              required: ['tipo', 'q', 'opciones', 'correcta', 'vf', 'respuesta', 'exp'], additionalProperties: false
            }
          }
        },
        required: ['titulo', 'preguntas'], additionalProperties: false
      }
    }
  },
  required: ['titulo', 'lecciones'], additionalProperties: false
};

/* ====================== Router ====================== */
function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var props = PropertiesService.getScriptProperties();
    var appToken = props.getProperty('APP_TOKEN');
    if (appToken && body.token !== appToken) return json({ error: 'No autorizado.' });

    // ---- Cuentas / sincronización ----
    if (body.action) {
      var a = body.action;
      if (a === 'signup') return signup(body);
      if (a === 'login') return login(body);
      if (a === 'load') return loadData(body);
      if (a === 'save') return saveData(body);
      return json({ error: 'Acción no válida.' });
    }

    // ---- IA ----
    var apiKey = props.getProperty('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ error: 'Falta ANTHROPIC_API_KEY en Propiedades del script.' });
    var mode = body.mode || 'cards';

    if (mode === 'exam') {
      var cards = (body.cards || []).slice(0, 60);
      if (!cards.length) return json({ error: 'No llegaron tarjetas para el examen.' });
      var lista = cards.map(function (c) { return '- ' + (c.q || '') + ' => ' + (c.a || ''); }).join('\n').slice(0, 14000);
      var oe = callClaude(SYSTEM_EXAM, SCHEMA_EXAM, 'Tarjetas de estudio:\n\n' + lista, 6000, apiKey);
      if (oe.error) return json({ error: oe.error });
      return json({ titulo: oe.data.titulo || 'Reto', lecciones: oe.data.lecciones || [] });
    }
    var notes = (body.notes || '').toString().slice(0, 12000);
    if (notes.trim().length < 10) return json({ error: 'Pega apuntes con más contenido.' });
    var oc = callClaude(SYSTEM_CARDS, SCHEMA_CARDS, 'Apuntes de la clase:\n\n' + notes, 4096, apiKey);
    if (oc.error) return json({ error: oc.error });
    return json({ cards: oc.data.cards || [] });

  } catch (err) {
    return json({ error: 'Error en el proxy: ' + err });
  }
}

/* ====================== Cuentas ====================== */
function signup(body) {
  var u = limpiaUsuario(body.usuario), c = (body.clave || '').toString();
  if (u.length < 3) return json({ error: 'El usuario debe tener al menos 3 caracteres.' });
  if (c.length < 4) return json({ error: 'La contraseña debe tener al menos 4 caracteres.' });
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    if (fileFor(u)) return json({ error: 'Ese usuario ya existe. Inicia sesión o elige otro.' });
    var salt = rnd(), sesion = rnd();
    var obj = { usuario: u, salt: salt, hash: sha(salt + c), sesion: sesion, data: body.data || {}, updated: Date.now() };
    getFolder().createFile('contaquest_' + u + '.json', JSON.stringify(obj), 'application/json');
    return json({ ok: true, usuario: u, sesion: sesion });
  } finally { lock.releaseLock(); }
}

function login(body) {
  var u = limpiaUsuario(body.usuario), c = (body.clave || '').toString();
  var f = fileFor(u);
  if (!f) return json({ error: 'Usuario o contraseña incorrectos.' });
  var obj = JSON.parse(f.getBlob().getDataAsString());
  if (sha(obj.salt + c) !== obj.hash) return json({ error: 'Usuario o contraseña incorrectos.' });
  obj.sesion = rnd();
  f.setContent(JSON.stringify(obj));
  return json({ ok: true, usuario: u, sesion: obj.sesion, data: obj.data || {} });
}

function loadData(body) {
  var u = limpiaUsuario(body.usuario), f = fileFor(u);
  if (!f) return json({ error: 'Cuenta no encontrada.' });
  var obj = JSON.parse(f.getBlob().getDataAsString());
  if (obj.sesion !== body.sesion) return json({ error: 'Sesión expirada. Inicia sesión de nuevo.' });
  return json({ ok: true, data: obj.data || {}, updated: obj.updated || 0 });
}

function saveData(body) {
  var u = limpiaUsuario(body.usuario), f = fileFor(u);
  if (!f) return json({ error: 'Cuenta no encontrada.' });
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var obj = JSON.parse(f.getBlob().getDataAsString());
    if (obj.sesion !== body.sesion) return json({ error: 'Sesión expirada. Inicia sesión de nuevo.' });
    obj.data = body.data || {}; obj.updated = Date.now();
    f.setContent(JSON.stringify(obj));
    return json({ ok: true, updated: obj.updated });
  } finally { lock.releaseLock(); }
}

/* ====================== Helpers ====================== */
function limpiaUsuario(s) { return (s || '').toString().trim().toLowerCase().replace(/[^a-z0-9_.-]/g, ''); }
function rnd() { return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''); }
function sha(s) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return raw.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
function getFolder() {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var f = DriveApp.createFolder('ContaQuest Data');
  props.setProperty('FOLDER_ID', f.getId());
  return f;
}
function fileFor(usuario) {
  var it = getFolder().getFilesByName('contaquest_' + usuario + '.json');
  return it.hasNext() ? it.next() : null;
}

function callClaude(system, schema, userText, maxTokens, apiKey) {
  var payload = {
    model: MODEL, max_tokens: maxTokens,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    output_config: { format: { type: 'json_schema', schema: schema } },
    messages: [{ role: 'user', content: userText }]
  };
  var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  var code = res.getResponseCode(), data = JSON.parse(res.getContentText());
  if (code !== 200) return { error: (data.error && data.error.message) || ('Error API ' + code) };
  var tb = (data.content || []).filter(function (b) { return b.type === 'text'; })[0];
  if (!tb) return { error: 'La IA no devolvió contenido.' };
  return { data: JSON.parse(tb.text) };
}

function doGet() { return ContentService.createTextOutput('ContaQuest IA OK'); }
function json(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
