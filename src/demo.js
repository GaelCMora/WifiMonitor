'use strict';
// Datos de ejemplo para ver la interfaz sin una red real: `wifimonitor on --demo`.

const { parseCable } = require('./monitor');

function rnd(a, b) { return a + Math.random() * (b - a); }

function cableHtml(upPower) {
  let rows = '';
  const powers = [-0.9, -1.3, -1.2, -1.1, -1.2, -0.8, -1.0, -1.2, -1.2, -1.3, -1.0, -1.0, -0.9, -1.4, -0.9, -0.9, -0.8, -0.9, -0.9, -1.4, -1.4, -1.2, -1.6, -2.2];
  powers.forEach((p, i) => {
    rows += `<tr><td>Downstream ${i + 1}</td><td>${i + 1}</td><td>${219 + i * 6}.00 MHz</td><td>${p} dBmV</td><td>${i % 3 ? 38.98 : 38.61} dB</td><td>256QAM</td><td>1890111400</td><td>${i === 21 ? 15 : 0}</td><td>0</td></tr>`;
  });
  [[1, 38, upPower], [3, 29.5, upPower - 0.5], [2, 34, upPower - 1], [4, 24, upPower - 0.25]].forEach(([c, f, p], i) => {
    rows += `<tr><td>Upstream ${i + 1}</td><td>${c}</td><td>${f} MHz</td><td>${p} dBmV</td><td>DOCSIS2.0 (ATDMA)</td><td>2560 kSym/s</td><td>64QAM</td></tr>`;
  });
  return `<table>${rows}</table>`;
}

function load(mon) {
  const t0 = Date.now();
  mon.net = { gateway: '192.168.0.1', localIp: '192.168.0.17' };
  mon.settings.places = { '192.168.0.1': 'Cuarto', '192.168.0.2': 'Sala' };
  mon.settings.rooms = ['Cuarto', 'Sala', 'Cocina', 'Patio', 'Baño'];
  mon.settings.plan = {
    w: 13, h: 10,
    floors: ['Planta baja', 'Planta alta'],
    rooms: [
      { id: 'r1', name: 'Cuarto', x: 0, y: 0, w: 4.5, h: 4, floor: 0 },
      { id: 'r2', name: 'Baño', x: 4.5, y: 0, w: 2.5, h: 2.5 },
      { id: 'r3', name: 'Sala', x: 0, y: 4, w: 7, h: 5 },
      { id: 'r4', name: 'Cocina', x: 7, y: 4, w: 4, h: 5 },
      { id: 'r5', name: 'Patio', x: 7, y: 0, w: 6, h: 4 },
      { id: 'u1', name: 'Recámara 2', x: 0, y: 0, w: 4.5, h: 4.5, floor: 1 },
      { id: 'u2', name: 'Estudio', x: 4.5, y: 0, w: 4, h: 4.5, floor: 1 },
      { id: 'u3', name: 'Recámara 3', x: 0, y: 4.5, w: 5, h: 4.5, floor: 1 },
    ],
    pins: { '192.168.0.1': { x: 1, y: 1 }, '192.168.0.2': { x: 5.5, y: 7.5 } },
    extra: [],
  };

  // Una hora de latencias con un par de tropiezos
  for (let i = 1200; i > 0; i--) {
    const t = t0 - i * 3000;
    let gw = Math.round(rnd(0.6, 2.4) * 10) / 10, net = Math.round(rnd(8, 16) * 10) / 10;
    if (i > 700 && i < 712) net = null;                     // corte de internet de ~36 s
    if (i > 380 && i < 400) net = Math.round(rnd(60, 140)); // momento lento
    if (i === 250 || i === 251) gw = null;
    mon.history.push({ t, gw, net });
  }

  mon.dns = {
    t: t0, name: 'api.steampowered.com',
    sistema: { ms: 14, ok: true, ips: ['173.223.234.143'] }, modem: { ms: 212, ok: true, ips: ['10.10.10.10'] },
    cloudflare: { ms: 13, ok: true, ips: ['173.223.234.143'] }, google: { ms: 22, ok: true, ips: ['173.223.234.143'] },
    modemHijack: true, systemHijack: false, avg: { sistema: 14, modem: 212, cloudflare: 13, google: 22 }, fails: { sistema: 0, modem: 0 },
  };
  mon.setCable(parseCable(cableHtml(51.25)));
  mon.cableHistory = Array.from({ length: 120 }, (_, i) => ({ t: t0 - (120 - i) * 60000, down: -1.1, snr: 38.6, up: 51.25 - (i % 7 === 0 ? 0.5 : 0), unc: 0 }));

  const devs = [
    ['192.168.0.1', 'ec:a9:40:82:1f:88', 'ARRIS', 'modem', 1.2, 0],
    ['192.168.0.2', '48:46:fb:11:22:33', 'Huawei', 'router', 1.8, 0],
    ['192.168.0.17', '04:42:1a:aa:bb:cc', 'ASUS', 'self', 0, 0],
    ['192.168.0.8', 'f4:f5:d8:44:55:66', 'Google', 'tv', 38, 5],
    ['192.168.0.11', 'a6:12:9f:00:11:22', 'MAC privada (celular/tablet)', 'phone', 12, 2],
    ['192.168.0.14', '8c:79:f5:21:43:65', 'Samsung', 'tv', 6, 0],
    ['192.168.0.21', '24:6f:28:aa:00:01', 'Espressif (IoT)', 'iot', 22, 1],
    ['192.168.0.23', '7c:bb:8a:10:20:30', 'Nintendo', 'console', null, 1],
  ];
  for (const [ip, mac, vendor, kind, ms, drops] of devs) {
    mon.devices.set(mac, { key: mac, ip, mac, vendor, kind, ms, drops, online: ms !== null, firstSeen: t0 - 864e5, lastSeen: t0, lastChange: t0 - rnd(1e5, 5e6), history: [] });
  }
  mon.settings.aliases = { 'f4:f5:d8:44:55:66': 'Chromecast sala', '48:46:fb:11:22:33': 'Telmex (repetidor)', 'a6:12:9f:00:11:22': 'Celular de Gael', '8c:79:f5:21:43:65': 'TV Samsung cuarto' };
  mon.lastSweep = t0 - 20000; mon.sweptOnce = true;

  const sv = [
    ['Cuarto', 'IZZI-E972-5G', 98, 18, 4, 2], ['Cuarto', 'IZZI-E972', 28, 9, 7, 6],
    ['Sala', 'IZZI-E972', 47, 11, 9, 8], ['Sala', 'Telmex 5G', 112, 24, 3, 1],
    ['Cocina', 'IZZI-E972', 14, 4, 24, 31], ['Patio', 'IZZI-E972', 6, 1.5, 41, 48],
  ];
  mon.survey = sv.map(([room, network, down, up, ping, jitter], i) => ({ id: 'd' + i, t: t0 - (10 - i) * 600000, room, network, device: 'Android', down, up, ping, jitter, loss: 0 }));
  mon.speedRuns = [{ t: t0 - 3600e3, down: 140.2, up: 21.6, ping: 9 }];
  mon.events = [];
  mon.event(0, 'Monitoreo iniciado (modo demostración)');
  mon.event(2, 'Sin internet, pero el módem sí responde → falla de la línea del proveedor o del módem');
  mon.event(0, 'Internet volvió (estuvo caído 36 s)');
  mon.event(2, 'El DNS del módem respondió una dirección falsa (10.10.10.10) para api.steampowered.com. Eso bloquea apps como Steam.');
  mon.event(1, 'Chromecast sala se desconectó');
  mon.event(0, 'Chromecast sala volvió a conectarse (fuera 2 min)');
  mon.event(1, 'Línea de cable al límite: potencia de subida un poco alta 51.25 dBmV (ideal 35–50)');

  setInterval(() => {
    const s = { t: Date.now(), gw: Math.round(rnd(0.6, 2.4) * 10) / 10, net: Math.round(rnd(8, 18) * 10) / 10 };
    mon.history.push(s);
    mon.emit('tick', s);
  }, 3000);
}

module.exports = { load };
