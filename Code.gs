/**
 * ContaQuest · Proxy de IA (Google Apps Script)
 * --------------------------------------------------
 * Recibe los apuntes de la app y devuelve tarjetas de estudio (q/a)
 * generadas con la API de Claude. La API key NUNCA viaja al sitio público:
 * se guarda en Propiedades del script (Configuración del proyecto ▸ Propiedades del script).
 *
 * Propiedades del script requeridas:
 *   ANTHROPIC_API_KEY  -> tu llave sk-ant-...   (obligatoria)
 *   APP_TOKEN          -> una palabra secreta tuya (opcional pero recomendada)
 *
 * Despliega como "Aplicación web":  Ejecutar como = Tú,  Acceso = Cualquier persona.
 * Copia la URL /exec y pégala en la app (Perfil ▸ Generador con IA).
 */

const MODEL = 'claude-opus-4-8';

const SYSTEM_PROMPT =
  'Eres un asistente que convierte los apuntes de clase de un estudiante de la carrera ' +
  '"Dirección y Administración de PyMEs" en tarjetas de estudio (flashcards) en español de México. ' +
  'A partir de los apuntes que te dé el usuario, genera entre 8 y 20 tarjetas claras, precisas y correctas. ' +
  'Cada tarjeta tiene una pregunta (q) breve y una respuesta (a) concisa pero completa. ' +
  'Prioriza conceptos, definiciones, fórmulas, clasificaciones y datos clave (contabilidad, cargos y abonos, ' +
  'finanzas, fiscal/contribuciones, emprendimiento y creación de empresas). ' +
  'No inventes información que no esté en los apuntes; si algo está incompleto, formula la tarjeta solo con lo que hay. ' +
  'Varía el tipo de pregunta (definición, "¿cuál es...?", "¿qué cuenta se carga...?", verdadero sentido del concepto). ' +
  'Responde ÚNICAMENTE con el JSON solicitado, sin texto adicional.';

const SCHEMA = {
  type: 'object',
  properties: {
    cards: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          q: { type: 'string' },
          a: { type: 'string' }
        },
        required: ['q', 'a'],
        additionalProperties: false
      }
    }
  },
  required: ['cards'],
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

    var notes = (body.notes || '').toString().slice(0, 12000); // tope para no gastar de más
    if (notes.trim().length < 10) return json({ error: 'Pega apuntes con más contenido.' });

    var payload = {
      model: MODEL,
      max_tokens: 4096,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: 'Apuntes de la clase:\n\n' + notes }]
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
    if (code !== 200) {
      return json({ error: (data.error && data.error.message) || ('Error API ' + code) });
    }

    var textBlock = (data.content || []).filter(function (b) { return b.type === 'text'; })[0];
    if (!textBlock) return json({ error: 'La IA no devolvió tarjetas.' });
    var parsed = JSON.parse(textBlock.text);
    return json({ cards: parsed.cards || [] });

  } catch (err) {
    return json({ error: 'Error en el proxy: ' + err });
  }
}

// Para probar la URL en el navegador (GET): debe decir "ContaQuest IA OK".
function doGet() {
  return ContentService.createTextOutput('ContaQuest IA OK');
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
