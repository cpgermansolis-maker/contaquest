/**
 * ContaQuest · Proxy de IA (Google Apps Script)
 * --------------------------------------------------
 * Dos modos (campo "mode" en el cuerpo):
 *   - "cards" (predeterminado): convierte apuntes -> tarjetas {q, a}
 *   - "exam":  convierte tarjetas seleccionadas -> examen interactivo por lecciones
 *
 * La API key NUNCA viaja al sitio público: vive en Propiedades del script.
 *
 * Propiedades del script:
 *   ANTHROPIC_API_KEY  -> tu llave sk-ant-...   (obligatoria)
 *   APP_TOKEN          -> palabra secreta (opcional, recomendada)
 *
 * Despliega como "Aplicación web": Ejecutar como = Tú, Acceso = Cualquier persona.
 */

const MODEL = 'claude-opus-4-8';

/* ---------- Modo CARDS: apuntes -> tarjetas ---------- */
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
      items: {
        type: 'object',
        properties: { q: { type: 'string' }, a: { type: 'string' } },
        required: ['q', 'a'],
        additionalProperties: false
      }
    }
  },
  required: ['cards'],
  additionalProperties: false
};

/* ---------- Modo EXAM: tarjetas -> examen por lecciones ---------- */
const SYSTEM_EXAM =
  'Eres un generador de exámenes interactivos estilo Duolingo para un estudiante de la carrera ' +
  '"Dirección y Administración de PyMEs". Recibirás una lista de tarjetas (concepto y su respuesta). ' +
  'Con ese contenido crea un examen dividido en lecciones cortas. REGLAS: ' +
  'entre 2 y 4 lecciones; cada lección de 4 a 6 preguntas; mezcla los tres tipos de pregunta. ' +
  'Cada pregunta SIEMPRE debe traer TODOS estos campos (rellena los que no apliquen con valores vacíos): ' +
  '"tipo" es uno de: "opcion", "vf", "escribe". ' +
  'Si tipo="opcion": "opciones" = 4 opciones (distractores plausibles y creíbles), ' +
  '"correcta" = índice 0-based de la opción correcta, "vf"=false, "respuesta"="". ' +
  'Si tipo="vf": "q" es una afirmación, "vf" = true si es verdadera y false si es falsa, ' +
  '"opciones"=[], "correcta"=0, "respuesta"="". ' +
  'Si tipo="escribe": "respuesta" = la respuesta corta esperada (pocas palabras), ' +
  '"opciones"=[], "correcta"=0, "vf"=false. ' +
  '"exp" = explicación breve del porqué (1 frase). ' +
  'Todo en español de México. Básate SOLO en las tarjetas dadas; no inventes datos nuevos. ' +
  'No repitas la misma pregunta. Responde ÚNICAMENTE con el JSON solicitado.';

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
                q: { type: 'string' },
                opciones: { type: 'array', items: { type: 'string' } },
                correcta: { type: 'integer' },
                vf: { type: 'boolean' },
                respuesta: { type: 'string' },
                exp: { type: 'string' }
              },
              required: ['tipo', 'q', 'opciones', 'correcta', 'vf', 'respuesta', 'exp'],
              additionalProperties: false
            }
          }
        },
        required: ['titulo', 'preguntas'],
        additionalProperties: false
      }
    }
  },
  required: ['titulo', 'lecciones'],
  additionalProperties: false
};

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var props = PropertiesService.getScriptProperties();
    var apiKey = props.getProperty('ANTHROPIC_API_KEY');
    var appToken = props.getProperty('APP_TOKEN');

    if (!apiKey) return json({ error: 'Falta ANTHROPIC_API_KEY en Propiedades del script.' });
    if (appToken && body.token !== appToken) return json({ error: 'No autorizado.' });

    var mode = body.mode || 'cards';

    if (mode === 'exam') {
      var cards = body.cards || [];
      if (!cards.length) return json({ error: 'No llegaron tarjetas para el examen.' });
      cards = cards.slice(0, 60); // tope
      var lista = cards.map(function (c) {
        return '- ' + (c.q || '') + ' => ' + (c.a || '');
      }).join('\n').slice(0, 14000);
      var out = callClaude(SYSTEM_EXAM, SCHEMA_EXAM, 'Tarjetas de estudio:\n\n' + lista, 6000, apiKey);
      if (out.error) return json({ error: out.error });
      return json({ titulo: out.data.titulo || 'Reto', lecciones: out.data.lecciones || [] });
    }

    // modo cards (predeterminado)
    var notes = (body.notes || '').toString().slice(0, 12000);
    if (notes.trim().length < 10) return json({ error: 'Pega apuntes con más contenido.' });
    var outC = callClaude(SYSTEM_CARDS, SCHEMA_CARDS, 'Apuntes de la clase:\n\n' + notes, 4096, apiKey);
    if (outC.error) return json({ error: outC.error });
    return json({ cards: outC.data.cards || [] });

  } catch (err) {
    return json({ error: 'Error en el proxy: ' + err });
  }
}

function callClaude(system, schema, userText, maxTokens, apiKey) {
  var payload = {
    model: MODEL,
    max_tokens: maxTokens,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    output_config: { format: { type: 'json_schema', schema: schema } },
    messages: [{ role: 'user', content: userText }]
  };
  var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  var data = JSON.parse(res.getContentText());
  if (code !== 200) return { error: (data.error && data.error.message) || ('Error API ' + code) };
  var textBlock = (data.content || []).filter(function (b) { return b.type === 'text'; })[0];
  if (!textBlock) return { error: 'La IA no devolvió contenido.' };
  return { data: JSON.parse(textBlock.text) };
}

function doGet() {
  return ContentService.createTextOutput('ContaQuest IA OK');
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
