'use strict';
/* WiFi Monitor — interfaz web (sin dependencias) */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const SVGNS = 'http://www.w3.org/2000/svg';

/** Crea elementos de forma segura: el texto siempre va por textContent. */
function h(tag, attrs = {}, ...kids) {
  const el = tag.startsWith('svg:') ? document.createElementNS(SVGNS, tag.slice(4)) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;            // solo se usa con íconos fijos de este archivo
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}

const ICON = {
  critical: '<svg viewBox="0 0 24 24"><path d="M12 2 1 21h22L12 2zm1 15h-2v-2h2v2zm0-4h-2V9h2v4z"/></svg>',
  serious: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>',
  warning: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>',
  tip: '<svg viewBox="0 0 24 24"><path d="M9 21h6v-1H9v1zm3-19a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>',
  good: '<svg viewBox="0 0 24 24"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/></svg>',
  modem: '<svg viewBox="0 0 24 24"><path d="M4 14h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2zm2 3.5a1 1 0 1 0 0 .01zm3 0a1 1 0 1 0 0 .01zM7 4l1.4 1.4a5 5 0 0 0 0 7.1L7 14a7 7 0 0 1 0-10zm10 0a7 7 0 0 1 0 10l-1.4-1.4a5 5 0 0 0 0-7.1z"/></svg>',
  router: '<svg viewBox="0 0 24 24"><path d="M5 13h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2zm2 4a1 1 0 1 0 0 .01zM11 4h2v8h-2zM7.8 6.2l1.4 1.4A4 4 0 0 0 8 10.5H6a6 6 0 0 1 1.8-4.3zm8.4 0A6 6 0 0 1 18 10.5h-2a4 4 0 0 0-1.2-2.9z"/></svg>',
  tv: '<svg viewBox="0 0 24 24"><path d="M21 3H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5v2h8v-2h5a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 14H3V5h18v12z"/></svg>',
  phone: '<svg viewBox="0 0 24 24"><path d="M16 1H8a3 3 0 0 0-3 3v16a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V4a3 3 0 0 0-3-3zm-4 21a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5-4H7V4h10v14z"/></svg>',
  pc: '<svg viewBox="0 0 24 24"><path d="M20 18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/></svg>',
  self: '<svg viewBox="0 0 24 24"><path d="M20 18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/></svg>',
  iot: '<svg viewBox="0 0 24 24"><path d="M9 21h6v-1H9v1zm3-19a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>',
  console: '<svg viewBox="0 0 24 24"><path d="M21 6H3a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2zm-10 7H8v3H6v-3H3v-2h3V8h2v3h3v2zm4.5 2a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm4-3a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/></svg>',
  vm: '<svg viewBox="0 0 24 24"><path d="M4 4h16v12H4zM2 18h20v2H2z"/></svg>',
  unknown: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 17h-2v-2h2v2zm2.1-7.7-.9.9A3.4 3.4 0 0 0 13 15h-2v-.5a4 4 0 0 1 1.2-2.8l1.2-1.3A2 2 0 1 0 10 9H8a4 4 0 1 1 7.1 2.3z"/></svg>',
  globe: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-3a15.7 15.7 0 0 0-1.4-3.6A8 8 0 0 1 18.9 8zM12 4c.8 1.2 1.5 2.5 1.9 4h-3.8c.4-1.5 1.1-2.8 1.9-4zM4.3 14a8.2 8.2 0 0 1 0-4h3.4a16.5 16.5 0 0 0 0 4H4.3zm.8 2h3a15.7 15.7 0 0 0 1.4 3.6A8 8 0 0 1 5.1 16zm3-8h-3a8 8 0 0 1 4.3-3.6C8.9 5.5 8.4 6.7 8.1 8zM12 20c-.8-1.2-1.5-2.5-1.9-4h3.8c-.4 1.5-1.1 2.8-1.9 4zm2.3-6H9.7a14.7 14.7 0 0 1 0-4h4.6a14.7 14.7 0 0 1 0 4zm.3 5.6c.6-1.1 1.1-2.3 1.4-3.6h3a8 8 0 0 1-4.4 3.6zm1.7-5.6a16.5 16.5 0 0 0 0-4h3.4a8.2 8.2 0 0 1 0 4h-3.4z"/></svg>',
};
const LEVEL_TXT = { critical: 'Urgente', serious: 'Importante', warning: 'Revisar', tip: 'Consejo', good: 'Bien' };
const KIND_TXT = { modem: 'Módem', router: 'Router / repetidor', tv: 'TV / streaming', phone: 'Celular / tablet', pc: 'Computadora', self: 'Esta PC', iot: 'Aparato inteligente', console: 'Consola', vm: 'Máquina virtual', unknown: 'Desconocido' };

let S = null;                 // estado completo del servidor
let hist = [];                // historial de latencia de la gráfica
let rangeMin = 60;
let devFilter = 'all';
let evFilter = 'all';

// --------------------------------------------------------------- utilidades
const fmt = {
  ms: (v) => (v === null || v === undefined ? '—' : v < 10 ? v.toFixed(1) : Math.round(v)),
  mbps: (v) => (v === null || v === undefined ? '—' : v >= 100 ? Math.round(v) : v.toFixed(1)),
  time: (t) => new Date(t).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false }),
  timeS: (t) => new Date(t).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
  ago(t) {
    if (!t) return '—';
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 60) return 'hace ' + s + ' s';
    if (s < 3600) return 'hace ' + Math.round(s / 60) + ' min';
    if (s < 86400) return 'hace ' + Math.round(s / 3600) + ' h';
    return 'hace ' + Math.round(s / 86400) + ' d';
  },
  dur(ms) {
    const s = Math.round(ms / 1000);
    if (s < 60) return s + ' s'; if (s < 3600) return Math.round(s / 60) + ' min';
    if (s < 86400) return Math.floor(s / 3600) + ' h ' + Math.round((s % 3600) / 60) + ' min';
    return Math.floor(s / 86400) + ' d ' + Math.round((s % 86400) / 3600) + ' h';
  },
  bytes: (b) => (b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(1) + ' MB'),
};
const api = async (p, opts = {}) => {
  const r = await fetch(p, Object.assign({ cache: 'no-store', headers: opts.body ? { 'Content-Type': 'application/json' } : {} }, opts));
  if (!r.ok) { let msg = 'HTTP ' + r.status; try { const j = await r.json(); if (j.error) msg = j.error; } catch { /* */ } throw new Error(msg); }
  return r.headers.get('content-type')?.includes('json') ? r.json() : r.text();
};
const post = (p, body) => api(p, { method: 'POST', body: JSON.stringify(body) });
function badge(level, text) {
  const ic = { good: ICON.good, warning: ICON.warning, serious: ICON.serious, critical: ICON.critical }[level] || ICON.info;
  return h('span', { class: 'badge ' + level }, h('span', { html: ic, style: 'display:inline-flex' }), text);
}
function msLevel(v, ok, warn) { return v === null || v === undefined ? 'critical' : v <= ok ? 'good' : v <= warn ? 'warning' : 'serious'; }

// ------------------------------------------------------------------ tema
(function theme() {
  const saved = (() => { try { return localStorage.getItem('wm-theme'); } catch { return null; } })();
  const prefersLight = window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches;
  const t = saved || (prefersLight ? 'light' : 'dark');
  document.documentElement.dataset.theme = t;
  $('#btnTheme').addEventListener('click', () => {
    const n = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = n;
    try { localStorage.setItem('wm-theme', n); } catch { /* */ }
    $('meta[name=theme-color]').setAttribute('content', n === 'light' ? '#f4f4f1' : '#0d0d0d');
    drawLatency();
  });
})();

// --------------------------------------------------------------- pestañas
function showTab(name) {
  $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  $$('.tab').forEach((t) => t.classList.toggle('on', t.id === 'tab-' + name));
  if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
  if (name === 'resumen') { requestAnimationFrame(drawLatency); if (S) renderHouseMini(); }
  if (name === 'casa' && window.Plan && S) requestAnimationFrame(() => window.Plan.refresh());
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}
addEventListener('hashchange', () => { const n = location.hash.slice(1); if ($('#tab-' + n)) showTab(n); });
$('#tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) showTab(b.dataset.tab); });
document.addEventListener('click', (e) => { const g = e.target.closest('[data-goto]'); if (g) showTab(g.dataset.goto); });

// --------------------------------------------------------------- carga
async function load() {
  S = await api('/api/state');
  hist = await api('/api/history?min=' + rangeMin);
  $('#demoTag').hidden = !S.demo;
  renderAll();
}

function renderAll() {
  renderHealth(); renderTiles(); drawLatency(); renderAdvice(); renderEvents(); renderWho(); renderHouseMini();
  renderSurvey(); renderCasa(); renderDevices(); renderCable(); renderLogs();
  if (window.Plan && $('#tab-casa').classList.contains('on')) window.Plan.refresh();
  if (window.Admin) window.Admin.render();
}

// ------------------------------------------------------------- resumen
function renderHealth() {
  const hl = S.health;
  $('#score').textContent = hl.score;
  const lvl = hl.score >= 90 ? 'good' : hl.score >= 75 ? 'warning' : hl.score >= 50 ? 'serious' : 'critical';
  const fg = $('#ringFg');
  fg.style.strokeDashoffset = String(326.7 * (1 - hl.score / 100));
  fg.style.stroke = `var(--${lvl})`;
  $('#healthLabel').textContent = hl.label;
  const why = $('#healthWhy'); why.replaceChildren();
  if (!hl.why.length) why.append(h('li', { class: 'ok', text: 'Todo responde bien en este momento' }));
  hl.why.slice(0, 4).forEach((w) => why.append(h('li', { text: w })));
  const n = S.summary.net;
  $('#heroNet').textContent = `Módem ${n.gateway || '?'} · esta PC ${n.localIp || '?'} · monitoreando ${fmt.dur(Date.now() - S.summary.startedAt)}`;
}

function tile(k, v, unit, d, level, goto) {
  return h('div', { class: 'tile', 'data-goto': goto || null },
    h('div', { class: 'k' }, level ? h('i', { class: 'dot ' + level }) : null, k),
    h('div', { class: 'v' }, v, unit ? h('small', { text: unit }) : null),
    h('div', { class: 'd', text: d || '' }));
}

function renderTiles() {
  const s = S.summary; const box = $('#tiles'); box.replaceChildren();
  const gwLvl = s.flags.gwDown ? 'critical' : s.gwLoss > 5 ? 'serious' : msLevel(s.gwAvg, 10, 40);
  box.append(tile('Módem', fmt.ms(s.gwAvg), 'ms', s.flags.gwDown ? 'No responde' : `pérdida ${s.gwLoss ?? 0}%`, gwLvl));
  const netLvl = s.flags.netDown ? 'critical' : s.netLoss > 5 ? 'serious' : msLevel(s.netAvg, 40, 90);
  box.append(tile('Internet', fmt.ms(s.netAvg), 'ms', s.flags.netDown ? 'Caído' : `pérdida ${s.netLoss ?? 0}%`, netLvl));
  const d = s.dns;
  if (d) {
    const bad = d.systemHijack || (d.fails && d.fails.sistema);
    const lvl = bad ? 'critical' : d.modemHijack ? 'warning' : msLevel(d.avg.sistema, 40, 150);
    box.append(tile('DNS', fmt.ms(d.avg.sistema), 'ms', d.systemHijack ? 'Respuestas falsas' : d.modemHijack ? 'El del módem falla; esta PC no' : 'resolución de nombres', lvl, 'mejoras'));
  } else box.append(tile('DNS', '—', '', 'midiendo…'));
  box.append(tile('Dispositivos', String(s.devicesOnline), `de ${s.devicesTotal}`, s.lastSweep ? 'barrido ' + fmt.ago(s.lastSweep) : 'buscando…', null, 'equipos'));
  const c = s.cable;
  if (c && c.available) {
    const lvl = c.verdict === 'bad' ? 'critical' : c.verdict === 'warn' ? 'warning' : 'good';
    box.append(tile('Línea de cable', c.verdict === 'good' ? 'Sana' : c.verdict === 'warn' ? 'Al límite' : 'Mal', '', `SNR ${c.summary.snrMin} dB · ${c.summary.downChannels} canales`, lvl, 'linea'));
  } else box.append(tile('Línea de cable', '—', '', 'no disponible', null, 'linea'));
  const run = (S.speedRuns || []).filter((r) => !r.error).slice(-1)[0];
  box.append(tile('Internet (PC)', run ? fmt.mbps(run.down) : '—', run ? 'Mbps' : '', run ? `↑ ${fmt.mbps(run.up)} Mbps · ${fmt.ago(run.t)}` : 'toca para medir', null, 'probar'));
}

// ------------------------------------------------------ casa en el resumen
let miniLoading = null;
async function renderHouseMini() {
  const el = $('#houseMini');
  const plan = S.settings.plan;
  if (!plan || !plan.rooms || !plan.rooms.length) {
    el.replaceChildren(h('div', { class: 'empty' }, 'Dibuja tu casa en la pestaña ', h('button', { class: 'link', 'data-goto': 'casa', text: 'Casa' }), ' y aquí la verás girando.'));
    return;
  }
  if (!window.Plan) return;
  if (!window.House3DMini) {
    if (!miniLoading) miniLoading = import('/house3d.js?mini').catch((e) => { el.replaceChildren(h('div', { class: 'empty', text: 'No se pudo cargar el 3D: ' + e.message })); });
    await miniLoading;
  }
  if (window.House3DMini && $('#tab-resumen').classList.contains('on')) window.House3DMini.show(el);
}

function renderWho() {
  const devs = S.devices.filter((d) => d.online && !['self', 'modem', 'router'].includes(d.kind) && d.ip !== S.summary.net.gateway);
  const unk = devs.filter((d) => !d.trusted && d.kind !== 'router');
  const byAp = new Map();
  for (const d of devs) {
    const k = d.client ? `${apLabel(d.client.ap)} · ${d.client.band} GHz` : 'Sin dato de router';
    if (!byAp.has(k)) byAp.set(k, []);
    byAp.get(k).push(d);
  }
  const box = $('#whoBox');
  box.replaceChildren(
    h('div', { class: 'who-top' },
      h('div', {}, h('b', { text: String(devs.length) }), h('span', { text: 'conectados' })),
      h('div', { class: unk.length ? 'warn' : '' }, h('b', { text: String(unk.length) }), h('span', { text: 'sin reconocer' }))),
    ...[...byAp.entries()].sort((a, b) => b[1].length - a[1].length).map(([k, list]) => h('div', { class: 'who-ap' },
      h('div', { class: 'who-h', text: `${k} (${list.length})` }),
      h('div', { class: 'who-list' }, ...list.slice(0, 12).map((d) => h('span', { class: 'who-chip' + (d.trusted ? '' : ' unk'), title: d.client && d.client.rssi !== null ? `${d.client.rssi} dBm · ${closeness(d.client.rssi)}` : d.ip, text: d.name }))))),
    unk.length ? h('p', { class: 'hint', text: 'Toca un dispositivo en la pestaña Dispositivos y marca "Es mío" si lo reconoces.' }) : null);
}

// ------------------------------------------------------- gráfica latencia
function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

function drawLatency() {
  const box = $('#latChart');
  if (!box || !box.offsetParent) return;
  box.replaceChildren();
  const W = box.clientWidth, H = box.clientHeight;
  let data = hist;
  if (data.length < 2) { box.append(h('div', { class: 'empty', text: 'Juntando datos…' })); return; }
  const pad = { l: 34, r: 66, t: 22, b: 24 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  // Una muestra cada ~2 px como máximo; un corte en el grupo se conserva como corte.
  const maxPts = Math.max(40, Math.floor(iw / 2));
  if (data.length > maxPts) {
    const step = data.length / maxPts, out = [];
    for (let i = 0; i < maxPts; i++) {
      const seg = data.slice(Math.floor(i * step), Math.floor((i + 1) * step));
      if (!seg.length) continue;
      const agg = (k) => (seg.some((x) => x[k] === null) ? null : seg.reduce((a, x) => a + x[k], 0) / seg.length);
      out.push({ t: seg[seg.length - 1].t, gw: agg('gw'), net: agg('net') });
    }
    data = out;
  }
  const t0 = data[0].t, t1 = data[data.length - 1].t;
  const vals = data.flatMap((d) => [d.gw, d.net]).filter((v) => v !== null);
  const sorted = [...vals].sort((a, b) => a - b);
  const p98 = sorted[Math.floor(sorted.length * 0.98)] || 10;
  const niceMax = (v) => { const steps = [5, 10, 20, 25, 50, 100, 150, 200, 300, 500, 1000]; return steps.find((x) => x >= v) || Math.ceil(v / 500) * 500; };
  const ymax = niceMax(Math.max(10, p98 * 1.15));
  const x = (t) => pad.l + ((t - t0) / Math.max(1, t1 - t0)) * iw;
  const y = (v) => pad.t + ih - (Math.min(v, ymax) / ymax) * ih;
  const svg = h('svg:svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Latencia al módem y a internet' });

  for (let i = 0; i <= 4; i++) {
    const v = (ymax / 4) * i, yy = y(v);
    svg.append(h('svg:line', { class: 'gridl', x1: pad.l, x2: pad.l + iw, y1: yy, y2: yy }));
    svg.append(h('svg:text', { class: 'axis-t', x: pad.l - 6, y: yy + 3.5, 'text-anchor': 'end', text: Math.round(v) }));
  }
  svg.append(h('svg:text', { class: 'axis-t', x: pad.l - 6, y: pad.t - 10, 'text-anchor': 'end', text: 'ms' }));
  const ticks = Math.max(2, Math.min(6, Math.floor(iw / 80)));
  for (let i = 0; i <= ticks; i++) {
    const t = t0 + ((t1 - t0) / ticks) * i;
    svg.append(h('svg:text', { class: 'axis-t', x: x(t), y: H - 6, 'text-anchor': i === 0 ? 'start' : i === ticks ? 'end' : 'middle', text: fmt.time(t) }));
  }
  // franjas de corte
  const step = (t1 - t0) / Math.max(1, data.length - 1);
  let run = null;
  data.forEach((d, i) => {
    const out = d.gw === null || d.net === null;
    if (out && run === null) run = i;
    if ((!out || i === data.length - 1) && run !== null) {
      const end = out ? i : i - 1;
      svg.append(h('svg:rect', { class: 'outage', x: x(data[run].t) - Math.max(1.5, (step / (t1 - t0)) * iw / 2), y: pad.t, width: Math.max(3, x(data[end].t) - x(data[run].t) + (step / (t1 - t0)) * iw), height: ih }));
      run = null;
    }
  });
  const line = (k) => {
    let dstr = '', pen = false;
    for (const p of data) {
      if (p[k] === null) { pen = false; continue; }
      dstr += (pen ? 'L' : 'M') + x(p.t).toFixed(1) + ' ' + y(p[k]).toFixed(1);
      pen = true;
    }
    return dstr;
  };
  svg.append(h('svg:path', { class: 'series', d: line('net'), stroke: cssVar('--s2') }));
  svg.append(h('svg:path', { class: 'series', d: line('gw'), stroke: cssVar('--s1') }));
  // etiquetas directas al final
  const lastOf = (k) => [...data].reverse().find((p) => p[k] !== null);
  const lg = lastOf('gw'), ln = lastOf('net');
  const labels = [];
  if (ln) labels.push({ y: y(ln.net), t: 'Internet', c: '--s2' });
  if (lg) labels.push({ y: y(lg.gw), t: 'Módem', c: '--s1' });
  labels.sort((a, b) => a.y - b.y);
  if (labels.length === 2 && labels[1].y - labels[0].y < 14) labels[1].y = labels[0].y + 14;
  for (const l of labels) {
    svg.append(h('svg:circle', { cx: pad.l + iw + 8, cy: l.y, r: 3, fill: cssVar(l.c) }));
    svg.append(h('svg:text', { class: 'endlbl', x: pad.l + iw + 14, y: l.y + 4, text: l.t }));
  }

  // capa de interacción: cruz que sigue al puntero
  const cross = h('svg:line', { class: 'cross', y1: pad.t, y2: pad.t + ih, x1: -10, x2: -10, visibility: 'hidden' });
  const pg = h('svg:circle', { class: 'pt', r: 4.5, cx: -10, cy: -10, fill: cssVar('--s1'), visibility: 'hidden' });
  const pn = h('svg:circle', { class: 'pt', r: 4.5, cx: -10, cy: -10, fill: cssVar('--s2'), visibility: 'hidden' });
  const hit = h('svg:rect', { x: pad.l, y: 0, width: iw, height: H, fill: 'transparent', tabindex: 0, 'aria-label': 'Explorar valores' });
  svg.append(cross, pn, pg, hit);
  const tip = $('#tip');
  const showAt = (i, clientX, clientY) => {
    const p = data[i]; const xx = x(p.t);
    cross.setAttribute('x1', xx); cross.setAttribute('x2', xx); cross.setAttribute('visibility', 'visible');
    pg.setAttribute('visibility', p.gw === null ? 'hidden' : 'visible'); pn.setAttribute('visibility', p.net === null ? 'hidden' : 'visible'); pg.setAttribute('cx', p.gw === null ? -10 : xx); pg.setAttribute('cy', p.gw === null ? -10 : y(p.gw));
    pn.setAttribute('cx', p.net === null ? -10 : xx); pn.setAttribute('cy', p.net === null ? -10 : y(p.net));
    tip.replaceChildren(
      h('div', { class: 'tt', text: fmt.timeS(p.t) }),
      h('div', { class: 'tr' }, h('i', { style: 'background:var(--s1)' }), h('b', { text: p.gw === null ? 'sin resp.' : fmt.ms(p.gw) + ' ms' }), h('span', { text: 'Módem' })),
      h('div', { class: 'tr' }, h('i', { style: 'background:var(--s2)' }), h('b', { text: p.net === null ? 'sin resp.' : fmt.ms(p.net) + ' ms' }), h('span', { text: 'Internet' })));
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    let lx = clientX + 14; if (lx + r.width > innerWidth - 8) lx = clientX - r.width - 14;
    tip.style.left = lx + 'px'; tip.style.top = Math.max(8, clientY - r.height - 10) + 'px';
  };
  const nearest = (clientX) => {
    const rect = svg.getBoundingClientRect();
    const t = t0 + ((clientX - rect.left - pad.l) / iw) * (t1 - t0);
    let lo = 0, hi = data.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (data[m].t < t) lo = m; else hi = m; }
    return Math.abs(data[lo].t - t) < Math.abs(data[hi].t - t) ? lo : hi;
  };
  hit.addEventListener('pointermove', (e) => showAt(nearest(e.clientX), e.clientX, e.clientY));
  hit.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); pg.setAttribute('visibility', 'hidden'); pn.setAttribute('visibility', 'hidden'); });
  let kIdx = data.length - 1;
  hit.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    kIdx = Math.max(0, Math.min(data.length - 1, kIdx + (e.key === 'ArrowRight' ? 1 : -1)));
    const r = svg.getBoundingClientRect();
    showAt(kIdx, r.left + x(data[kIdx].t), r.top + pad.t + 20);
  });
  hit.addEventListener('blur', () => { tip.hidden = true; });
  box.append(svg);
}
$('#range').addEventListener('click', async (e) => {
  const b = e.target.closest('button'); if (!b) return;
  $$('#range button').forEach((x) => x.classList.toggle('on', x === b));
  rangeMin = +b.dataset.min;
  hist = await api('/api/history?min=' + rangeMin);
  drawLatency();
});
let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(drawLatency, 120); });

// ----------------------------------------------------------- recomendaciones
function advCard(a, compact) {
  const steps = (a.steps || []).map((s) => {
    const isCmd = /^(netsh|ipconfig|ping|nslookup|tracert|wifimonitor)\b/i.test(s);
    if (!isCmd) return h('li', { text: s });
    return h('li', { class: 'cmd' }, h('div', { class: 'cmd-box' }, h('code', { text: s }),
      h('button', { type: 'button', text: 'Copiar', onclick: (e) => { navigator.clipboard?.writeText(s); e.target.textContent = 'Copiado'; setTimeout(() => { e.target.textContent = 'Copiar'; }, 1500); } })));
  });
  return h('div', { class: 'adv' },
    h('div', { class: 'adv-h' },
      h('div', { class: 'adv-ic ' + a.level, html: ICON[a.level] || ICON.tip }),
      h('div', {}, h('div', { class: 'adv-lvl', text: LEVEL_TXT[a.level] }), h('div', { class: 'adv-t', text: a.title }), h('div', { class: 'adv-why', text: a.why || '' }))),
    !compact && steps.length ? h('ol', {}, steps) : null,
    a.action === 'fix-firewall' ? fixButton() : null);
}

function fixButton() {
  if (!S.local) return h('p', { class: 'hint', text: 'Para arreglarlo, abre este panel en la PC (http://localhost:' + S.port + ') y toca "Arreglar ahora".' });
  const b = h('button', { class: 'btn primary', type: 'button', text: 'Arreglar ahora', style: 'margin-top:10px' });
  b.addEventListener('click', async (e) => {
    e.stopPropagation();
    b.disabled = true; b.textContent = 'Acepta el permiso de Windows…';
    try {
      const r = await post('/api/fix-firewall', {});
      b.textContent = r.ok ? 'Listo ✓ — recarga en el celular' : (r.error || 'No quedó; revisa los pasos');
    } catch (err) { b.textContent = 'Error: ' + err.message; }
    setTimeout(load, 1500);
  });
  return b;
}

function renderAdvice() {
  const all = S.advice.filter((a) => !a.security);
  const urgent = all.filter((a) => a.level === 'critical' || a.level === 'serious').length;
  $('#advCount').textContent = urgent ? String(urgent) : '';
  $('#advTop').replaceChildren(...all.filter((a) => a.level !== 'good').slice(0, 3).map((a) => advCard(a, true)));
  $('#advAll').replaceChildren(...all.map((a) => advCard(a, false)));
  const checks = [
    ['wps', 'WPS apagado', 'En el módem y en el repetidor.'],
    ['wpa2', 'WPA2-AES o WPA3', 'Nada de WEP ni TKIP.'],
    ['adminpass', 'Contraseña de administrador cambiada', 'No la de la etiqueta.'],
    ['guest', 'Red de invitados', 'Para visitas y aparatos inteligentes.'],
    ['firmware', 'Firmware actualizado', 'Del repetidor y routers propios.'],
  ];
  $('#checklist').replaceChildren(...checks.map(([id, t, d]) => {
    const done = !!S.settings.checklist[id];
    const cb = h('input', { type: 'checkbox', checked: done || null, onchange: async (e) => { await post('/api/checklist', { id, done: e.target.checked }); await load(); } });
    return h('label', { class: 'chk' + (done ? ' done' : '') }, cb, h('div', {}, h('b', { text: t }), h('span', { text: d })));
  }));
}

// ------------------------------------------------------------- eventos
function evItem(e, compact) {
  const ic = e.level === 2 ? ICON.critical : e.level === 1 ? ICON.warning : ICON.info;
  const today = new Date(e.t).toDateString() === new Date().toDateString();
  const when = today || compact ? fmt.time(e.t) : new Date(e.t).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) + ' ' + fmt.time(e.t);
  return h('li', { class: 'l' + e.level }, h('time', { text: when }), h('span', { class: 'ev-ic', html: ic }), h('span', { text: e.text }));
}
function renderEvents() {
  const ev = S.events;
  $('#evTop').replaceChildren(...(ev.length ? ev.slice(0, 6).map((e) => evItem(e, true)) : [h('li', { text: 'Sin eventos todavía.' })]));
  const f = ev.filter((e) => evFilter === 'all' || String(e.level) === evFilter);
  $('#evAll').replaceChildren(...(f.length ? f.map((e) => evItem(e)) : [h('li', { text: 'Nada por aquí.' })]));
}
$('#evFilter').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  $$('#evFilter button').forEach((x) => x.classList.toggle('on', x === b)); evFilter = b.dataset.l; renderEvents();
});
function renderLogs() {
  $('#logList').replaceChildren(...(S.logs.length ? S.logs.map((l) => h('li', {}, h('a', { href: '/api/logs/' + encodeURIComponent(l.name), text: l.name }), h('span', { text: fmt.bytes(l.size) })))
    : [h('li', { text: 'Aún no hay registros.' })]));
}

// ------------------------------------------------------ prueba de señal
function renderSurvey() {
  const rooms = [...new Set([...S.settings.rooms, ...S.survey.map((s) => s.room)])];
  const nets = [...new Set(S.survey.map((s) => s.network).filter(Boolean))];
  $('#roomList').replaceChildren(...rooms.map((r) => h('option', { value: r })));
  $('#netList').replaceChildren(...nets.map((r) => h('option', { value: r })));
  const cur = $('#room').value;
  $('#roomChips').replaceChildren(...rooms.map((r) => h('button', { type: 'button', class: 'chip' + (r === cur ? ' on' : ''), text: r, onclick: () => { $('#room').value = r; renderSurvey(); } })));
  const tb = $('#surveyTbl tbody');
  const rows = [...S.survey].reverse().slice(0, 25);
  tb.replaceChildren(...(rows.length ? rows.map((s) => h('tr', {},
    h('td', { text: s.room }), h('td', { text: s.network || '—' }),
    h('td', { class: 'num', text: fmt.mbps(s.down) + ' Mbps' }), h('td', { class: 'num', text: fmt.mbps(s.up) }), h('td', { class: 'num', text: fmt.ms(s.ping) + ' ms' }),
    h('td', {}, h('button', { class: 'x', title: 'Borrar prueba', 'aria-label': 'Borrar prueba', text: '✕', onclick: async () => { await api('/api/survey/' + s.id, { method: 'DELETE' }); await load(); } }))))
    : [h('tr', {}, h('td', { colspan: 6, class: 'empty', text: 'Aún no hay pruebas. Haz la primera desde el celular.' }))]));
  const you = S.devices.find((d) => d.ip === S.you);
  $('#youHint').textContent = `Estás viendo esto desde ${S.you || '?'}${you ? ' (' + you.name + ')' : ''}. ${S.you === '127.0.0.1' || S.you === '::1' ? 'Desde esta PC la prueba no mide WiFi: hazla desde el celular.' : ''}`;
  const run = (S.speedRuns || []).slice(-1)[0];
  if (run && !$('#btnInet').disabled) showInet(run);
}
try { $('#room').value = localStorage.getItem('wm-room') || ''; $('#network').value = localStorage.getItem('wm-net') || ''; } catch { /* */ }
$('#room').addEventListener('input', () => { try { localStorage.setItem('wm-room', $('#room').value); } catch { /* */ } renderSurvey(); });
$('#network').addEventListener('input', () => { try { localStorage.setItem('wm-net', $('#network').value); } catch { /* */ } });

function gauge(v, max, unit, phase) {
  const frac = Math.max(0, Math.min(1, Math.log10(1 + v) / Math.log10(1 + max)));
  $('#gArc').style.strokeDashoffset = String(251.3 * (1 - frac));
  $('#gVal').textContent = unit === 'ms' ? fmt.ms(v) : fmt.mbps(v);
  $('#gUnit').textContent = unit;
  $('#gPhase').textContent = phase;
}

async function runTest() {
  const room = $('#room').value.trim();
  if (!room) { $('#room').focus(); $('#room').placeholder = 'Escribe el cuarto primero'; return; }
  const btn = $('#btnTest'); btn.disabled = true; btn.textContent = 'Midiendo…';
  const res = $('#results'); res.replaceChildren();
  try {
    // 1) latencia y variación
    const pings = []; let lost = 0;
    for (let i = 0; i < 20; i++) {
      const t0 = performance.now();
      try {
        const c = new AbortController(); const to = setTimeout(() => c.abort(), 1500);
        await fetch('/api/ping?' + Math.random(), { cache: 'no-store', signal: c.signal }); clearTimeout(to);
        pings.push(performance.now() - t0);
      } catch { lost++; }
      gauge(pings[pings.length - 1] || 0, 300, 'ms', `Latencia ${i + 1}/20`);
      await new Promise((r) => setTimeout(r, 60));
    }
    const ping = pings.length ? Math.min(...pings) : null;
    const jitter = pings.length > 1 ? pings.slice(1).reduce((s, v, i) => s + Math.abs(v - pings[i]), 0) / (pings.length - 1) : null;
    // 2) bajada
    const down = await measure('down');
    // 3) subida
    const up = await measure('up');
    gauge(down, 1000, 'Mbps', 'Listo');
    const entry = await post('/api/survey', { room, network: $('#network').value.trim(), device: deviceName(), down, up, ping, jitter, loss: (lost / 20) * 100 });
    res.append(
      tile('Bajada', fmt.mbps(entry.down), 'Mbps', '', null),
      tile('Subida', fmt.mbps(entry.up), 'Mbps', '', null),
      tile('Latencia', fmt.ms(entry.ping), 'ms', '', msLevel(entry.ping, 10, 30)),
      tile('Variación', fmt.ms(entry.jitter), 'ms', '', msLevel(entry.jitter, 5, 20)));
    await load();
  } catch (e) {
    $('#gPhase').textContent = 'Falló: ' + e.message;
  } finally { btn.disabled = false; btn.textContent = 'Probar otra vez'; }
}

function deviceName() {
  const ua = navigator.userAgent;
  const m = ua.match(/\(([^)]+)\)/); const p = m ? m[1].split(';').map((x) => x.trim()) : [];
  if (/Android/.test(ua)) return (p.find((x) => !/Android|Linux|wv|U$|^K$/.test(x)) || 'Android').slice(0, 40);
  if (/iPhone|iPad/.test(ua)) return /iPad/.test(ua) ? 'iPad' : 'iPhone';
  if (/Windows/.test(ua)) return 'PC Windows';
  return 'Navegador';
}

/** Mide bajada o subida durante ~6 s con 3 conexiones en paralelo. */
async function measure(dir) {
  const DUR = 6000; const t0 = performance.now(); let bytes = 0; let stop = false;
  const label = dir === 'down' ? 'Bajada' : 'Subida';
  const timer = setInterval(() => {
    const secs = (performance.now() - t0) / 1000;
    if (secs > 0.3) gauge((bytes * 8) / secs / 1e6, 1000, 'Mbps', `${label}…`);
  }, 150);
  const blob = dir === 'up' ? new Blob([new Uint8Array(2 << 20).map(() => Math.random() * 256)]) : null;
  const worker = async () => {
    while (!stop) {
      if (dir === 'down') {
        const ctrl = new AbortController();
        const r = await fetch('/api/speed/down?bytes=50000000&r=' + Math.random(), { cache: 'no-store', signal: ctrl.signal });
        const reader = r.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.length;
          if (performance.now() - t0 > DUR) { stop = true; ctrl.abort(); break; }
        }
      } else {
        await new Promise((resolve) => {
          // XHR permite contar lo subido mientras sube
          const x = new XMLHttpRequest(); let last = 0;
          x.upload.onprogress = (e) => { bytes += e.loaded - last; last = e.loaded; if (performance.now() - t0 > DUR) { stop = true; x.abort(); } };
          x.onloadend = () => resolve();
          x.open('POST', '/api/speed/up'); x.send(blob);
        });
      }
      if (performance.now() - t0 > DUR) stop = true;
    }
  };
  await Promise.all([worker(), worker(), worker()].map((p) => p.catch(() => {})));
  clearInterval(timer);
  const secs = (performance.now() - t0) / 1000;
  return Math.round(((bytes * 8) / secs / 1e6) * 10) / 10;
}
$('#btnTest').addEventListener('click', runTest);

function showInet(r) {
  const box = $('#inetRes');
  if (r.error) { box.textContent = 'No se pudo medir: ' + r.error; return; }
  box.replaceChildren(h('b', { text: fmt.mbps(r.down) }), ' Mbps bajada · ', h('b', { text: fmt.mbps(r.up) }), ' Mbps subida · ', String(r.ping), ' ms · ', fmt.ago(r.t));
}
$('#btnInet').addEventListener('click', async () => {
  const b = $('#btnInet'); b.disabled = true; b.textContent = 'Midiendo (≈20 s)…';
  try { showInet(await post('/api/internet-test', {})); await load(); } catch (e) { $('#inetRes').textContent = 'Error: ' + e.message; }
  b.disabled = false; b.textContent = 'Medir otra vez';
});

// ------------------------------------------------------------------ casa
function renderCasa() {
  const rooms = S.rooms;
  const gw = S.summary.net.gateway;
  const routers = S.devices.filter((d) => d.kind === 'modem' || d.kind === 'router' || d.ip === gw);
  if (!routers.find((d) => d.ip === gw) && gw) routers.unshift({ ip: gw, name: 'Módem principal', kind: 'modem', vendor: '', online: true });

  // ¿dónde está cada router?
  const roomNames = [...new Set([...S.settings.rooms, ...rooms.map((r) => r.room)])];
  $('#places').replaceChildren(...routers.map((d) => {
    const sel = h('select', { 'aria-label': 'Cuarto de ' + d.name, onchange: async (e) => { await post('/api/place', { ip: d.ip, room: e.target.value }); await load(); } },
      h('option', { value: '', text: '¿En qué cuarto?' }), ...roomNames.map((r) => h('option', { value: r, text: r, selected: S.settings.places[d.ip] === r || null })));
    return h('div', { class: 'place' },
      h('div', { class: 'dev-ic', html: ICON[d.ip === gw ? 'modem' : 'router'] }),
      h('div', { class: 'pn' }, h('b', { text: d.name }), h('span', { text: `${d.ip}${d.vendor ? ' · ' + d.vendor : ''}${d.ip === gw ? ' · da el internet' : ''}` })),
      sel);
  }));

  // barras por cuarto
  const tested = rooms.filter((r) => r.down !== null);
  const max = Math.max(1, ...tested.map((r) => r.down));
  const placeOf = (room) => Object.entries(S.settings.places).filter(([, r]) => r === room).map(([ip]) => (S.devices.find((d) => d.ip === ip) || { name: ip === gw ? 'Módem' : ip }).name);
  $('#roomBars').replaceChildren(...(rooms.length ? rooms.map((r) => {
    const here = placeOf(r.room);
    const lvl = r.score === null ? null : r.score >= 70 ? 'good' : r.score >= 45 ? 'warning' : 'serious';
    return h('div', { class: 'rb', title: r.down === null ? 'Sin pruebas' : `${r.tests} pruebas` },
      h('div', { class: 'rn' }, h('b', {}, r.room, ...here.map((n) => h('span', { class: 'tag', text: n }))), h('span', { text: r.down === null ? 'sin pruebas' : (r.byNet[0] ? 'mejor red: ' + r.byNet[0].network : r.tests + ' pruebas') })),
      h('div', { class: 'track' }, h('div', { class: 'fill', style: `width:${r.down === null ? 0 : Math.max(2, (r.down / max) * 100)}%` })),
      h('div', { class: 'rv' }, r.down === null ? '—' : h('span', {}, h('b', { text: fmt.mbps(r.down) }), ' Mbps · ', fmt.ms(r.ping), ' ms '), lvl ? badge(lvl, lvl === 'good' ? 'Buena' : lvl === 'warning' ? 'Regular' : 'Débil') : null));
  }) : [h('div', { class: 'empty', text: 'Haz pruebas desde el celular en la pestaña "Probar señal".' })]));

  // conclusión
  const ins = $('#roomInsight'); ins.replaceChildren();
  if (tested.length >= 2) {
    const best = tested[0], worst = tested[tested.length - 1];
    const modemRoom = S.settings.places[gw];
    ins.append('La mejor señal está en ', h('b', { text: best.room }), ` (${fmt.mbps(best.down)} Mbps)`,
      modemRoom ? (best.room === modemRoom ? ', donde está el módem.' : `; el módem está en ${modemRoom}, así que ahí probablemente llega el repetidor.`) : ': ahí o muy cerca debe estar el punto de acceso al que te conectaste.',
      ' La más débil: ', h('b', { text: worst.room }), ` (${fmt.mbps(worst.down)} Mbps).`,
      worst.down < best.down * 0.35 ? ' Si quieres mejorarla, pon un repetidor cableado a medio camino o en ese cuarto.' : '');
  }
  drawTopology(routers, gw);
}

function drawTopology(routers, gw) {
  const box = $('#topo'); box.replaceChildren();
  const devs = S.devices;
  const W = 560, rowH = 92;
  const modem = routers.find((d) => d.ip === gw) || { name: 'Módem', ip: gw };
  const aps = routers.filter((d) => d.ip !== gw);
  const self = devs.find((d) => d.kind === 'self');
  const others = devs.filter((d) => d.online && d.kind !== 'self' && d.kind !== 'modem' && d.kind !== 'router');
  const H = 40 + rowH * 3;
  const svg = h('svg:svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Diagrama de la red de la casa' });
  const node = (x, y, w, title, sub, icon, hl) => {
    const g = h('svg:g', { class: 'node' + (hl ? ' hl' : ''), transform: `translate(${x - w / 2},${y - 26})` });
    g.append(h('svg:rect', { width: w, height: 52, rx: 12 }));
    const ic = h('svg:g', { class: 'ic', transform: 'translate(10,14) scale(1)' }); ic.innerHTML = (ICON[icon] || ICON.unknown).replace(/<\/?svg[^>]*>/g, '');
    g.append(ic, h('svg:text', { x: 42, y: 23, text: title }), h('svg:text', { class: 's', x: 42, y: 39, text: sub }));
    svg.append(g);
  };
  const edge = (x1, y1, x2, y2, wifi, lbl) => {
    const my = (y1 + y2) / 2;
    svg.append(h('svg:path', { class: 'edge' + (wifi ? ' wifi' : ''), d: `M${x1} ${y1} C${x1} ${my} ${x2} ${my} ${x2} ${y2}` }));
    if (lbl) svg.append(h('svg:text', { class: 'elbl', x: (x1 + x2) / 2 + 6, y: my + 3, text: lbl }));
  };
  const y0 = 46, y1 = y0 + rowH, y2 = y1 + rowH;
  edge(W / 2, y0 + 26, W / 2, y1 - 26, false, 'coaxial / fibra');
  node(W / 2, y0, 190, 'Internet', S.summary.netAvg !== null ? `${fmt.ms(S.summary.netAvg)} ms` : '', 'globe');
  const place = (ip) => S.settings.places[ip] ? ' · ' + S.settings.places[ip] : '';
  node(W / 2, y1, 220, modem.name || 'Módem', `${gw || ''}${place(gw)}`, 'modem', true);
  const children = [];
  if (self) children.push({ t: 'Esta PC', s: self.ip + ' · cable', ic: 'self', wifi: false });
  for (const a of aps) children.push({ t: a.name, s: a.ip + place(a.ip), ic: 'router', wifi: false, lbl: 'cable' });
  children.push({ t: `${others.length} por WiFi`, s: 'celulares, TV…', ic: 'phone', wifi: true });
  const n = children.length; const slot = W / n; const cw = Math.min(200, slot - 12);
  const maxChars = Math.max(8, Math.floor((cw - 50) / 7.2));
  const cut = (t, k) => (t.length > k ? t.slice(0, k - 1) + '…' : t);
  children.forEach((c, i) => {
    const x = slot * (i + 0.5);
    edge(W / 2, y1 + 26, x, y2 - 26, c.wifi, n <= 3 ? (c.lbl || '') : '');
    node(x, y2, cw, cut(c.t, maxChars), cut(c.s, Math.floor(maxChars * 1.2)), c.ic);
  });
  box.append(svg);
}
$('#btnAddRoom').addEventListener('click', async () => {
  const v = $('#newRoom').value.trim(); if (!v) return;
  await post('/api/rooms', { add: v }); $('#newRoom').value = ''; await load();
});

// ----------------------------------------------------------- dispositivos
function renderDevices() {
  const list = S.devices.filter((d) => devFilter === 'all' || (devFilter === 'on' ? d.online : devFilter === 'unk' ? !d.trusted : !d.online));
  const on = S.devices.filter((d) => d.online).length;
  $('#devSub').textContent = `${on} en línea de ${S.devices.length} vistos${S.summary.lastSweep ? ' · último barrido ' + fmt.ago(S.summary.lastSweep) : ''}`;
  $('#devList').replaceChildren(...(list.length ? list.map((d) => {
    const st = d.online ? (d.ms === null ? 'warning' : 'good') : 'critical';
    const since = d.online ? 'conectado ' + fmt.dur(Date.now() - (d.lastChange || d.firstSeen)) : 'fuera ' + fmt.dur(Date.now() - d.lastChange);
    return h('button', { type: 'button', class: 'dev' + (d.online ? '' : ' off'), onclick: () => rename(d) },
      h('div', { class: 'dev-ic' }, h('span', { html: ICON[d.kind] || ICON.unknown, style: 'display:grid' }), h('i', { class: 'dot ' + st })),
      h('div', { class: 'dev-m' }, h('b', {}, d.trusted ? null : h('span', { class: 'unk-tag', text: '¿Es tuyo?' }), d.name),
        h('span', { text: [KIND_TXT[d.kind] || '', d.vendor].filter(Boolean).join(' · ') || '—' }),
        d.client ? h('span', { class: 'cl-line', text: clientLine(d.client, d.mac) }) : null,
        h('span', { class: 'mono', text: `${d.ip}${d.mac ? ' · ' + d.mac : ''}` })),
      h('div', { class: 'dev-r' }, h('b', { text: d.online ? (d.ms === null ? 'en ARP' : fmt.ms(d.ms) + ' ms') : 'desconectado' }), h('span', { text: since }), d.drops ? h('div', { text: `${d.drops} caída${d.drops === 1 ? '' : 's'}` }) : null));
  }) : [h('div', { class: 'empty', text: S.summary.lastSweep ? 'Nada con este filtro.' : 'Buscando dispositivos (tarda ~1 min)…' })]));
}
$('#devFilter').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  $$('#devFilter button').forEach((x) => x.classList.toggle('on', x === b)); devFilter = b.dataset.f; renderDevices();
});

function apLabel(ip) { const r = S.devices.find((x) => x.ip === ip); return r ? r.name : ip; }
function closeness(rssi) {
  if (rssi === null || rssi === undefined) return '';
  if (rssi <= -95) return 'sin dato de señal';
  if (rssi >= -50) return 'muy cerca';
  if (rssi >= -65) return 'a una pared o cuarto';
  if (rssi >= -80) return 'lejos';
  return 'en el límite (¿afuera?)';
}
function clientLine(c, mac) {
  const zone = mac && window.Plan ? window.Plan.zoneOf(mac) : null;
  return `${apLabel(c.ap)} · ${c.band} GHz${c.rssi !== null && c.rssi !== undefined ? ` · ${c.rssi} dBm · ${closeness(c.rssi)}` : ''}${zone ? ' · ' + zone : ''}`;
}

function rename(d) {
  const dlg = $('#nameDlg');
  $('#nameTitle').textContent = 'Nombre para este dispositivo';
  $('#nameSub').textContent = `${d.ip}${d.mac ? ' · ' + d.mac : ''}${d.vendor ? ' · ' + d.vendor : ''}`;
  $('#nameInput').value = d.alias || d.name;
  $('#trustInput').checked = !!d.trusted;
  $('#trustInput').disabled = !d.mac;
  $('#nameInfo').textContent = d.client ? 'Conectado a ' + clientLine(d.client, d.mac) : 'Pega la lista de clientes del router para ver a qué router está conectado y con cuánta señal.';
  dlg.returnValue = '';
  dlg.onclose = async () => {
    const key = d.mac || d.ip;
    if (dlg.returnValue === 'ok') {
      await post('/api/alias', { key, name: $('#nameInput').value.trim() });
      if (d.mac) await post('/api/trust', { mac: d.mac, trusted: $('#trustInput').checked });
    } else if (dlg.returnValue === 'clear') await post('/api/alias', { key, name: '' });
    else return;
    await load();
  };
  dlg.showModal(); $('#nameInput').select();
}
$('#btnClients').addEventListener('click', () => {
  const gw = S.summary.net.gateway;
  const routers = S.devices.filter((d) => d.kind === 'modem' || d.kind === 'router' || d.ip === gw);
  if (gw && !routers.find((r) => r.ip === gw)) routers.unshift({ ip: gw, name: 'Módem principal' });
  $('#clAp').replaceChildren(...routers.map((r) => h('option', { value: r.ip, text: `${r.name} (${r.ip})` })));
  $('#lkAp').replaceChildren(...routers.map((r) => h('option', { value: r.ip, text: `${r.name} (${r.ip})` })));
  $('#clResult').textContent = '';
  $('#lkResult').textContent = S.local ? '' : 'La conexión automática se configura desde la PC donde corre WiFi Monitor (porque guarda la contraseña del router).';
  $('#lkGo').disabled = !S.local;
  renderLinks();
  $('#clientsDlg').showModal();
});
$('#clMode').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  $$('#clMode button').forEach((x) => x.classList.toggle('on', x === b));
  $('#clAuto').hidden = b.dataset.m !== 'auto'; $('#clPaste').hidden = b.dataset.m === 'auto';
});
function renderLinks() {
  const box = $('#lkList2');
  box.replaceChildren(...(S.links || []).map((l) => h('div', { class: 'link-row' },
    badge(l.status && l.status.ok ? 'good' : l.status && l.status.ok === false ? 'critical' : 'warning', l.status && l.status.ok ? `${l.status.count} aparatos` : l.status && l.status.ok === false ? 'Falla' : 'Pendiente'),
    h('span', { text: `${apLabel(l.ap)} · ${l.band} GHz${l.hasLogin ? '' : ' · sin inicio de sesión'}${l.status && l.status.error ? ' — ' + l.status.error : ''}` }),
    S.local ? h('button', { class: 'x', type: 'button', title: 'Quitar', text: '✕', onclick: async () => { await post('/api/links', { remove: l.id }); await load(); renderLinks(); } }) : null)));
}
$('#lkGo').addEventListener('click', async () => {
  $('#lkResult').textContent = 'Probando…';
  try {
    const r = await post('/api/links', { ap: $('#lkAp').value, band: $('#lkBand').value, login: $('#lkLogin').value.trim(), list: $('#lkList').value.trim() });
    if (r.ok) { $('#lkResult').textContent = `¡Listo! Leí ${r.count} aparatos. Se actualizará solo cada 2 minutos.`; $('#lkList').value = ''; await load(); renderLinks(); }
    else $('#lkResult').textContent = 'No funcionó: ' + (r.error || 'revisa que copiaste las peticiones correctas');
  } catch (e) { $('#lkResult').textContent = 'Error: ' + e.message; }
});
$('#clGo').addEventListener('click', async (e) => {
  e.preventDefault();
  const r = await post('/api/clients', { ap: $('#clAp').value, band: $('#clBand').value, text: $('#clText').value });
  if (!r.count) { $('#clResult').textContent = 'No encontré aparatos en el texto. Copia la tabla completa (con las columnas de IP y MAC).'; return; }
  $('#clResult').textContent = `Listo: ${r.count} aparatos — ` + r.found.map((f) => `${f.name || f.mac} (${f.rssi ?? '?'} dBm)`).join(', ') + '. Puedes pegar otra lista (la de 5 GHz o la del otro router).';
  $('#clText').value = '';
  await load();
});
$('#nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#nameDlg').close('ok'); } });

// ------------------------------------------------------------------ línea
function rangeBar(v, min, max, okLo, okHi) {
  const pct = (x) => ((Math.max(min, Math.min(max, x)) - min) / (max - min)) * 100;
  return h('div', {},
    h('div', { class: 'metric-bar' }, h('div', { class: 'ok', style: `left:${pct(okLo)}%;width:${pct(okHi) - pct(okLo)}%` }), v === null ? null : h('div', { class: 'mk', style: `left:${pct(v)}%` })),
    h('div', { class: 'metric-scale' }, h('span', { text: min }), h('span', { text: `ideal ${okLo} a ${okHi}` }), h('span', { text: max })));
}
function renderCable() {
  const box = $('#cableBox'); box.replaceChildren();
  const c = S.summary.cable;
  if (!c || !c.available) {
    box.append(h('div', { class: 'card' }, h('h2', { text: 'Línea de cable' }),
      h('p', { class: 'sub', text: 'No encontré la página de diagnóstico del módem de cable (http://192.168.100.1). Si tu internet es de cable (Izzi, Megacable, Totalplay cable), aparece sola; con fibra o DSL no aplica.' })));
    return;
  }
  const lvl = c.verdict === 'bad' ? 'critical' : c.verdict === 'warn' ? 'warning' : 'good';
  box.append(h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('div', {}, h('h2', { text: 'Línea de cable (señal que llega del proveedor)' }),
      h('p', { class: 'sub', text: `${c.summary.downChannels} canales de bajada y ${c.summary.upChannels} de subida · actualizado ${fmt.ago(c.t)}` })),
    badge(lvl, c.verdict === 'good' ? 'Sana' : c.verdict === 'warn' ? 'Al límite' : 'Fuera de rango')),
    c.issues.length ? h('ul', { class: 'why' }, ...c.issues.map((i) => h('li', { text: i }))) : h('p', { class: 'sub', text: 'Todos los valores están dentro de lo recomendado.' })));
  const grid = h('div', { class: 'tiles', style: 'grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin-bottom:16px' });
  const m = (k, v, unit, d, lv, bar) => { const t = tile(k, v === null ? '—' : String(v), unit, d, lv); t.append(bar); return t; };
  const sm = c.summary;
  grid.append(
    m('Potencia de bajada', sm.downPowerAvg, 'dBmV', `de ${sm.downPowerMin} a ${sm.downPowerMax}`, sm.downPowerMin < -7 || sm.downPowerMax > 7 ? 'warning' : 'good', rangeBar(sm.downPowerAvg, -15, 15, -7, 7)),
    m('SNR (calidad)', sm.snrMin, 'dB', 'el canal más bajo', sm.snrMin < 33 ? 'warning' : 'good', rangeBar(sm.snrMin, 20, 45, 33, 45)),
    m('Potencia de subida', sm.upPowerMax, 'dBmV', 'el canal más alto', sm.upPowerMax > 50 ? 'warning' : 'good', rangeBar(sm.upPowerMax, 30, 58, 35, 50)),
    m('Errores incorregibles', c.totals.uncorrectables, '', `${c.newUncorrectables} nuevos en el último minuto`, c.newUncorrectables > 50 ? 'warning' : 'good', h('div')));
  box.append(grid);
  const rows = (c.down || []).map((d) => h('tr', {}, h('td', { text: 'Bajada ' + d.ch }), h('td', { class: 'num', text: d.freq + ' MHz' }),
    h('td', { class: 'num', text: d.power + ' dBmV' }), h('td', { class: 'num', text: d.snr + ' dB' }), h('td', { text: d.mod }), h('td', { class: 'num', text: d.corrected }), h('td', { class: 'num', text: d.uncorrectables })));
  const urows = (c.up || []).map((u) => h('tr', {}, h('td', { text: 'Subida ' + u.ch }), h('td', { class: 'num', text: u.freq + ' MHz' }),
    h('td', { class: 'num', text: u.power + ' dBmV' }), h('td', { class: 'num', text: '—' }), h('td', { text: u.mod || u.type }), h('td', { class: 'num', text: '' }), h('td', { class: 'num', text: '' })));
  box.append(h('div', { class: 'card' }, h('h2', { text: 'Canales' }),
    h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, ...['Canal', 'Frecuencia', 'Potencia', 'SNR', 'Modulación', 'Corregidos', 'Incorregibles'].map((t, i) => h('th', { class: i && i !== 4 ? 'num' : null, text: t })))),
      h('tbody', {}, ...rows, ...urows))),
    h('p', { class: 'hint', text: 'Si los valores salen de rango o los incorregibles suben seguido, es un problema del cable o del proveedor: repórtalo con una captura de esta página.' })));
}

// ----------------------------------------------------------- QR celular
$('#btnQr').addEventListener('click', () => {
  const u = (S && S.urls[0]) ? S.urls[0].url : location.origin;
  $('#qrImg').src = '/api/qr.svg?u=' + encodeURIComponent(u);
  $('#qrUrls').replaceChildren(...((S && S.urls.length ? S.urls : [{ url: location.origin }]).map((x) => h('a', { href: x.url, text: x.url }))));
  $('#qrDlg').showModal();
});

// ------------------------------------------------------ tiempo real (SSE)
let refreshTimer = null;
function scheduleRefresh(ms = 400) { clearTimeout(refreshTimer); refreshTimer = setTimeout(load, ms); }
function connect() {
  const es = new EventSource('/api/stream');
  es.onopen = () => $('#live').classList.remove('off');
  es.onerror = () => $('#live').classList.add('off');
  es.addEventListener('tick', (e) => {
    const d = JSON.parse(e.data);
    if (!S) return;
    S.summary = d.summary; S.health = d.health;
    hist.push(d.s);
    const since = Date.now() - rangeMin * 60000;
    while (hist.length && hist[0].t < since) hist.shift();
    renderHealth(); renderTiles();
    if ($('#tab-resumen').classList.contains('on') && !$('#latChart').matches(':hover')) drawLatency();
  });
  es.addEventListener('event', () => scheduleRefresh(300));
  es.addEventListener('refresh', () => scheduleRefresh(500));
}

// ------------------------------------------------------------------ inicio
(async () => {
  const start = (location.hash || '#resumen').slice(1);
  try { await load(); } catch { $('#live').classList.add('off'); }
  if ($('#tab-' + start)) showTab(start);
  // En el celular, si no ha hecho pruebas, empieza en "Probar señal"
  if (!location.hash && matchMedia('(max-width: 640px)').matches && S && !['127.0.0.1', '::1'].includes(S.you) && S.survey.length < 2) showTab('probar');
  connect();
  setInterval(() => { if (S && $('#tab-equipos').classList.contains('on')) renderDevices(); }, 30000);
})();
