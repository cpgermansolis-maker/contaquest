# 🤖 ContaQuest · Cómo activar el generador de tarjetas con IA

Esto conecta tu app a la **API de Claude (Anthropic)** a través de un pequeño
servidor intermedio (un *proxy*) en **Google Apps Script**. El proxy guarda tu
**llave secreta** para que NUNCA quede expuesta en el sitio público de GitHub Pages.

```
Tu app (GitHub Pages)  ──►  Proxy en Apps Script (guarda la llave)  ──►  API de Claude
   pegas apuntes                  tu API key vive aquí, en secreto         genera las tarjetas
```

Necesitas (una sola vez, ~10 minutos):
- Tu **API key de Anthropic** (la que ya tienes, empieza con `sk-ant-...`).
- Tu cuenta de **Google** (la misma que usas para todo).

---

## Paso 1 · Crear el proyecto de Apps Script

1. Entra a **https://script.google.com** (con tu cuenta de Google).
2. Clic en **Nuevo proyecto**.
3. Ponle nombre arriba a la izquierda: **ContaQuest IA**.
4. Borra todo lo que aparezca en el editor (`function myFunction() {}`).
5. Abre el archivo **`Code.gs`** de esta carpeta, **copia TODO su contenido** y
   pégalo en el editor de Apps Script. Guarda con **Ctrl+S**.

## Paso 2 · Guardar tu llave en secreto (Propiedades del script)

1. En Apps Script, clic en el engrane ⚙️ **Configuración del proyecto** (menú izquierdo).
2. Baja hasta **Propiedades del script** ▸ **Agregar propiedad del script**.
3. Agrega esta propiedad:
   - **Propiedad:** `ANTHROPIC_API_KEY`
   - **Valor:** tu llave `sk-ant-...`
4. (Recomendado) Agrega una segunda propiedad como "candado" para que nadie más use tu proxy:
   - **Propiedad:** `APP_TOKEN`
   - **Valor:** una palabra secreta tuya (ej. `cineteca2026` — invéntala).
5. Clic en **Guardar propiedades del script**.

> 🔒 Tu llave queda solo aquí, dentro de tu proyecto de Google. No viaja a la app pública.

## Paso 3 · Publicar el proxy como aplicación web

1. Arriba a la derecha: **Implementar** ▸ **Nueva implementación**.
2. En el engrane ⚙️ (tipo) elige **Aplicación web**.
3. Configura así:
   - **Descripción:** ContaQuest IA
   - **Ejecutar como:** **Yo** (tu correo)
   - **Quién tiene acceso:** **Cualquier persona**
4. Clic en **Implementar**.
5. Te pedirá **autorizar permisos** (es tu propio script): Continuar ▸ elige tu cuenta ▸
   "Configuración avanzada" ▸ "Ir a ContaQuest IA (no seguro)" ▸ **Permitir**.
   *(Sale "no seguro" solo porque el script es tuyo y no está verificado por Google; es seguro.)*
6. Copia la **URL de la aplicación web** (termina en **`/exec`**).

> Para probar: pega esa URL `/exec` en el navegador. Debe responder **`ContaQuest IA OK`**.

## Paso 4 · Conectar la app

1. Abre **ContaQuest** ▸ pestaña **Perfil** ▸ sección **🤖 Generador con IA**.
2. Pega la **URL** (la que termina en `/exec`).
3. Si pusiste `APP_TOKEN`, escribe la **misma palabra secreta** en el campo de abajo.
4. ¡Listo!

## Paso 5 · Usarlo

1. Ve a **Apuntes**, pega el resumen de tu clase en el cuadro de texto.
2. Clic en **✨ Generar tarjetas con IA**.
3. En unos segundos se llenan las tarjetas (formato `pregunta :: respuesta`).
   **Revísalas**, corrige lo que quieras, y dale **Crear mazo de estudio**.

---

## Notas

- **Modelo:** Claude Opus 4.8 (el más capaz). Genera entre 8 y 20 tarjetas por resumen.
- **Costo:** lo pagas tú en tu cuenta de Anthropic, por uso. Generar las tarjetas de una
  clase cuesta unos pocos centavos de dólar. El proxy limita el texto de entrada para no gastar de más.
- **Privacidad:** la URL y la palabra secreta se guardan **solo en tu dispositivo** (no en GitHub).
- **Si cambias el `Code.gs`:** en Apps Script, **Implementar ▸ Administrar implementaciones ▸**
  editar (lápiz) ▸ **Versión: Nueva** ▸ Implementar. La URL `/exec` se mantiene.
- **Si algo falla:** abre la URL `/exec` en el navegador (debe decir `ContaQuest IA OK`),
  revisa que `ANTHROPIC_API_KEY` esté bien escrita, y que la palabra secreta coincida en ambos lados.
