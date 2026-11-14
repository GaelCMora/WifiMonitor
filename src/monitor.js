'use strict';
// Recolección de datos: latencia, DNS, línea de cable, dispositivos, WiFi de la PC.

const dns = require('dns');
const { EventEmitter } = require('events');
const sys = require('./sys');
const { VendorLookup, guessKind } = require('./vendor');

const HISTORY_MAX = 24 * 60 * 60 / 3;          // 24 h a una muestra cada 3 s
const PUBLIC_DNS = ['1.1.1.1', '8.8.8.8'];
const DNS_TEST_NAMES = ['google.com', 'youtube.com', 'api.steampowered.com', 'netflix.com', 'whatsapp.net', 'microsoft.com'];
const CABLE_URLS = ['http://192.168.100.1/cgi-bin/status_cgi', 'http://192.168.100.1/'];

function now() { return Date.now(); }
function avg(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; }
function round(v, d = 1) { return v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d; }

async function timed(fn, timeoutMs) {
  const t0 = process.hrtime.bigint();
  try {
    const res = await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))]);
    return { ms: Number(process.hrtime.bigint() - t0) / 1e6, res };
  } catch (e) {
    return { ms: null, err: e.code || e.message };
  }
}

class Monitor extends EventEmitter {
  constructor(store, opts = {}) {
    super();
    this.store = store;
    this.opts = opts;
    this.vendors = new VendorLookup(store);
    this.settings = Object.assign({
      internetHost: '1.1.1.1',
      rooms: [],
      places: {},          // ip -> cuarto donde está físicamente (módem, repetidor…)
      aliases: {},         // mac (o ip) -> nombre
      checklist: {},       // id -> true
      clients: {},         // mac -> { name, ip, rssi, ap, band, t }  (lista de clientes del router)
      links: [],           // lectura automática: [{ id, ap, band, login (curl), list (curl) }]
      trusted: {},         // mac -> true  (dispositivos marcados como "es mío")
      tickSec: 3,
      sweepSec: 60,
    }, store.load('settings', {}));
    this.survey = store.load('survey', []);
    this.speedRuns = store.load('speedruns', []);
    this.events = store.load('events', []).slice(-500);
    this.devices = new Map(Object.entries(store.load('devices', {})));
    this.history = [];
    this.net = { gateway: null, localIp: null };
    this.dns = null;
    this.cable = null;
    this.cableHistory = [];
    this.wifi = null;
    this.wifiNeighbors = [];
    this.flags = {};
    this.startedAt = now();
    this.timers = [];
  }

  // ------------------------------------------------------------- arranque

  async start() {
    this.net = await sys.defaultRoute();
    this.event(0, `Monitoreo iniciado · módem ${this.net.gateway || '?'} · esta PC ${this.net.localIp || '?'}`);
    const every = (fn, sec, first = 0) => {
      const run = async () => { try { await fn.call(this); } catch (e) { /* se reintenta en el siguiente ciclo */ } };
      setTimeout(run, first * 1000);
      this.timers.push(setInterval(run, sec * 1000));
    };
    every(this.tick, this.settings.tickSec, 0);
    every(this.checkDns, 30, 2);
    every(this.checkCable, 60, 4);
    every(this.sweep, this.settings.sweepSec, 6);
    every(this.checkWifi, 20, 3);
    every(async () => { this.net = await sys.defaultRoute(); }, 120, 120);
    every(this.persist, 60, 60);
    this.startLinks();
  }

  stop() { this.timers.forEach(clearInterval); this.persist(); }

  persist() {
    const dev = {};
    for (const [k, v] of this.devices) dev[k] = v;
    this.store.save('devices', dev);
    this.store.save('events', this.events.slice(-500));
  }

  saveSettings() { this.store.save('settings', this.settings); }

  // ------------------------------------------------------------- eventos

  event(level, text, kind = 'general') {
    const e = { t: now(), level, text, kind };
    this.events.push(e);
    if (this.events.length > 600) this.events.splice(0, this.events.length - 500);
    const tag = level === 2 ? '[PROBLEMA] ' : level === 1 ? '[AVISO] ' : '';
    this.store.appendText('eventos', new Date(e.t).toLocaleString('es-MX') + '  ' + tag + text, e.t);
    this.emit('event', e);
  }

  /** Cambia una bandera y emite un evento solo cuando cambia de estado. */
  flag(name, on, onText, offText, level = 1) {
    const was = !!this.flags[name];
    if (on && !was) { this.flags[name] = now(); this.event(level, onText, name); }
    else if (!on && was) {
      const secs = Math.round((now() - this.flags[name]) / 1000);
      this.flags[name] = 0;
      if (offText) this.event(0, offText.replace('{dur}', human(secs)), name);
    }
  }

  // ---------------------------------------------------- latencia (cada 3 s)

  async tick() {
    const gw = this.net.gateway;
    const host = this.settings.internetHost || '1.1.1.1';
    const [g, i] = await Promise.all([gw ? sys.ping(gw, 1000) : null, sys.ping(host, 1500)]);
    const s = { t: now(), gw: round(g), net: round(i) };
    this.history.push(s);
    if (this.history.length > HISTORY_MAX) this.history.splice(0, this.history.length - HISTORY_MAX);
    this.store.appendCsv('latencia', ['fecha', 'modem_ms', 'internet_ms'], [new Date(s.t).toISOString(), s.gw ?? '', s.net ?? ''], s.t);

    const recent = this.history.slice(-10);
    const gwLost = recent.filter((x) => x.gw === null).length;
    const netLost = recent.filter((x) => x.net === null).length;
    const lastThree = this.history.slice(-3);
    const gwDown = !!gw && lastThree.length === 3 && lastThree.every((x) => x.gw === null);
    const netDown = lastThree.length === 3 && lastThree.every((x) => x.net === null);

    this.flag('gwDown', gwDown, `El módem (${gw}) dejó de responder`, 'El módem volvió a responder (estuvo fuera {dur})', 2);
    this.flag('netDown', netDown && !gwDown,
      'Sin internet, pero el módem sí responde → falla de la línea del proveedor o del módem',
      'Internet volvió (estuvo caído {dur})', 2);
    this.flag('gwLoss', !!gw && !gwDown && gwLost >= 2, `Pérdida de paquetes hacia el módem (${gwLost * 10}% en los últimos 30 s)`, 'Sin pérdida hacia el módem otra vez');
    const gwAvg = avg(recent.filter((x) => x.gw !== null).map((x) => x.gw));
    this.flag('gwSlow', gwAvg !== null && gwAvg > 50, `Latencia alta hacia el módem: ${Math.round(gwAvg)} ms promedio`, 'Latencia al módem normal otra vez');
    this.flag('netLoss', !netDown && netLost >= 2 && gwLost === 0, `Pérdida de paquetes hacia internet (${netLost * 10}%) con el módem bien`, 'Sin pérdida hacia internet otra vez');

    this.emit('tick', s);
  }

  // ------------------------------------------------------ DNS (cada 30 s)

  async checkDns() {
    const name = DNS_TEST_NAMES[Math.floor(Math.random() * DNS_TEST_NAMES.length)];
    const resolverFor = (server) => { const r = new dns.promises.Resolver({ timeout: 2500, tries: 1 }); r.setServers([server]); return r; };
    const tests = {
      sistema: () => dns.promises.lookup(name, { all: true }).then((a) => a.map((x) => x.address)),
      modem: this.net.gateway ? () => resolverFor(this.net.gateway).resolve4(name) : null,
      cloudflare: () => resolverFor(PUBLIC_DNS[0]).resolve4(name),
      google: () => resolverFor(PUBLIC_DNS[1]).resolve4(name),
    };
    const out = { t: now(), name };
    for (const [k, fn] of Object.entries(tests)) {
      if (!fn) { out[k] = null; continue; }
      const r = await timed(fn, 3000);
      out[k] = { ms: round(r.ms), ok: r.ms !== null, ips: r.res || [], err: r.err || null };
    }
    // ¿El DNS del módem responde direcciones privadas para dominios públicos? (lo que bloqueaba Steam)
    const priv = (o) => o && o.ok && o.ips.length && o.ips.every((ip) => sys.isPrivateV4(ip) || ip.startsWith('127.'));
    out.modemHijack = priv(out.modem) && out.cloudflare && out.cloudflare.ok && !priv(out.cloudflare);
    out.systemHijack = priv(out.sistema) && out.cloudflare && out.cloudflare.ok && !priv(out.cloudflare);

    // Promedios móviles
    const prev = this.dns;
    const smooth = (k) => {
      const cur = out[k] && out[k].ms;
      const old = prev && prev.avg && prev.avg[k];
      if (cur === null || cur === undefined) return old ?? null;
      return old === null || old === undefined ? cur : round(old * 0.7 + cur * 0.3);
    };
    out.avg = { sistema: smooth('sistema'), modem: smooth('modem'), cloudflare: smooth('cloudflare'), google: smooth('google') };
    out.fails = Object.assign({ sistema: 0, modem: 0 }, prev && prev.fails);
    for (const k of ['sistema', 'modem']) out.fails[k] = out[k] && !out[k].ok ? out.fails[k] + 1 : 0;
    this.dns = out;

    this.flag('dnsHijack', out.modemHijack || out.systemHijack,
      `El DNS ${out.systemHijack ? 'que usa esta PC' : 'del módem'} respondió una dirección falsa (${(out.systemHijack ? out.sistema : out.modem).ips[0]}) para ${name}. Eso bloquea apps como Steam.`,
      'El DNS volvió a responder direcciones correctas', 2);
    this.flag('dnsModemFail', out.fails.modem >= 2, 'El DNS del módem no está respondiendo', 'El DNS del módem volvió a responder');
    this.flag('dnsSysFail', out.fails.sistema >= 2, 'El DNS que usa esta PC no está respondiendo (las páginas no cargarán)', 'El DNS de esta PC volvió a responder', 2);

    this.store.appendCsv('dns', ['fecha', 'dominio', 'sistema_ms', 'modem_ms', 'cloudflare_ms', 'google_ms', 'modem_ips'],
      [new Date(out.t).toISOString(), name, out.sistema?.ms ?? '', out.modem?.ms ?? '', out.cloudflare?.ms ?? '', out.google?.ms ?? '',
        out.modem?.ips?.join(' ') ?? ''], out.t);
    this.emit('dns', out);
  }

  // ---------------------------------------- línea de cable (módem DOCSIS)

  async checkCable() {
    if (this.opts.demo) return;
    let html = null;
    for (const url of CABLE_URLS) {
      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 4000);
        const r = await fetch(url, { signal: ctrl.signal });
        clearTimeout(to);
        if (r.ok) { html = await r.text(); if (/Downstream/i.test(html)) break; }
      } catch { /* sin módem de cable o no accesible */ }
    }
    if (!html || !/Downstream/i.test(html)) { this.cable = { t: now(), available: false }; return; }
    const parsed = parseCable(html);
    this.setCable(parsed);
  }

  setCable(parsed) {
    const prev = this.cable;
    const c = Object.assign({ t: now(), available: true }, parsed, evaluateCable(parsed));
    if (prev && prev.available && prev.totals) {
      c.newUncorrectables = Math.max(0, c.totals.uncorrectables - prev.totals.uncorrectables);
    } else c.newUncorrectables = 0;
    this.cable = c;
    this.cableHistory.push({ t: c.t, down: c.summary.downPowerAvg, snr: c.summary.snrMin, up: c.summary.upPowerMax, unc: c.newUncorrectables });
    if (this.cableHistory.length > 1440) this.cableHistory.shift();
    this.flag('cableBad', c.verdict === 'bad', `Línea de cable con problemas: ${c.issues.join('; ')}`, 'La línea de cable volvió a niveles normales', 2);
    this.flag('cableWarn', c.verdict === 'warn', `Línea de cable al límite: ${c.issues.join('; ')}`, null, 1);
    if (c.newUncorrectables > 50) this.event(1, `${c.newUncorrectables} errores incorregibles nuevos en la línea de cable en el último minuto`, 'cable');
    this.store.appendCsv('linea_cable', ['fecha', 'bajada_potencia_prom', 'snr_min', 'subida_potencia_max', 'incorregibles_nuevos', 'veredicto'],
      [new Date(c.t).toISOString(), c.summary.downPowerAvg, c.summary.snrMin, c.summary.upPowerMax, c.newUncorrectables, c.verdict], c.t);
    this.emit('cable', c);
  }

  // --------------------------------------------- WiFi de la PC (si tiene)

  async checkWifi() {
    if (this.opts.demo) return;
    this.wifi = await sys.wifiInfo();
    if (this.wifi && (!this.lastScan || now() - this.lastScan > 120000)) {
      this.lastScan = now();
      this.wifiNeighbors = await sys.wifiScan();
    }
  }

  // ----------------------------------------------- dispositivos (cada 60 s)

  async sweep() {
    if (this.opts.demo) return;
    const ip = this.net.localIp;
    if (!ip) return;
    const prefix = ip.split('.').slice(0, 3).join('.') + '.';
    const targets = [];
    for (let i = 1; i <= 254; i++) targets.push(prefix + i);
    const alive = new Map();
    let idx = 0;
    const worker = async () => {
      while (idx < targets.length) {
        const t = targets[idx++];
        const ms = await sys.ping(t, 700);
        if (ms !== null) alive.set(t, ms);
      }
    };
    await Promise.all(Array.from({ length: 48 }, worker));
    const arp = await sys.arpTable();
    const arpByIp = new Map(arp.filter((a) => a.ip.startsWith(prefix)).map((a) => [a.ip, a.mac]));
    const own = sys.localIPv4s().find((x) => x.address === ip);
    if (own) arpByIp.set(ip, own.mac);
    alive.set(ip, alive.get(ip) ?? 0);
    this.applySweep(alive, arpByIp);
  }

  applySweep(alive, arpByIp) {
    const t = now();
    const seenKeys = new Set();
    const first = !this.sweptOnce;
    for (const [ip, mac] of arpByIp) if (!alive.has(ip)) alive.set(ip, null);   // en ARP pero sin responder ping
    for (const [ip, ms] of alive) {
      const mac = arpByIp.get(ip) || '';
      const key = mac || ip;
      seenKeys.add(key);
      let d = this.devices.get(key);
      const isNew = !d;
      if (!d) d = { key, mac, ip, firstSeen: t, drops: 0, online: false, lastChange: t, history: [] };
      const vendor = this.vendors.get(mac) || d.vendor || '';
      Object.assign(d, { ip, mac, vendor, kind: guessKind(vendor, ip, this.net.gateway), lastSeen: t, ms: ms === null ? null : round(ms), misses: 0 });
      if (ip === this.net.localIp) d.kind = 'self';
      if (!d.online && !isNew) this.event(0, `${this.deviceName(d)} volvió a conectarse (fuera ${human(Math.round((t - d.lastChange) / 1000))})`, 'device');
      if (isNew && !first) {
        const trusted = mac && this.settings.trusted[mac];
        this.event(trusted ? 0 : 1, `${trusted ? 'Se conectó' : 'Dispositivo NUEVO en tu red'}: ${this.deviceName(d)}${vendor ? ' · ' + vendor : ''} (${ip})`, 'device');
      }
      if (!d.online) d.lastChange = t;
      d.online = true;
      d.history = (d.history || []).concat([[t, 1]]).slice(-200);
      this.devices.set(key, d);
      if (!d.host && !d.hostTried) this.reverseName(d);
    }
    for (const d of this.devices.values()) {
      if (seenKeys.has(d.key)) continue;
      d.misses = (d.misses || 0) + 1;
      d.ms = null;
      if (d.online && d.misses >= 2) {
        d.online = false;
        d.drops = (d.drops || 0) + 1;
        d.lastChange = t;
        d.history = (d.history || []).concat([[t, 0]]).slice(-200);
        const important = d.kind === 'modem' || d.kind === 'router' || this.settings.places[d.ip];
        this.event(important ? 2 : 1, `${this.deviceName(d)} se desconectó`, 'device');
      }
    }
    if (first) {
      const n = [...this.devices.values()].filter((d) => d.online).length;
      this.event(0, `Primer barrido: ${n} dispositivos en la red`, 'device');
    }
    this.sweptOnce = true;
    this.lastSweep = t;
    for (const d of this.devices.values()) {
      this.store.appendCsv('dispositivos', ['fecha', 'ip', 'mac', 'nombre', 'fabricante', 'en_linea', 'latencia_ms', 'caidas'],
        [new Date(t).toISOString(), d.ip, d.mac, this.deviceName(d), d.vendor, d.online ? 1 : 0, d.ms ?? '', d.drops], t);
    }
    this.emit('devices');
  }

  async reverseName(d) {
    d.hostTried = true;
    try {
      const r = new dns.promises.Resolver({ timeout: 1500, tries: 1 });
      if (this.net.gateway) r.setServers([this.net.gateway]);
      const names = await r.reverse(d.ip);
      if (names && names[0]) d.host = names[0].replace(/\.(local|lan|home|cpe\..*)$/i, '');
    } catch { /* sin nombre */ }
  }

  deviceName(d) {
    const a = this.settings.aliases[d.mac] || this.settings.aliases[d.ip];
    if (a) return a;
    if (d.kind === 'self') return 'Esta PC';
    if (d.ip === this.net.gateway) return 'Módem principal';
    const cl = d.mac && this.settings.clients[d.mac];
    if (cl && cl.name && !/^unknown$/i.test(cl.name)) return cl.name.replace(/-/g, ' ');
    if (d.host) return d.host;
    const v = d.vendor && !/privada|desconocido/i.test(d.vendor) ? d.vendor : '';
    if (d.kind === 'router') return 'Repetidor ' + (v || d.ip.split('.').pop());
    return (v ? v + ' ' : 'Dispositivo ') + d.ip.split('.').pop();
  }

  // ------------------------------------ lista de clientes pegada del router
  /**
   * Lee el texto copiado de la página "Lista de clientes" de un router (cualquier marca):
   * busca en cada renglón una MAC, una IP y un número negativo (RSSI).
   */
  importClients(text, ap, band, opts = {}) {
    const found = this.parseClients(text);
    if (opts.dry) return found;
    return this.saveClients(found, ap, band, opts.quiet);
  }

  parseClients(text) {
    const found = [];
    const lines = String(text || '').split(/\r?\n/);
    let pendingName = '';
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const mac = (line.match(/\b([0-9a-f]{2}([:-])[0-9a-f]{2}(?:\2[0-9a-f]{2}){4})\b/i) || [])[1];
      if (!mac) { if (line.trim() && !/nombre|name|ip|mac|rssi/i.test(line)) pendingName = line.trim(); continue; }
      const ip = (line.match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/) || [])[1] || '';
      const after = line.slice(line.toLowerCase().indexOf(mac.toLowerCase()) + mac.length);
      const rssiM = after.match(/(-\d{2,3})/);
      const cut = ip ? line.indexOf(ip) : line.toLowerCase().indexOf(mac.toLowerCase());
      let name = line.slice(0, cut).replace(/[0-9a-f]{1,4}(:[0-9a-f]{0,4}){2,7}/gi, '').trim().split(/\t/)[0].trim();
      if (!name || name === ip || name.toLowerCase() === mac.toLowerCase()) name = pendingName;
      // nombres partidos en dos renglones ("Tab-S6-Lite-de-Yud" + "ith")
      const next = (lines[i + 1] || '').trim();
      if (next && !/[0-9a-f]{2}[:-][0-9a-f]{2}/i.test(next) && next.length <= 12 && !/\s/.test(next) && !/^(ss|et|net|less)$/i.test(next)) { name += next; i++; }
      pendingName = '';
      // Los "Ethernet" que lista un router suelen ser aparatos vistos a través del cable del otro módem: no se importan.
      if (/ethernet|cableado|wired|\blan\b/i.test(line + (lines[i + 1] || '').trim())) continue;
      if (/^static-|^dhcp-/i.test(name)) name = '';
      const key = mac.toLowerCase().replace(/-/g, ':');
      const prev = found.find((f) => f.mac === key);
      const entry = { mac: key, name: name.slice(0, 40), ip: ip.includes('.') ? ip : (prev && prev.ip) || '', rssi: rssiM ? parseInt(rssiM[1], 10) : null };
      if (prev) { if (!prev.ip && entry.ip) prev.ip = entry.ip; continue; }
      found.push(entry);
    }
    return found;
  }

  saveClients(found, ap, band, quiet) {
    const t = Date.now();
    for (const f of found) {
      const cur = this.settings.clients[f.mac] || {};
      this.settings.clients[f.mac] = { name: f.name || cur.name || '', ip: f.ip || cur.ip || '', rssi: f.rssi, ap: String(ap || '').slice(0, 40), band: band === '5' ? '5' : '2.4', t };
    }
    this.saveSettings();
    if (found.length && !quiet) this.event(0, `Lista de clientes importada (${found.length} aparatos en ${this.apName(ap)} ${band === '5' ? '5' : '2.4'} GHz)`, 'clients');
    this.emit('devices');
    return found;
  }

  // ------------------------------- lectura automática de routers (cURL)
  startLinks() {
    const { RouterLink } = require('./routerlink');
    this.links = new Map();
    for (const cfg of this.settings.links || []) this.addLink(cfg, RouterLink);
    if (!this.linkTimer) this.linkTimer = setInterval(() => this.pollLinks(), 120000);
    setTimeout(() => this.pollLinks(), 5000);
  }

  addLink(cfg, RouterLink = require('./routerlink').RouterLink) {
    const link = new RouterLink(cfg, (text, dry) => this.importClients(text, cfg.ap, cfg.band, { dry, quiet: true }));
    this.links.set(cfg.id, link);
    return link;
  }

  async pollLinks() {
    for (const link of this.links.values()) {
      const was = link.status.ok;
      const st = await link.poll();
      if (st.ok === false && was !== false) this.event(1, `No se pudo leer ${this.apName(link.cfg.ap)} (${link.cfg.band} GHz): ${st.error}`, 'clients');
      if (st.ok && was === false) this.event(0, `Lectura de ${this.apName(link.cfg.ap)} restablecida`, 'clients');
    }
    this.emit('devices');
  }

  linkStatus() {
    return (this.settings.links || []).map((c) => {
      const l = this.links && this.links.get(c.id);
      return { id: c.id, ap: c.ap, band: c.band, hasLogin: !!c.login, status: l ? l.status : null };
    });
  }

  apName(ip) {
    const d = [...this.devices.values()].find((x) => x.ip === ip);
    return d ? this.deviceName(d) : ip;
  }

  // --------------------------------------------- pruebas desde el celular

  addSurvey(r) {
    const entry = {
      id: Math.random().toString(36).slice(2, 10), t: now(),
      room: String(r.room || 'Sin cuarto').slice(0, 40), network: String(r.network || '').slice(0, 40),
      device: String(r.device || '').slice(0, 60),
      down: round(+r.down), up: round(+r.up), ping: round(+r.ping), jitter: round(+r.jitter), loss: round(+r.loss),
      clientIp: r.clientIp || '',
    };
    this.survey.push(entry);
    if (this.survey.length > 1000) this.survey.shift();
    if (!this.settings.rooms.includes(entry.room)) { this.settings.rooms.push(entry.room); this.saveSettings(); }
    this.store.save('survey', this.survey);
    this.store.appendCsv('pruebas_cuartos', ['fecha', 'cuarto', 'red', 'dispositivo', 'bajada_mbps', 'subida_mbps', 'ping_ms', 'jitter_ms', 'perdida_pct'],
      [new Date(entry.t).toISOString(), entry.room, entry.network, entry.device, entry.down, entry.up, entry.ping, entry.jitter, entry.loss], entry.t);
    this.event(0, `Prueba en ${entry.room}${entry.network ? ' (' + entry.network + ')' : ''}: ${entry.down} Mbps bajada, ${entry.ping} ms`, 'survey');
    return entry;
  }

  deleteSurvey(id) {
    this.survey = this.survey.filter((s) => s.id !== id);
    this.store.save('survey', this.survey);
  }

  /** Resumen por cuarto: última y mejor prueba, promedio. */
  rooms() {
    const by = new Map();
    for (const s of this.survey) {
      if (!by.has(s.room)) by.set(s.room, []);
      by.get(s.room).push(s);
    }
    for (const r of this.settings.rooms) if (!by.has(r)) by.set(r, []);
    const best = Math.max(1, ...this.survey.map((s) => s.down || 0));
    return [...by.entries()].map(([room, list]) => {
      const last = list.slice(-5);
      const down = avg(last.map((s) => s.down).filter(Number.isFinite));
      const ping = avg(last.map((s) => s.ping).filter(Number.isFinite));
      const jitter = avg(last.map((s) => s.jitter).filter(Number.isFinite));
      const score = down === null ? null : Math.round(Math.min(100, (down / best) * 80 + (ping !== null ? Math.max(0, 20 - ping / 2) : 0)));
      const networks = [...new Set(list.map((s) => s.network).filter(Boolean))];
      const byNet = networks.map((n) => {
        const l = list.filter((s) => s.network === n).slice(-5);
        return { network: n, down: round(avg(l.map((s) => s.down))), ping: round(avg(l.map((s) => s.ping))) };
      }).sort((a, b) => (b.down || 0) - (a.down || 0));
      const devicesHere = Object.entries(this.settings.places).filter(([, rm]) => rm === room).map(([ip]) => ip);
      return { room, tests: list.length, down: round(down), up: round(avg(last.map((s) => s.up).filter(Number.isFinite))), ping: round(ping), jitter: round(jitter), score, byNet, devicesHere, lastT: list.length ? list[list.length - 1].t : null };
    }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  }

  // ------------------------------------------------------------ resumen

  summary() {
    const recent = this.history.slice(-20);
    const okGw = recent.filter((x) => x.gw !== null);
    const okNet = recent.filter((x) => x.net !== null);
    const last = this.history[this.history.length - 1] || {};
    const devices = [...this.devices.values()];
    return {
      startedAt: this.startedAt,
      net: this.net,
      latest: last,
      gwAvg: round(avg(okGw.map((x) => x.gw))),
      netAvg: round(avg(okNet.map((x) => x.net))),
      gwLoss: recent.length ? Math.round(100 * (recent.length - okGw.length) / recent.length) : null,
      netLoss: recent.length ? Math.round(100 * (recent.length - okNet.length) / recent.length) : null,
      devicesOnline: devices.filter((d) => d.online).length,
      devicesTotal: devices.length,
      lastSweep: this.lastSweep || null,
      dns: this.dns,
      cable: this.cable,
      wifi: this.wifi,
      flags: Object.fromEntries(Object.entries(this.flags).filter(([, v]) => v)),
    };
  }

  /** Calificación 0–100 de la salud de la red con los motivos. */
  health() {
    const s = this.summary();
    let score = 100;
    const why = [];
    const pen = (p, msg) => { score -= p; why.push(msg); };
    if (s.flags.gwDown) pen(60, 'El módem no responde');
    else if (s.gwLoss > 0) pen(Math.min(30, s.gwLoss), `Pérdida al módem ${s.gwLoss}%`);
    if (s.flags.netDown) pen(50, 'Sin internet');
    else if (s.netLoss > 0) pen(Math.min(25, s.netLoss), `Pérdida a internet ${s.netLoss}%`);
    if (s.gwAvg > 20) pen(Math.min(15, (s.gwAvg - 20) / 4), `Módem lento (${s.gwAvg} ms)`);
    if (s.netAvg > 60) pen(Math.min(15, (s.netAvg - 60) / 6), `Internet lento (${s.netAvg} ms)`);
    if (s.dns) {
      if (s.dns.systemHijack) pen(25, 'DNS de esta PC devuelve direcciones falsas');
      else if (s.dns.fails.sistema) pen(20, 'DNS de esta PC no responde');
      else if (s.dns.avg.sistema > 150) pen(10, `DNS lento (${Math.round(s.dns.avg.sistema)} ms)`);
    }
    if (s.cable && s.cable.available) {
      if (s.cable.verdict === 'bad') pen(20, 'Línea de cable fuera de rango');
      else if (s.cable.verdict === 'warn') pen(8, 'Línea de cable al límite');
    }
    score = Math.max(0, Math.round(score));
    const label = score >= 90 ? 'Excelente' : score >= 75 ? 'Buena' : score >= 50 ? 'Con problemas' : 'Mala';
    return { score, label, why };
  }
}

// ---------------------------------------------------- análisis de cable

function stripTags(s) { return s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(); }

function parseCable(html) {
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) =>
    [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => stripTags(c[1])));
  const num = (s) => { const m = String(s || '').match(/-?[\d.]+/); return m ? parseFloat(m[0]) : null; };
  const down = [], up = [];
  for (const r of rows) {
    if (/^Downstream\s*\d+/i.test(r[0] || '') && r.length >= 5) {
      down.push({ ch: num(r[1]), freq: num(r[2]), power: num(r[3]), snr: num(r[4]), mod: r[5] || '', corrected: num(r[7]) || 0, uncorrectables: num(r[8]) || 0 });
    } else if (/^Upstream\s*\d+/i.test(r[0] || '') && r.length >= 4) {
      up.push({ ch: num(r[1]), freq: num(r[2]), power: num(r[3]), type: r[4] || '', mod: r[6] || r[5] || '' });
    }
  }
  return { down, up };
}

function evaluateCable({ down, up }) {
  const issues = [];
  let verdict = 'good';
  const bump = (v) => { if (v === 'bad' || (v === 'warn' && verdict === 'good')) verdict = v; };
  const powers = down.map((d) => d.power).filter(Number.isFinite);
  const snrs = down.map((d) => d.snr).filter(Number.isFinite);
  const ups = up.map((u) => u.power).filter(Number.isFinite);
  const summary = {
    downChannels: down.length, upChannels: up.length,
    downPowerAvg: round(avg(powers)), downPowerMin: powers.length ? Math.min(...powers) : null, downPowerMax: powers.length ? Math.max(...powers) : null,
    snrMin: snrs.length ? Math.min(...snrs) : null, snrAvg: round(avg(snrs)),
    upPowerMax: ups.length ? Math.max(...ups) : null, upPowerMin: ups.length ? Math.min(...ups) : null,
  };
  if (summary.downPowerMin !== null && (summary.downPowerMin < -10 || summary.downPowerMax > 10)) { bump('bad'); issues.push(`potencia de bajada ${summary.downPowerMin} a ${summary.downPowerMax} dBmV (ideal −7 a +7)`); }
  else if (summary.downPowerMin !== null && (summary.downPowerMin < -7 || summary.downPowerMax > 7)) { bump('warn'); issues.push(`potencia de bajada ${summary.downPowerMin} a ${summary.downPowerMax} dBmV (ideal −7 a +7)`); }
  if (summary.snrMin !== null && summary.snrMin < 30) { bump('bad'); issues.push(`SNR baja ${summary.snrMin} dB (ideal > 33)`); }
  else if (summary.snrMin !== null && summary.snrMin < 33) { bump('warn'); issues.push(`SNR al límite ${summary.snrMin} dB (ideal > 33)`); }
  if (summary.upPowerMax !== null && summary.upPowerMax > 53) { bump('bad'); issues.push(`potencia de subida alta ${summary.upPowerMax} dBmV (ideal 35–50)`); }
  else if (summary.upPowerMax !== null && summary.upPowerMax > 50) { bump('warn'); issues.push(`potencia de subida un poco alta ${summary.upPowerMax} dBmV (ideal 35–50)`); }
  if (summary.upPowerMin !== null && summary.upPowerMin < 35) { bump('warn'); issues.push(`potencia de subida baja ${summary.upPowerMin} dBmV`); }
  const totals = { corrected: down.reduce((s, d) => s + (d.corrected || 0), 0), uncorrectables: down.reduce((s, d) => s + (d.uncorrectables || 0), 0) };
  return { verdict, issues, summary, totals };
}

function human(sec) {
  if (sec < 60) return sec + ' s';
  if (sec < 3600) return Math.round(sec / 60) + ' min';
  return Math.floor(sec / 3600) + ' h ' + Math.round((sec % 3600) / 60) + ' min';
}

module.exports = { Monitor, parseCable, evaluateCable, human };
