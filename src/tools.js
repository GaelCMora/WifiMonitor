'use strict';
// Herramientas de red que se ejecutan en la PC del monitor. Las entradas se validan antes de usarse.

const dgram = require('dgram');
const dns = require('dns');
const sys = require('./sys');

const HOST_RE = /^(?=.{1,253}$)[a-zA-Z0-9](?:[a-zA-Z0-9.\-]*[a-zA-Z0-9])?$|^[0-9a-fA-F:]{2,39}$/;
const MAC_RE = /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i;

function validHost(h) { return typeof h === 'string' && HOST_RE.test(h) && !h.startsWith('-'); }

async function ping(host) {
  if (!validHost(host)) return { error: 'Escribe un dominio o IP válido.' };
  const args = sys.IS_WIN ? ['-n', '4', host] : ['-c', '4', host];
  const out = await sys.run('ping', args, 15000);
  return { output: out.trim() || 'Sin respuesta.' };
}

async function trace(host) {
  if (!validHost(host)) return { error: 'Escribe un dominio o IP válido.' };
  const out = sys.IS_WIN
    ? await sys.run('tracert', ['-d', '-h', '15', '-w', '800', host], 60000)
    : (await sys.run('traceroute', ['-n', '-m', '15', '-w', '1', host], 60000)) || (await sys.run('tracepath', ['-n', host], 60000));
  return { output: out.trim() || 'No hay traceroute disponible en este sistema.' };
}

async function compareDns(name, gateway) {
  if (!validHost(name)) return { error: 'Escribe un dominio válido.' };
  const servers = [['Sistema (lo que usa esta PC)', null], ['Módem ' + (gateway || ''), gateway], ['Cloudflare 1.1.1.1', '1.1.1.1'], ['Google 8.8.8.8', '8.8.8.8']];
  const lines = [];
  for (const [label, srv] of servers) {
    if (srv === undefined || (label.startsWith('Módem') && !gateway)) continue;
    const t0 = process.hrtime.bigint();
    try {
      let ips;
      if (srv) { const r = new dns.promises.Resolver({ timeout: 3000, tries: 1 }); r.setServers([srv]); ips = await r.resolve4(name); }
      else ips = (await dns.promises.lookup(name, { all: true })).map((x) => x.address);
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      const fake = ips.length && ips.every((ip) => sys.isPrivateV4(ip) || ip.startsWith('127.') || ip === '0.0.0.0');
      lines.push(`${label.padEnd(30)} ${String(Math.round(ms)).padStart(5)} ms   ${ips.join(', ')}${fake ? '   ← DIRECCIÓN PRIVADA (sospechoso)' : ''}`);
    } catch (e) {
      lines.push(`${label.padEnd(30)}    —      falló (${e.code || e.message})`);
    }
  }
  return { output: `Resolviendo ${name}\n\n` + lines.join('\n') };
}

function wol(mac) {
  if (!MAC_RE.test(mac || '')) return Promise.resolve({ error: 'MAC inválida.' });
  const bytes = Buffer.from(mac.replace(/[:-]/g, ''), 'hex');
  const pkt = Buffer.alloc(102, 0xff);
  for (let i = 0; i < 16; i++) bytes.copy(pkt, 6 + i * 6);
  return new Promise((resolve) => {
    const s = dgram.createSocket('udp4');
    s.bind(() => {
      s.setBroadcast(true);
      let sent = 0;
      const done = () => { if (++sent === 2) { s.close(); resolve({ output: `Paquete mágico enviado a ${mac}. Si la PC tiene Wake-on-LAN activado, debería encender en unos segundos.` }); } };
      s.send(pkt, 9, '255.255.255.255', done);
      s.send(pkt, 7, '255.255.255.255', done);
    });
  });
}

async function flushDns() {
  if (sys.IS_WIN) {
    const out = await sys.run('ipconfig', ['/flushdns'], 10000);
    return { output: out.trim() || 'Listo.' };
  }
  if (process.platform === 'darwin') { await sys.run('dscacheutil', ['-flushcache']); return { output: 'Caché DNS limpiada.' }; }
  const out = await sys.run('resolvectl', ['flush-caches']);
  return { output: out.trim() || 'Pedido enviado (en Linux puede requerir permisos de administrador).' };
}

module.exports = { ping, trace, compareDns, wol, flushDns };
