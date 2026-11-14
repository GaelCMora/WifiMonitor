'use strict';
// Utilidades del sistema operativo: ping, ruta por defecto, tabla ARP y WiFi de la PC.
// Funciona en Windows (español o inglés), Linux y macOS.

const { execFile } = require('child_process');
const os = require('os');

const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';

function run(cmd, args, timeoutMs = 8000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, windowsHide: true, encoding: 'latin1', maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => resolve(err && !stdout ? '' : String(stdout || '')));
  });
}

// ---------------------------------------------------------------- ping

const RTT_RE = /(?:time|tiempo|zeit|temps)\s*[=<]\s*([\d.,]+)\s*ms?\b/i;

/** Devuelve la latencia en ms, o null si no hubo respuesta. */
async function ping(host, timeoutMs = 1000) {
  let args;
  if (IS_WIN) args = ['-n', '1', '-w', String(timeoutMs), host];
  else if (IS_MAC) args = ['-c', '1', '-W', String(timeoutMs), host];
  else args = ['-c', '1', '-W', String(Math.max(1, Math.round(timeoutMs / 1000))), host];
  const out = await run('ping', args, timeoutMs + 2500);
  // En Windows un "Host de destino inaccesible" también trae TTL=, pero no tiempo=.
  const m = out.match(RTT_RE);
  if (!m) return null;
  const v = parseFloat(m[1].replace(',', '.'));
  // "tiempo<1m" → menos de 1 ms
  return /(?:time|tiempo|zeit|temps)\s*<\s*1\s*m/i.test(out) ? 0.5 : v;
}

// ------------------------------------------------------- ruta por defecto

function isPrivateV4(ip) {
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
}

function localIPv4s() {
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) out.push({ name, address: a.address, netmask: a.netmask, mac: a.mac });
    }
  }
  return out;
}

/** {gateway, localIp} de la conexión con salida a internet. */
async function defaultRoute() {
  let gateway = null, localIp = null;
  if (IS_WIN) {
    const out = await run('route', ['print', '-4', '0.0.0.0']);
    // 0.0.0.0          0.0.0.0      192.168.0.1     192.168.0.17     25
    const rows = [...out.matchAll(/^\s*0\.0\.0\.0\s+0\.0\.0\.0\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+)/gm)]
      .map((m) => ({ gw: m[1], ip: m[2], metric: +m[3] }))
      .sort((a, b) => a.metric - b.metric);
    if (rows[0]) { gateway = rows[0].gw; localIp = rows[0].ip; }
  } else if (IS_MAC) {
    const out = await run('route', ['-n', 'get', 'default']);
    const g = out.match(/gateway:\s*(\S+)/); if (g) gateway = g[1];
  } else {
    const out = await run('ip', ['route', 'show', 'default']);
    const g = out.match(/default via (\S+)/); if (g) gateway = g[1];
    const s = out.match(/src (\S+)/); if (s) localIp = s[1];
  }
  const ifs = localIPv4s();
  if (!localIp && gateway) {
    const pre = gateway.split('.').slice(0, 3).join('.') + '.';
    const hit = ifs.find((i) => i.address.startsWith(pre));
    if (hit) localIp = hit.address;
  }
  if (!localIp) { const p = ifs.find((i) => isPrivateV4(i.address)); if (p) localIp = p.address; }
  if (!gateway && localIp) gateway = localIp.split('.').slice(0, 3).join('.') + '.1';
  return { gateway, localIp };
}

// ------------------------------------------------------------- tabla ARP

function normMac(m) {
  return m.toLowerCase().replace(/-/g, ':').split(':').map((x) => x.padStart(2, '0')).join(':');
}

async function arpTable() {
  const list = [];
  if (IS_WIN) {
    const out = await run('arp', ['-a']);
    for (const m of out.matchAll(/^\s*(\d+\.\d+\.\d+\.\d+)\s+([0-9a-f]{2}(?:-[0-9a-f]{2}){5})\s+(\S+)/gim)) {
      list.push({ ip: m[1], mac: normMac(m[2]) });
    }
  } else {
    let out = await run('ip', ['neigh']);
    if (out) {
      for (const m of out.matchAll(/^(\d+\.\d+\.\d+\.\d+) .*lladdr ([0-9a-f:]{17}) (\w+)/gim)) {
        if (m[3] !== 'FAILED') list.push({ ip: m[1], mac: normMac(m[2]) });
      }
    } else {
      out = await run('arp', ['-an']);
      for (const m of out.matchAll(/\((\d+\.\d+\.\d+\.\d+)\) at ([0-9a-f:]+)/gim)) list.push({ ip: m[1], mac: normMac(m[2]) });
    }
  }
  return list.filter((e) => e.mac !== 'ff:ff:ff:ff:ff:ff' && !e.mac.startsWith('01:00:5e') && !e.ip.endsWith('.255'));
}

// ------------------------------------------------------- WiFi de la PC

/** Datos de la conexión WiFi de la PC (solo Windows). null si está por cable. */
async function wifiInfo() {
  if (!IS_WIN) return null;
  const out = await run('netsh', ['wlan', 'show', 'interfaces']);
  if (!/SSID/i.test(out)) return null;
  const get = (re) => { const m = out.match(re); return m ? m[1].trim() : ''; };
  const state = get(/^\s*(?:Estado|State)\s*:\s*(.+)$/im);
  if (state && !/conectado|connected/i.test(state)) return null;
  if (/desconectado|disconnected/i.test(state)) return null;
  const signal = parseInt(get(/^\s*(?:Señal|Se.al|Signal)\s*:\s*(\d+)/im), 10);
  return {
    ssid: get(/^\s*SSID\s*:\s*(.+)$/im),
    bssid: get(/^\s*(?:AP\s+)?BSSID\s*:\s*(.+)$/im),
    radio: get(/^\s*(?:Tipo de radio|Radio type)\s*:\s*(.+)$/im),
    band: get(/^\s*(?:Banda|Band)\s*:\s*(.+)$/im),
    channel: parseInt(get(/^\s*(?:Canal|Channel)\s*:\s*(\d+)/im), 10) || null,
    signal: Number.isFinite(signal) ? signal : null,
    // Windows reporta porcentaje; aproximación estándar a dBm
    rssi: Number.isFinite(signal) ? Math.round(signal / 2 - 100) : null,
    rx: parseFloat(get(/^\s*(?:Velocidad de recepci.n|Receive rate).*?:\s*([\d.]+)/im)) || null,
    tx: parseFloat(get(/^\s*(?:Velocidad de transmisi.n|Transmit rate).*?:\s*([\d.]+)/im)) || null,
  };
}

/** Redes WiFi cercanas vistas por la PC (solo Windows con WiFi). */
async function wifiScan() {
  if (!IS_WIN) return [];
  const out = await run('netsh', ['wlan', 'show', 'networks', 'mode=bssid']);
  const nets = [];
  let ssid = '';
  let auth = '';
  let cur = null;
  for (const line of out.split(/\r?\n/)) {
    let m;
    if ((m = line.match(/^SSID \d+\s*:\s*(.*)$/i))) { ssid = m[1].trim() || '(oculta)'; auth = ''; cur = null; continue; }
    if ((m = line.match(/^\s*(?:Autenticaci.n|Authentication)\s*:\s*(.+)$/i))) { auth = m[1].trim(); continue; }
    if ((m = line.match(/^\s*BSSID \d+\s*:\s*(\S+)/i))) { cur = { ssid, bssid: m[1].toLowerCase(), auth, signal: null, channel: null, band: null }; nets.push(cur); continue; }
    if (!cur) continue;
    if ((m = line.match(/^\s*(?:Señal|Se.al|Signal)\s*:\s*(\d+)/i))) cur.signal = +m[1];
    else if ((m = line.match(/^\s*(?:Canal|Channel)\s*:\s*(\d+)/i))) cur.channel = +m[1];
    else if ((m = line.match(/^\s*(?:Banda|Band)\s*:\s*([\d.,]+)/i))) cur.band = parseFloat(m[1].replace(',', '.'));
  }
  for (const n of nets) {
    if (!n.band && n.channel) n.band = n.channel <= 14 ? 2.4 : n.channel >= 191 ? 6 : 5;
    n.rssi = Number.isFinite(n.signal) ? Math.round(n.signal / 2 - 100) : null;
  }
  return nets;
}

module.exports = { IS_WIN, run, ping, defaultRoute, localIPv4s, arpTable, wifiInfo, wifiScan, isPrivateV4 };
