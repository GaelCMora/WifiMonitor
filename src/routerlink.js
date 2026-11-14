'use strict';
// Lectura automática de la lista de clientes del router, sin conocer de antemano cómo funciona cada marca:
// el usuario copia desde las herramientas de desarrollador de su navegador ("Copiar como cURL")
// la petición de inicio de sesión y la de la lista de clientes; aquí se repiten cada cierto tiempo.

/** Divide una línea de comando estilo bash (o cmd de Windows) en argumentos. */
function tokenize(cmd) {
  let s = String(cmd).trim();
  // continuaciones de línea: "\" (bash) o "^" (cmd)
  s = s.replace(/\\\r?\n/g, ' ').replace(/\^\r?\n/g, ' ');
  // formato cmd de Chrome: ^" ... ^" y escapes ^
  if (/\^"/.test(s)) s = s.replace(/\^"/g, '"').replace(/\^(.)/g, '$1');
  const out = [];
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;
    let tok = '';
    while (i < s.length && !/\s/.test(s[i])) {
      const c = s[i];
      if (c === "'" ) {
        const j = s.indexOf("'", i + 1); tok += s.slice(i + 1, j < 0 ? s.length : j); i = j < 0 ? s.length : j + 1;
      } else if (c === '$' && s[i + 1] === "'") {
        let j = i + 2;
        while (j < s.length && s[j] !== "'") { if (s[j] === '\\') { const n = s[j + 1]; tok += n === 'n' ? '\n' : n === 't' ? '\t' : n === 'r' ? '\r' : n; j += 2; } else { tok += s[j]; j++; } }
        i = j + 1;
      } else if (c === '"') {
        let j = i + 1;
        while (j < s.length && s[j] !== '"') { if (s[j] === '\\' && /["\\$`]/.test(s[j + 1])) { tok += s[j + 1]; j += 2; } else { tok += s[j]; j++; } }
        i = j + 1;
      } else if (c === '\\' && i + 1 < s.length) { tok += s[i + 1]; i += 2; } else { tok += c; i++; }
    }
    out.push(tok);
  }
  return out;
}

/** {url, method, headers, body} a partir de un comando curl copiado del navegador. */
function parseCurl(cmd) {
  const t = tokenize(cmd);
  if (!t.length || !/curl(\.exe)?$/i.test(t[0])) throw new Error('No parece un comando curl. En el navegador usa "Copiar como cURL (bash)".');
  const r = { url: '', method: '', headers: {}, body: null };
  for (let i = 1; i < t.length; i++) {
    const a = t[i];
    if (a === '-H' || a === '--header') { const hv = t[++i] || ''; const k = hv.indexOf(':'); if (k > 0) r.headers[hv.slice(0, k).trim().toLowerCase()] = hv.slice(k + 1).trim(); }
    else if (a === '-X' || a === '--request') r.method = (t[++i] || '').toUpperCase();
    else if (/^--data(-raw|-binary|-ascii|-urlencode)?$/.test(a) || a === '-d') r.body = (r.body ? r.body + '&' : '') + (t[++i] || '');
    else if (a === '-b' || a === '--cookie') r.headers.cookie = t[++i] || '';
    else if (/^-(u|A|e|o|w|m)$|^--(user|user-agent|referer|output|max-time|connect-timeout)$/.test(a)) {
      const v = t[++i] || '';
      if (a === '-A' || a === '--user-agent') r.headers['user-agent'] = v;
      if (a === '-e' || a === '--referer') r.headers.referer = v;
      if (a === '-u' || a === '--user') r.headers.authorization = 'Basic ' + Buffer.from(v).toString('base64');
    } else if (a.startsWith('-')) { /* banderas sin valor: --compressed, --insecure, -k… */ }
    else if (!r.url) r.url = a;
  }
  if (!r.url) throw new Error('El comando no trae la dirección.');
  const u = new URL(r.url);
  if (!/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname) && !(process.env.WIFIMONITOR_TEST && u.hostname === '127.0.0.1')) throw new Error('Solo se permiten direcciones de tu red local (192.168.x.x, 10.x.x.x…).');
  if (!r.method) r.method = r.body ? 'POST' : 'GET';
  return r;
}

const DROP = new Set(['content-length', 'host', 'accept-encoding', 'connection', 'cookie']);

function parseCookies(str) {
  const m = new Map();
  for (const part of String(str || '').split(/;\s*/)) { const k = part.indexOf('='); if (k > 0) m.set(part.slice(0, k).trim(), part.slice(k + 1).trim()); }
  return m;
}

async function send(req, jar, timeoutMs = 8000) {
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) if (!DROP.has(k)) headers[k] = v;
  const cookies = parseCookies(req.headers.cookie);
  for (const [k, v] of jar) cookies.set(k, v);                // las cookies del inicio de sesión ganan
  if (cookies.size) headers.cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(req.url, { method: req.method, headers, body: req.method === 'GET' ? undefined : req.body, redirect: 'manual', signal: ctrl.signal });
    const set = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
    for (const c of set) { const first = c.split(';')[0]; const k = first.indexOf('='); if (k > 0) jar.set(first.slice(0, k).trim(), first.slice(k + 1).trim()); }
    const text = await res.text();
    return { status: res.status, text };
  } finally { clearTimeout(to); }
}

/** Convierte una página HTML en texto con tabuladores entre celdas y renglones por fila. */
function htmlToText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(td|th)>/gi, '\t').replace(/<\/tr>|<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \r]+/g, ' ').replace(/\n\s*\n+/g, '\n');
}

/** Un enlace a un router: inicia sesión (si hay petición de login) y lee la lista. */
class RouterLink {
  constructor(cfg, onClients) {
    this.cfg = cfg;
    this.onClients = onClients;
    this.jar = new Map();
    this.loggedIn = false;
    this.status = { ok: null, t: 0, count: 0, error: '' };
  }

  async poll() {
    const c = this.cfg;
    try {
      const list = parseCurl(c.list);
      const login = c.login ? parseCurl(c.login) : null;
      if (login && !this.loggedIn) { await send(login, this.jar); this.loggedIn = true; }
      let r = await send(list, this.jar);
      let text = htmlToText(r.text) + '\n' + r.text;   // también el original, por si la lista viene en JSON
      let found = this.onClients(text, true);
      if (!found.length && login) {
        // sesión vencida: entrar de nuevo y reintentar una vez
        this.jar.clear(); await send(login, this.jar);
        r = await send(list, this.jar);
        text = htmlToText(r.text) + '\n' + r.text;
        found = this.onClients(text, true);
      }
      if (!found.length) throw new Error(r.status >= 300 && r.status < 400 ? 'El router pidió iniciar sesión otra vez (revisa la petición de login).' : 'La página no trae aparatos (¿es la lista correcta?).');
      this.onClients(text, false);
      this.status = { ok: true, t: Date.now(), count: found.length, error: '' };
    } catch (e) {
      this.loggedIn = false;
      this.status = { ok: false, t: Date.now(), count: 0, error: e.name === 'AbortError' ? 'El router no respondió.' : e.message };
    }
    return this.status;
  }
}

module.exports = { parseCurl, tokenize, htmlToText, RouterLink };
