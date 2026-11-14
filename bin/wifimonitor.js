#!/usr/bin/env node
'use strict';
// CLI: wifimonitor on | off | status | open | logs | help

const { spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const args = process.argv.slice(2);
const cmd = (args[0] || 'help').toLowerCase();
const flag = (n) => args.includes('--' + n);
const val = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const PORT = parseInt(val('port', process.env.WIFIMONITOR_PORT || 7777), 10);
const HOME = process.env.WIFIMONITOR_HOME || path.join(os.homedir(), '.wifimonitor');
const PIDFILE = path.join(HOME, 'server.pid');
const LOGFILE = path.join(HOME, 'server.log');
const SERVER = path.join(__dirname, '..', 'src', 'server.js');

const c = { g: (s) => `\x1b[32m${s}\x1b[0m`, c: (s) => `\x1b[36m${s}\x1b[0m`, d: (s) => `\x1b[2m${s}\x1b[0m`, b: (s) => `\x1b[1m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m` };

async function health() {
  try {
    const ctrl = new AbortController(); setTimeout(() => ctrl.abort(), 1500);
    const r = await fetch(`http://127.0.0.1:${PORT}/api/health`, { signal: ctrl.signal });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

async function urls() {
  try { const r = await fetch(`http://127.0.0.1:${PORT}/api/state`); const s = await r.json(); return s.urls || []; } catch { return []; }
}

function openBrowser(u) {
  if (process.platform === 'win32') execFile('cmd', ['/c', 'start', '', u], { windowsHide: true });
  else if (process.platform === 'darwin') execFile('open', [u]);
  else execFile('xdg-open', [u], () => {});
}

async function printInfo() {
  const list = await urls();
  console.log('');
  console.log(c.b('  WiFi Monitor') + c.g(' ● encendido'));
  console.log(`  En esta PC:     ${c.c(`http://localhost:${PORT}`)}`);
  for (const u of list) console.log(`  En tu red:      ${c.c(u.url)} ${c.d('(' + u.name + ')')}`);
  if (list[0]) {
    try {
      const QR = require('qrcode');
      const qr = await QR.toString(list[0].url, { type: 'terminal', small: true });
      console.log('\n  Escanea con el celular (misma WiFi):\n');
      console.log(qr.split('\n').map((l) => '   ' + l).join('\n'));
    } catch { /* sin QR */ }
  }
  console.log(c.d('  Apagar: wifimonitor off   ·   Estado: wifimonitor status'));
  console.log('');
}

async function on() {
  fs.mkdirSync(HOME, { recursive: true });
  if (await health()) { await printInfo(); if (!flag('no-open')) openBrowser(`http://localhost:${PORT}`); return; }
  const sArgs = [SERVER, '--port', String(PORT)];
  if (flag('demo')) sArgs.push('--demo');
  if (flag('local')) sArgs.push('--local');
  if (flag('foreground') || flag('fg')) {
    const child = spawn(process.execPath, sArgs, { stdio: 'inherit' });
    child.on('exit', (code) => process.exit(code || 0));
    return;
  }
  const out = fs.openSync(LOGFILE, 'a');
  const child = spawn(process.execPath, sArgs, { detached: true, stdio: ['ignore', out, out], windowsHide: true });
  fs.writeFileSync(PIDFILE, String(child.pid));
  child.unref();
  process.stdout.write('  Iniciando');
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    if (await health()) {
      process.stdout.write('\r');
      await printInfo();
      if (process.platform === 'win32') {
        console.log(c.d('  Si Windows pregunta por el Firewall, marca "Redes privadas" y Permitir: así abre desde el celular.\n'));
      }
      if (!flag('no-open')) openBrowser(`http://localhost:${PORT}`);
      return;
    }
    process.stdout.write('.');
  }
  console.log('\n' + c.r('  No arrancó. Revisa el registro: ') + LOGFILE);
  try { console.log(fs.readFileSync(LOGFILE, 'utf8').split('\n').slice(-15).join('\n')); } catch { /* */ }
  process.exit(1);
}

async function off() {
  const h = await health();
  const pid = h ? h.pid : (fs.existsSync(PIDFILE) ? parseInt(fs.readFileSync(PIDFILE, 'utf8'), 10) : null);
  if (!pid) { console.log('  WiFi Monitor no está corriendo.'); return; }
  try {
    if (process.platform === 'win32') await new Promise((r) => execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, r));
    else process.kill(pid, 'SIGTERM');
  } catch { /* ya terminó */ }
  try { fs.unlinkSync(PIDFILE); } catch { /* */ }
  console.log('  ' + c.d('●') + ' WiFi Monitor apagado.');
}

async function status() {
  if (await health()) await printInfo();
  else console.log('  WiFi Monitor está ' + c.r('apagado') + '. Enciéndelo con: wifimonitor on');
}

function help() {
  console.log(`
  ${c.b('wifimonitor')} — monitor de la red de tu casa en el navegador

  ${c.c('wifimonitor on')}          Enciende el monitor y abre el panel
  ${c.c('wifimonitor off')}         Lo apaga
  ${c.c('wifimonitor status')}      Muestra si está encendido y sus direcciones
  ${c.c('wifimonitor open')}        Abre el panel en el navegador
  ${c.c('wifimonitor logs')}        Abre la carpeta con los registros (CSV)

  Opciones de "on":
    --port 7777     puerto (por defecto 7777)
    --local         solo accesible desde esta PC (sin celular)
    --demo          datos de ejemplo, para ver cómo se ve
    --foreground    no lo manda al fondo (para ver errores)
    --no-open       no abre el navegador
`);
}

(async () => {
  switch (cmd) {
    case 'on': case 'start': return on();
    case 'off': case 'stop': return off();
    case 'status': return status();
    case 'open': return openBrowser(`http://localhost:${PORT}`);
    case 'logs': {
      const dir = path.join(HOME, 'logs'); fs.mkdirSync(dir, { recursive: true });
      console.log('  ' + dir);
      if (process.platform === 'win32') execFile('explorer', [dir]); else openBrowser(dir);
      return;
    }
    default: return help();
  }
})();
