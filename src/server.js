#!/usr/bin/env node
'use strict';
// Servidor web de WiFi Monitor. Escucha en todas las interfaces para poder abrirlo desde el celular.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { Store } = require('./store');
const { Monitor } = require('./monitor');
const { advice } = require('./advice');
const sys = require('./sys');
const tools = require('./tools');
const firewall = require('./firewall');
const THREE_DIR = (() => { try { return path.dirname(path.dirname(require.resolve('three'))); } catch { return null; } })();

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : def; };
const PORT = parseInt(opt('port', process.env.WIFIMONITOR_PORT || 7777), 10);
const HOST = opt('local', false) ? '127.0.0.1' : '0.0.0.0';
const DEMO = !!opt('demo', false);

const dataOpt = opt('data', undefined);
const store = new Store(typeof dataOpt === 'string' ? dataOpt
  : DEMO ? path.join(require('os').tmpdir(), 'wifimonitor-demo') : undefined);
const mon = new Monitor(store, { demo: DEMO });
mon.port = PORT;
const PUBLIC = path.join(__dirname, '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

function lanUrls() {
  return sys.localIPv4s()
    .filter((i) => sys.isPrivateV4(i.address) && !/virtualbox|vmware|vethernet|wsl|docker|hyper-v/i.test(i.name) && !i.address.startsWith('192.168.56.'))
    .sort((a, b) => (a.address === mon.net.localIp ? -1 : b.address === mon.net.localIp ? 1 : 0))
    .map((i) => ({ name: i.name, url: `http://${i.address}:${PORT}` }));
}

// ------------------------------------------------------------------ util

function send(res, code, body, type = 'application/json; charset=utf-8', extra = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(code, Object.assign({ 'Content-Type': type, 'Cache-Control': 'no-store' }, extra));
  res.end(data);
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too big')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function clientIp(req) { return (req.socket.remoteAddress || '').replace(/^::ffff:/, ''); }

function deviceList() {
  return [...mon.devices.values()].map((d) => ({
    key: d.key, ip: d.ip, mac: d.mac, vendor: d.vendor, kind: d.kind, online: d.online, ms: d.ms, drops: d.drops || 0,
    firstSeen: d.firstSeen, lastSeen: d.lastSeen, lastChange: d.lastChange, name: mon.deviceName(d),
    alias: mon.settings.aliases[d.mac] || mon.settings.aliases[d.ip] || '', place: mon.settings.places[d.ip] || '',
    history: (d.history || []).slice(-40),
    client: (d.mac && mon.settings.clients[d.mac]) || null,
    trusted: !!(d.mac && mon.settings.trusted[d.mac]) || d.kind === 'self' || d.kind === 'modem' || d.ip === mon.net.gateway,
  })).sort((a, b) => (b.online - a.online) || ipNum(a.ip) - ipNum(b.ip));
}
function ipNum(ip) { return ip.split('.').reduce((n, p) => n * 256 + (+p || 0), 0); }

function history(minutes) {
  const since = Date.now() - minutes * 60000;
  const h = mon.history.filter((s) => s.t >= since);
  const maxPts = 360;
  if (h.length <= maxPts) return h;
  // Reduce puntos conservando caídas (null) y picos.
  const step = h.length / maxPts; const out = [];
  for (let i = 0; i < maxPts; i++) {
    const seg = h.slice(Math.floor(i * step), Math.floor((i + 1) * step));
    if (!seg.length) continue;
    const pick = (k) => { const v = seg.map((x) => x[k]); if (v.some((x) => x === null)) return null; return Math.max(...v); };
    out.push({ t: seg[seg.length - 1].t, gw: pick('gw'), net: pick('net') });
  }
  return out;
}

function fullState(req) {
  return {
    now: Date.now(), demo: DEMO, port: PORT, urls: lanUrls(), you: clientIp(req), local: isLoopback(clientIp(req)),
    firewall: mon.firewall || null, lanSeen: mon.lanSeen || null, links: mon.linkStatus ? mon.linkStatus() : [],
    summary: mon.summary(), health: mon.health(), devices: deviceList(), rooms: mon.rooms(),
    survey: mon.survey.slice(-60), advice: advice(mon), events: mon.events.slice(-150).reverse(),
    settings: { rooms: mon.settings.rooms, places: mon.settings.places, checklist: mon.settings.checklist, internetHost: mon.settings.internetHost, plan: mon.settings.plan || null },
    cableHistory: mon.cableHistory.slice(-240), speedRuns: mon.speedRuns.slice(-20),
    wifiNeighbors: mon.wifiNeighbors, logs: store.logFiles().slice(0, 40),
  };
}

// ---------------------------------------------------- SSE en tiempo real

const clients = new Set();
function broadcast(type, data) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}
mon.on('tick', (s) => broadcast('tick', { s, summary: mon.summary(), health: mon.health() }));
mon.on('event', (e) => broadcast('event', e));
for (const ev of ['devices', 'dns', 'cable']) mon.on(ev, () => broadcast('refresh', { what: ev }));
setInterval(() => broadcast('ping', Date.now()), 20000);

// ------------------------------------------------- pruebas de velocidad

const RAND = crypto.randomBytes(1 << 20);

function speedDown(req, res, url) {
  const total = Math.min(200e6, Math.max(1e5, parseInt(url.searchParams.get('bytes') || '25000000', 10)));
  res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': total, 'Cache-Control': 'no-store' });
  let sent = 0;
  const pump = () => {
    while (sent < total) {
      const n = Math.min(RAND.length, total - sent);
      sent += n;
      if (!res.write(n === RAND.length ? RAND : RAND.subarray(0, n))) { res.once('drain', pump); return; }
    }
    res.end();
  };
  req.on('close', () => { sent = total; });
  pump();
}

function speedUp(req, res) {
  let n = 0;
  req.on('data', (c) => { n += c.length; });
  req.on('end', () => send(res, 200, { bytes: n }));
}

/** Prueba de internet hecha por la PC (por cable) contra Cloudflare. */
async function internetTest() {
  const result = { t: Date.now(), down: null, up: null, ping: null, error: null };
  try {
    const pings = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      await fetch('https://speed.cloudflare.com/__down?bytes=0', { cache: 'no-store' });
      pings.push(performance.now() - t0);
    }
    result.ping = Math.round(Math.min(...pings));
    // Bajada: 4 descargas en paralelo durante ~8 s
    let bytes = 0; const t0 = performance.now(); const deadline = t0 + 8000;
    const dl = async () => {
      while (performance.now() < deadline) {
        const r = await fetch('https://speed.cloudflare.com/__down?bytes=25000000', { cache: 'no-store' });
        const reader = r.body.getReader();
        for (;;) { const { done, value } = await reader.read(); if (done) break; bytes += value.length; if (performance.now() > deadline) { await reader.cancel(); break; } }
      }
    };
    await Promise.all([dl(), dl(), dl(), dl()]);
    result.down = Math.round((bytes * 8) / ((performance.now() - t0) / 1000) / 1e6 * 10) / 10;
    // Subida: 3 envíos en paralelo durante ~6 s
    let ub = 0; const u0 = performance.now(); const ud = u0 + 6000;
    const chunk = crypto.randomBytes(4 << 20);
    const ul = async () => { while (performance.now() < ud) { await fetch('https://speed.cloudflare.com/__up', { method: 'POST', body: chunk }); ub += chunk.length; } };
    await Promise.all([ul(), ul(), ul()]);
    result.up = Math.round((ub * 8) / ((performance.now() - u0) / 1000) / 1e6 * 10) / 10;
  } catch (e) { result.error = e.message; }
  mon.speedRuns.push(result);
  store.save('speedruns', mon.speedRuns.slice(-100));
  if (!result.error) {
    mon.event(0, `Prueba de internet desde la PC: ${result.down} Mbps bajada · ${result.up} Mbps subida · ${result.ping} ms`, 'speed');
    store.appendCsv('internet', ['fecha', 'bajada_mbps', 'subida_mbps', 'ping_ms'], [new Date(result.t).toISOString(), result.down, result.up, result.ping]);
  }
  return result;
}
let internetBusy = null;

// ------------------------------------------------------------- rutas

const isLoopback = (ip) => ip === '127.0.0.1' || ip === '::1' || ip === '';
async function checkFirewall() {
  if (DEMO || HOST === '127.0.0.1') return;
  try {
    const was = mon.firewall;
    mon.firewall = Object.assign(await firewall.check(PORT), { t: Date.now() });
    if (mon.firewall.applies && !mon.firewall.ok && (!was || was.ok)) mon.event(1, 'Los celulares no podrán abrir el panel: ' + mon.firewall.reason, 'firewall');
  } catch { /* */ }
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  const cip = clientIp(req);
  if (!isLoopback(cip)) mon.lanSeen = { ip: cip, t: Date.now() };
  try {
    if (p === '/api/state') return send(res, 200, fullState(req));
    if (p === '/api/history') return send(res, 200, history(Math.min(1440, parseInt(url.searchParams.get('min') || '60', 10))));
    if (p === '/api/ping') return send(res, 200, '1', 'text/plain');
    if (p === '/api/speed/down') return speedDown(req, res, url);
    if (p === '/api/speed/up' && req.method === 'POST') return speedUp(req, res);
    if (p === '/api/stream') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write('retry: 3000\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (p === '/api/qr.svg') {
      const u = url.searchParams.get('u') || (lanUrls()[0] || {}).url || `http://localhost:${PORT}`;
      const svg = await QRCode.toString(u, { type: 'svg', margin: 1, color: { dark: '#0b0f14', light: '#ffffff' } });
      return send(res, 200, svg, 'image/svg+xml');
    }
    if (p === '/api/survey' && req.method === 'POST') {
      const b = await readBody(req);
      b.clientIp = clientIp(req);
      return send(res, 200, mon.addSurvey(b));
    }
    if (p.startsWith('/api/survey/') && req.method === 'DELETE') { mon.deleteSurvey(p.split('/').pop()); return send(res, 200, { ok: true }); }
    if (p === '/api/alias' && req.method === 'POST') {
      const b = await readBody(req);
      const key = String(b.key || '').slice(0, 40);
      if (!key) return send(res, 400, { error: 'key' });
      if (b.name) mon.settings.aliases[key] = String(b.name).slice(0, 40); else delete mon.settings.aliases[key];
      mon.saveSettings();
      return send(res, 200, { ok: true });
    }
    if (p === '/api/clients' && req.method === 'POST') {
      const b = await readBody(req, 256 * 1024);
      const found = mon.importClients(String(b.text || ''), String(b.ap || ''), String(b.band || '2.4'));
      return send(res, 200, { ok: true, count: found.length, found });
    }
    if (p === '/api/links' && req.method === 'POST') {
      if (!isLoopback(cip)) return send(res, 403, { error: 'Configúralo desde la PC donde corre WiFi Monitor (contiene tu contraseña del router).' });
      const b = await readBody(req, 256 * 1024);
      const { parseCurl } = require('./routerlink');
      if (b.remove) {
        mon.settings.links = (mon.settings.links || []).filter((l) => l.id !== b.remove);
        mon.links && mon.links.delete(b.remove);
        mon.saveSettings();
        return send(res, 200, { ok: true, links: mon.linkStatus() });
      }
      try { parseCurl(b.list); if (b.login) parseCurl(b.login); } catch (e) { return send(res, 400, { error: e.message }); }
      const cfg = { id: Math.random().toString(36).slice(2, 9), ap: String(b.ap || '').slice(0, 40), band: b.band === '5' ? '5' : '2.4', login: String(b.login || '').slice(0, 20000), list: String(b.list).slice(0, 20000) };
      const link = mon.addLink(cfg);
      const st = await link.poll();
      if (!st.ok) { mon.links.delete(cfg.id); return send(res, 200, { ok: false, error: st.error }); }
      mon.settings.links = (mon.settings.links || []).concat([cfg]);
      mon.saveSettings();
      mon.emit('devices');
      return send(res, 200, { ok: true, count: st.count, links: mon.linkStatus() });
    }
    if (p === '/api/trust' && req.method === 'POST') {
      const b = await readBody(req);
      const mac = String(b.mac || '').toLowerCase().slice(0, 17);
      if (!/^[0-9a-f:]{17}$/.test(mac)) return send(res, 400, { error: 'mac' });
      if (b.trusted) mon.settings.trusted[mac] = true; else delete mon.settings.trusted[mac];
      mon.saveSettings();
      return send(res, 200, { ok: true });
    }
    if (p === '/api/place' && req.method === 'POST') {
      const b = await readBody(req);
      const ip = String(b.ip || '').slice(0, 40);
      if (b.room) { mon.settings.places[ip] = String(b.room).slice(0, 40); if (!mon.settings.rooms.includes(b.room)) mon.settings.rooms.push(String(b.room).slice(0, 40)); }
      else delete mon.settings.places[ip];
      mon.saveSettings();
      return send(res, 200, { ok: true });
    }
    if (p === '/api/rooms' && req.method === 'POST') {
      const b = await readBody(req);
      if (b.add && !mon.settings.rooms.includes(b.add)) mon.settings.rooms.push(String(b.add).slice(0, 40));
      if (b.remove) mon.settings.rooms = mon.settings.rooms.filter((r) => r !== b.remove);
      mon.saveSettings();
      return send(res, 200, { ok: true, rooms: mon.settings.rooms });
    }
    if (p === '/api/checklist' && req.method === 'POST') {
      const b = await readBody(req);
      if (b.done) mon.settings.checklist[b.id] = true; else delete mon.settings.checklist[b.id];
      mon.saveSettings();
      return send(res, 200, { ok: true });
    }
    if (p === '/api/internet-test' && req.method === 'POST') {
      if (DEMO) return send(res, 200, { t: Date.now(), down: 141.3, up: 21.8, ping: 9 });
      if (!internetBusy) internetBusy = internetTest().finally(() => { internetBusy = null; });
      return send(res, 200, await internetBusy);
    }
    if (p === '/api/plan' && req.method === 'POST') {
      const b = await readBody(req, 256 * 1024);
      const pl = b.plan || {};
      const num = (v, d) => (Number.isFinite(+v) ? Math.round(+v * 100) / 100 : d);
      const plan = {
        w: num(pl.w, 12), h: num(pl.h, 9),
        floors: (Array.isArray(pl.floors) && pl.floors.length ? pl.floors : ['Planta baja']).slice(0, 6).map((f) => String(f).slice(0, 30)),
        rooms: (pl.rooms || []).slice(0, 60).map((r) => ({ id: String(r.id).slice(0, 12), name: String(r.name || 'Cuarto').slice(0, 40), x: num(r.x, 0), y: num(r.y, 0), w: num(r.w, 3), h: num(r.h, 3), floor: Math.max(0, Math.min(5, parseInt(r.floor, 10) || 0)) })),
        pins: Object.fromEntries(Object.entries(pl.pins || {}).slice(0, 30).map(([k, v]) => [String(k).slice(0, 40), { x: num(v.x, 0), y: num(v.y, 0), floor: Math.max(0, Math.min(5, parseInt(v.floor, 10) || 0)) }])),
        extra: (pl.extra || []).slice(0, 10).map((e) => ({ id: String(e.id).slice(0, 40), name: String(e.name || 'Repetidor').slice(0, 40) })),
        devs: Object.fromEntries(Object.entries(pl.devs || {}).slice(0, 200).map(([k, v]) => [String(k).slice(0, 17), { x: num(v.x, 0), y: num(v.y, 0), floor: Math.max(0, Math.min(5, parseInt(v.floor, 10) || 0)) }])),
        showDevs: pl.showDevs !== false,
        wallH: Math.max(2, Math.min(5, num(pl.wallH, 2.5))),
        model: pl.model && ['glb', 'gltf', 'stl', 'obj'].includes(pl.model.ext) ? {
          ext: pl.model.ext, name: String(pl.model.name || '').slice(0, 60), v: Number.isFinite(+pl.model.v) ? +pl.model.v : 0,
          scale: Number.isFinite(+pl.model.scale) && +pl.model.scale > 0 ? +(+pl.model.scale).toPrecision(6) : 1, rotY: num(pl.model.rotY, 0), dx: num(pl.model.dx, 0), dy: num(pl.model.dy, 0), dz: num(pl.model.dz, 0),
          opacity: Math.max(0.05, Math.min(1, num(pl.model.opacity, 0.6))), zUp: !!pl.model.zUp, hideWalls: pl.model.hideWalls !== false,
        } : null,
      };
      mon.settings.plan = plan;
      for (const r of plan.rooms) if (!mon.settings.rooms.includes(r.name)) mon.settings.rooms.push(r.name);
      for (const [ip, room] of Object.entries(b.places || {})) mon.settings.places[String(ip).slice(0, 40)] = String(room).slice(0, 40);
      mon.saveSettings();
      return send(res, 200, { ok: true });
    }
    if (p === '/api/model') {
      const files = fs.readdirSync(store.dir).filter((f) => f.startsWith('model.'));
      if (req.method === 'POST') {
        const ext = String(url.searchParams.get('ext') || '').toLowerCase();
        if (!['glb', 'gltf', 'stl', 'obj'].includes(ext)) return send(res, 400, { error: 'formato' });
        for (const f of files) fs.unlinkSync(path.join(store.dir, f));
        const dest = path.join(store.dir, 'model.' + ext);
        const out = fs.createWriteStream(dest);
        let size = 0, aborted = false;
        req.on('data', (c) => { size += c.length; if (size > 150e6 && !aborted) { aborted = true; out.destroy(); req.destroy(); fs.rm(dest, () => {}); } });
        req.pipe(out);
        out.on('finish', () => { if (!aborted) send(res, 200, { ok: true, size }); });
        out.on('error', () => send(res, 500, { error: 'no se pudo guardar' }));
        return;
      }
      if (req.method === 'DELETE') { for (const f of files) fs.unlinkSync(path.join(store.dir, f)); return send(res, 200, { ok: true }); }
      if (!files.length) return send(res, 404, { error: 'sin modelo' });
      const f = path.join(store.dir, files[0]);
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': fs.statSync(f).size, 'Cache-Control': 'no-cache' });
      return fs.createReadStream(f).pipe(res);
    }
    if (p.startsWith('/api/tools/') && req.method === 'POST') {
      const b = await readBody(req);
      const t = p.slice(11);
      if (t === 'ping') return send(res, 200, await tools.ping(String(b.host || '')));
      if (t === 'trace') return send(res, 200, await tools.trace(String(b.host || '')));
      if (t === 'dns') return send(res, 200, await tools.compareDns(String(b.name || ''), mon.net.gateway));
      if (t === 'wol') return send(res, 200, await tools.wol(String(b.mac || '')));
      if (t === 'flushdns') return send(res, 200, await tools.flushDns());
      return send(res, 404, { error: 'herramienta desconocida' });
    }
    if (p.startsWith('/vendor/three/') && THREE_DIR) {
      const fp = path.join(THREE_DIR, path.normalize(p.slice(14)).replace(/^([/\\])+/, ''));
      if (!fp.startsWith(THREE_DIR) || !fs.existsSync(fp)) return send(res, 404, 'no');
      res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream', 'Cache-Control': 'max-age=86400' });
      return fs.createReadStream(fp).pipe(res);
    }
    if (p === '/api/fix-firewall' && req.method === 'POST') {
      // Solo desde la propia PC: abre la ventana de permiso de administrador ahí.
      if (!isLoopback(cip)) return send(res, 403, { error: 'Hazlo desde la PC donde corre WiFi Monitor.' });
      const r = await firewall.fix(PORT);
      mon.firewall = Object.assign(r.check || mon.firewall || {}, { t: Date.now() });
      if (r.ok) mon.event(0, 'Firewall configurado: ya se puede abrir el panel desde el celular', 'firewall');
      return send(res, 200, r);
    }
    if (p === '/api/logs') return send(res, 200, store.logFiles());
    if (p.startsWith('/api/logs/')) {
      const f = store.logPath(decodeURIComponent(p.slice(10)));
      if (!fs.existsSync(f)) return send(res, 404, { error: 'no existe' });
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="${path.basename(f)}"` });
      return fs.createReadStream(f).pipe(res);
    }
    if (p === '/api/health') return send(res, 200, { ok: true, pid: process.pid, port: PORT, firewall: mon.firewall || null });

    // Archivos estáticos
    let fp = path.join(PUBLIC, p === '/' ? 'index.html' : path.normalize(p).replace(/^([/\\])+/, ''));
    if (!fp.startsWith(PUBLIC)) return send(res, 403, 'no');
    if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) fp = path.join(PUBLIC, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(fp).pipe(res);
  } catch (e) {
    send(res, 500, { error: e.message });
  }
}

const server = http.createServer(handle);
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`El puerto ${PORT} ya está en uso. ¿Ya está corriendo? Prueba "wifimonitor off" o usa --port 7778.`);
  else console.error(e);
  process.exit(1);
});

(async () => {
  if (DEMO) require('./demo').load(mon);
  else await mon.start();
  checkFirewall(); setInterval(checkFirewall, 5 * 60000);
  server.listen(PORT, HOST, () => {
    console.log(`WiFi Monitor listo en http://localhost:${PORT}`);
    for (const u of lanUrls()) console.log(`  En tu red (${u.name}): ${u.url}`);
  });
})();

const shutdown = () => { try { mon.stop(); } catch { /* */ } process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
