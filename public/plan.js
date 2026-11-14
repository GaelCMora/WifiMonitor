'use strict';
/* Plano de la casa: cuartos, ubicación de módem/repetidores, señal estimada y lugar ideal para un repetidor.
   Usa h(), post(), load(), S, ICON, fmt de app.js. */

const Plan = (() => {
  const SNAP = 0.25;                    // metros
  const CELL = 0.25;                    // resolución del mapa de calor
  const WALL_DB = 6;                    // pérdida por pared (aprox. tablaroca/ladrillo ligero)
  const LEVELS = [
    { min: -60, name: 'Excelente', c: [12, 163, 12] },
    { min: -68, name: 'Buena', c: [120, 190, 40] },
    { min: -76, name: 'Regular', c: [250, 178, 25] },
    { min: -84, name: 'Débil', c: [236, 131, 90] },
    { min: -999, name: 'Sin señal', c: [208, 59, 59] },
  ];

  let plan = null;          // { w, h, rooms:[{id,name,x,y,w,h}], pins:{ip:{x,y}}, extra:[{id,name,x,y}] }
  let sel = null;           // id del cuarto seleccionado
  let cur = 0;              // piso que se está editando
  const FLOOR_H = 3;        // metros entre pisos
  const SLAB_DB = 15;       // pérdida al atravesar una losa
  let showHeat = true;
  let suggestion = null;    // {x,y,gain}
  let scale = 40;           // px por metro
  let drag = null;
  let saveT = null;

  const snap = (v) => Math.round(v / SNAP) * SNAP;
  const uid = () => Math.random().toString(36).slice(2, 9);

  function defaults() {
    return { w: 12, h: 9, floors: ['Planta baja'], rooms: [], pins: {}, extra: [] };
  }

  function routers() {
    const gw = S.summary.net.gateway;
    const list = S.devices.filter((d) => d.kind === 'modem' || d.kind === 'router' || d.ip === gw)
      .map((d) => ({ id: d.ip, name: d.name, main: d.ip === gw }));
    if (gw && !list.find((r) => r.id === gw)) list.unshift({ id: gw, name: 'Módem principal', main: true });
    for (const e of plan.extra || []) list.push({ id: e.id, name: e.name, main: false, extra: true });
    return list;
  }

  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(async () => {
      // Si un router quedó dentro de un cuarto, se registra ese cuarto como su ubicación.
      const places = {};
      for (const r of routers()) {
        const p = plan.pins[r.id];
        if (!p || r.extra) continue;
        const room = roomAt(p.x, p.y, p.floor || 0);
        if (room) places[r.id] = room.name + (plan.floors.length > 1 ? ` (${plan.floors[room.floor || 0]})` : '');
      }
      await post('/api/plan', { plan, places });
      if (!$('#house3d').hidden && window.House3D) window.House3D.show($('#house3d'));
    }, 500);
  }

  function roomAt(x, y, f = 0) { return plan.rooms.find((r) => (r.floor || 0) === f && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h); }
  const roomsOf = (f) => plan.rooms.filter((r) => (r.floor || 0) === f);
  function normalize() {
    plan.floors = plan.floors && plan.floors.length ? plan.floors : ['Planta baja'];
    plan.extra = plan.extra || [];
    for (const r of plan.rooms) r.floor = Math.min(plan.floors.length - 1, r.floor || 0);
    for (const p of Object.values(plan.pins)) p.floor = Math.min(plan.floors.length - 1, p.floor || 0);
    cur = Math.min(cur, plan.floors.length - 1);
  }

  // ---------------------------------------------------- modelo de señal
  function segHitsRect(x1, y1, x2, y2, r) {
    // número de bordes del rectángulo que cruza el segmento
    let n = 0;
    const edges = [[r.x, r.y, r.x + r.w, r.y], [r.x + r.w, r.y, r.x + r.w, r.y + r.h], [r.x, r.y + r.h, r.x + r.w, r.y + r.h], [r.x, r.y, r.x, r.y + r.h]];
    for (const [a, b, c, d] of edges) if (segInter(x1, y1, x2, y2, a, b, c, d)) n++;
    return n;
  }
  function segInter(p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y) {
    const s1x = p1x - p0x, s1y = p1y - p0y, s2x = p3x - p2x, s2y = p3y - p2y;
    const den = -s2x * s1y + s1x * s2y;
    if (Math.abs(den) < 1e-9) return false;
    const s = (-s1y * (p0x - p2x) + s1x * (p0y - p2y)) / den;
    const t = (s2x * (p0y - p2y) - s2y * (p0x - p2x)) / den;
    return s > 0.001 && s < 0.999 && t > 0.001 && t < 0.999;
  }
  function walls(x1, y1, x2, y2, f) {
    let total = 0;
    for (const r of roomsOf(f)) total += segHitsRect(x1, y1, x2, y2, r);
    return Math.ceil(total / 2);      // una pared compartida cuenta una sola vez
  }
  function rssiFrom(s, x, y, f) {
    const df = Math.abs((s.floor || 0) - f);
    const d = Math.max(0.5, Math.hypot(s.x - x, s.y - y, df * FLOOR_H));
    // paredes del piso del router y, si es otro piso, también las del piso destino (a la mitad)
    let w = walls(s.x, s.y, x, y, f);
    if (df) w = Math.ceil((w + walls(s.x, s.y, x, y, s.floor || 0)) / 2);
    return -38 - 10 * 2.8 * Math.log10(d) - w * WALL_DB - df * SLAB_DB;
  }
  function bestRssi(x, y, f, sources) {
    let best = -999;
    for (const s of sources) best = Math.max(best, rssiFrom(s, x, y, f));
    return best;
  }
  function levelOf(v) { return LEVELS.find((l) => v >= l.min); }

  function placedSources() {
    return routers().map((r) => plan.pins[r.id] && { ...plan.pins[r.id], id: r.id }).filter(Boolean);
  }

  /** Busca el punto (dentro de los cuartos) donde un repetidor cableado más mejora la peor zona. */
  function suggest() {
    const srcs = placedSources();
    if (!srcs.length || !plan.rooms.length) return null;
    const cells = [];
    for (const r of plan.rooms) for (let x = r.x + 0.25; x < r.x + r.w; x += 0.5) for (let y = r.y + 0.25; y < r.y + r.h; y += 0.5) cells.push([x, y, r.floor || 0]);
    const score = (extra) => {
      let s = 0;
      for (const [x, y, f] of cells) {
        const v = bestRssi(x, y, f, extra ? srcs.concat([extra]) : srcs);
        s += Math.min(-55, v);       // premia subir las zonas malas; no las que ya están bien
      }
      return s / cells.length;
    };
    const base = score(null);
    let best = null;
    for (const r of plan.rooms) {
      for (let x = r.x + 0.5; x < r.x + r.w; x += 0.5) for (let y = r.y + 0.5; y < r.y + r.h; y += 0.5) {
        const sc = score({ x, y, floor: r.floor || 0 });
        if (!best || sc > best.sc) best = { x, y, sc, room: r.name, floor: r.floor || 0 };
      }
    }
    return best ? { x: best.x, y: best.y, floor: best.floor, room: best.room, gain: best.sc - base } : null;
  }

  // ----------------------------------------------------------- dibujo
  function render() {
    const box = $('#plan');
    if (!box || !S) return;
    if (!plan) plan = Object.assign(defaults(), S.settings.plan || {});
    normalize();
    renderFloors();
    box.replaceChildren();
    const W = box.clientWidth || 600;
    scale = Math.max(18, Math.min(70, (W - 2) / plan.w));
    const pw = plan.w * scale, ph = plan.h * scale;

    const wrap = h('div', { class: 'plan-stage', style: `width:${pw}px;height:${ph}px` });
    const canvas = h('canvas', { width: Math.round(pw * devicePixelRatio), height: Math.round(ph * devicePixelRatio), style: `width:${pw}px;height:${ph}px` });
    wrap.append(canvas);
    const svg = h('svg:svg', { viewBox: `0 0 ${pw} ${ph}`, width: pw, height: ph, class: 'plan-svg' });
    // cuadrícula de 1 m
    for (let x = 0; x <= plan.w; x++) svg.append(h('svg:line', { class: 'pg', x1: x * scale, x2: x * scale, y1: 0, y2: ph }));
    for (let y = 0; y <= plan.h; y++) svg.append(h('svg:line', { class: 'pg', y1: y * scale, y2: y * scale, x1: 0, x2: pw }));

    const roomsByName = new Map(S.rooms.map((r) => [r.room, r]));
    // cuartos del piso de abajo como referencia
    if (cur > 0) for (const r of roomsOf(cur - 1)) svg.append(h('svg:rect', { class: 'pr-ghost', x: r.x * scale, y: r.y * scale, width: r.w * scale, height: r.h * scale }));
    for (const r of roomsOf(cur)) {
      const g = h('svg:g', { class: 'proom' + (r.id === sel ? ' sel' : ''), 'data-id': r.id });
      g.append(h('svg:rect', { class: 'pr-body', x: r.x * scale, y: r.y * scale, width: r.w * scale, height: r.h * scale, rx: 3 }));
      g.append(h('svg:text', { class: 'pr-name', x: r.x * scale + 8, y: r.y * scale + 18, text: r.name }));
      const meas = roomsByName.get(r.name);
      if (meas && meas.down !== null) g.append(h('svg:text', { class: 'pr-meas', x: r.x * scale + 8, y: r.y * scale + 34, text: `medido: ${fmt.mbps(meas.down)} Mbps · ${fmt.ms(meas.ping)} ms` }));
      g.append(h('svg:text', { class: 'pr-dim', x: (r.x + r.w) * scale - 6, y: (r.y + r.h) * scale - 6, 'text-anchor': 'end', text: `${r.w}×${r.h} m` }));
      g.append(h('svg:rect', { class: 'pr-handle', 'data-handle': '1', x: (r.x + r.w) * scale - 9, y: (r.y + r.h) * scale - 9, width: 14, height: 14, rx: 3 }));
      svg.append(g);
    }
    if (suggestion && (suggestion.floor || 0) === cur) {
      const sx = suggestion.x * scale, sy = suggestion.y * scale;
      svg.append(h('svg:circle', { class: 'sug-ring', cx: sx, cy: sy, r: 20 }));
      svg.append(h('svg:text', { class: 'sug-txt', x: sx, y: sy - 26, 'text-anchor': 'middle', text: 'Repetidor ideal' }));
    }
    let idx = 0;
    for (const r of routers()) {
      let p = plan.pins[r.id];
      const placed = !!p;
      idx++;
      if (placed && (p.floor || 0) !== cur) continue;   // está en otro piso
      if (!p) p = { x: 0.6 + ((idx - 1) * 1.6) % (plan.w - 1), y: 0.6 };
      const g = h('svg:g', { class: 'ppin' + (r.main ? ' main' : '') + (placed ? '' : ' unplaced'), 'data-pin': r.id, transform: `translate(${p.x * scale},${p.y * scale})` });
      g.append(h('svg:circle', { r: 15 }));
      const ic = h('svg:g', { transform: 'translate(-9,-9) scale(.75)', class: 'pin-ic' }); ic.innerHTML = (r.main ? ICON.modem : ICON.router).replace(/<\/?svg[^>]*>/g, '');
      g.append(ic, h('svg:text', { y: 30, 'text-anchor': 'middle', text: r.name + (placed ? '' : ' (arrástrame)') }));
      svg.append(g);
    }
    wrap.append(svg);
    box.append(wrap);
    if (showHeat) drawHeat(canvas, pw, ph);
    bind(svg);
    renderSide();
  }

  function drawHeat(canvas, pw, ph) {
    const ctx = canvas.getContext('2d');
    ctx.scale(devicePixelRatio, devicePixelRatio);
    const srcs = placedSources();
    if (!srcs.length || !plan.rooms.length) return;
    const cs = CELL * scale;
    for (const r of roomsOf(cur)) {
      for (let x = r.x; x < r.x + r.w - 1e-6; x += CELL) {
        for (let y = r.y; y < r.y + r.h - 1e-6; y += CELL) {
          const v = bestRssi(x + CELL / 2, y + CELL / 2, cur, srcs);
          const l = levelOf(v);
          ctx.fillStyle = `rgba(${l.c[0]},${l.c[1]},${l.c[2]},0.30)`;
          ctx.fillRect(x * scale, y * scale, cs + 0.5, cs + 0.5);
        }
      }
    }
  }

  // ------------------------------------------------------ interacción
  function toMeters(svg, e) {
    const r = svg.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  }

  function bind(svg) {
    svg.addEventListener('pointerdown', (e) => {
      const pin = e.target.closest('[data-pin]');
      const room = e.target.closest('.proom');
      const m = toMeters(svg, e);
      if (pin) {
        drag = { kind: 'pin', id: pin.dataset.pin };
      } else if (room) {
        const r = plan.rooms.find((x) => x.id === room.dataset.id);
        sel = r.id;
        drag = e.target.dataset.handle ? { kind: 'resize', r, ox: m.x, oy: m.y, w: r.w, h: r.h } : { kind: 'move', r, ox: m.x - r.x, oy: m.y - r.y };
      } else { sel = null; drag = null; render(); return; }
      svg.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    svg.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const m = toMeters(svg, e);
      if (drag.kind === 'pin') {
        const x = Math.max(0, Math.min(plan.w, snap(m.x))), y = Math.max(0, Math.min(plan.h, snap(m.y)));
        plan.pins[drag.id] = { x, y, floor: cur };
        const g = svg.querySelector(`[data-pin="${CSS.escape(drag.id)}"]`);
        if (g) { g.setAttribute('transform', `translate(${x * scale},${y * scale})`); g.classList.remove('unplaced'); }
        drag.moved = true;
      } else if (drag.kind === 'move') {
        drag.r.x = Math.max(0, Math.min(plan.w - drag.r.w, snap(m.x - drag.ox)));
        drag.r.y = Math.max(0, Math.min(plan.h - drag.r.h, snap(m.y - drag.oy)));
        drag.moved = true; liteMove(svg, drag.r);
      } else {
        drag.r.w = Math.max(1, Math.min(plan.w - drag.r.x, snap(drag.w + m.x - drag.ox)));
        drag.r.h = Math.max(1, Math.min(plan.h - drag.r.y, snap(drag.h + m.y - drag.oy)));
        drag.moved = true; liteMove(svg, drag.r);
      }
    });
    const end = () => {
      if (!drag) return;
      const moved = drag.moved; drag = null;
      suggestion = null;
      render();
      if (moved) save();
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
  }

  /** Mueve el rectángulo mientras se arrastra sin redibujar todo el mapa. */
  function liteMove(svg, r) {
    const g = svg.querySelector(`.proom[data-id="${r.id}"]`); if (!g) return;
    const [body, , , , handle] = [g.querySelector('.pr-body'), 0, 0, 0, g.querySelector('.pr-handle')];
    body.setAttribute('x', r.x * scale); body.setAttribute('y', r.y * scale); body.setAttribute('width', r.w * scale); body.setAttribute('height', r.h * scale);
    handle.setAttribute('x', (r.x + r.w) * scale - 9); handle.setAttribute('y', (r.y + r.h) * scale - 9);
    const t = g.querySelectorAll('text');
    t[0].setAttribute('x', r.x * scale + 8); t[0].setAttribute('y', r.y * scale + 18);
    const dim = g.querySelector('.pr-dim'); dim.setAttribute('x', (r.x + r.w) * scale - 6); dim.setAttribute('y', (r.y + r.h) * scale - 6); dim.textContent = `${r.w}×${r.h} m`;
    const meas = g.querySelector('.pr-meas'); if (meas) { meas.setAttribute('x', r.x * scale + 8); meas.setAttribute('y', r.y * scale + 34); }
  }

  // --------------------------------------------------- panel lateral
  function renderSide() {
    const side = $('#planSide'); if (!side) return;
    side.replaceChildren();
    const r = plan.rooms.find((x) => x.id === sel);
    if (r) {
      const name = h('input', { value: r.name, maxlength: 40, 'aria-label': 'Nombre del cuarto' });
      name.addEventListener('change', () => { r.name = name.value.trim() || r.name; render(); save(); });
      const num = (k, label) => {
        const i = h('input', { type: 'number', step: SNAP, min: 1, value: r[k], 'aria-label': label });
        i.addEventListener('change', () => { r[k] = Math.max(1, snap(+i.value || 1)); render(); save(); });
        return h('label', { class: 'mini' }, h('span', { text: label }), i);
      };
      side.append(h('div', { class: 'side-h', text: 'Cuarto seleccionado' }), name,
        h('div', { class: 'row2' }, num('w', 'Ancho (m)'), num('h', 'Largo (m)')),
        h('button', { class: 'btn ghost danger', type: 'button', text: 'Borrar cuarto', onclick: () => { plan.rooms = plan.rooms.filter((x) => x !== r); sel = null; render(); save(); } }));
    } else {
      side.append(h('div', { class: 'side-h', text: 'Cómo se usa' }),
        h('ol', { class: 'side-steps' },
          h('li', { text: 'Pon el tamaño de tu casa y agrega cada cuarto.' }),
          h('li', { text: 'Arrastra los cuartos a su lugar; la esquina de abajo a la derecha cambia su tamaño.' }),
          h('li', { text: 'Arrastra el módem y el repetidor a donde están de verdad.' }),
          h('li', { text: 'Los colores muestran la señal estimada. Las pruebas del celular aparecen en cada cuarto.' })));
    }
    floorPanel(side);
    // leyenda
    side.append(h('div', { class: 'side-h', text: 'Señal estimada' }),
      h('div', { class: 'heat-legend' }, ...LEVELS.map((l) => h('span', {}, h('i', { style: `background:rgba(${l.c.join(',')},.55)` }), l.name))));
    if (suggestion) {
      side.append(h('div', { class: 'insight', style: 'margin-top:12px' }, 'Pon el repetidor (conectado por cable) en ', h('b', { text: suggestion.room + (plan.floors.length > 1 ? ' · ' + plan.floors[suggestion.floor || 0] : '') }),
        ', donde marca el círculo. ', suggestion.gain > 0.5 ? `Mejora la señal de las zonas débiles en ~${Math.round(suggestion.gain)} dB en promedio.` : 'La mejora sería pequeña: tu cobertura ya está bien.'));
    }
    side.append(h('p', { class: 'hint', text: 'Es una estimación: supone paredes ligeras (~6 dB cada una). Concreto, espejos y muebles grandes la reducen más. Las pruebas reales del celular mandan.' }));
  }

  // ------------------------------------------------------------ pisos
  function renderFloors() {
    const box = $('#floorSeg'); if (!box) return;
    box.replaceChildren(...plan.floors.map((name, i) => h('button', { type: 'button', class: i === cur ? 'on' : null, text: name, onclick: () => { cur = i; sel = null; render(); } })),
      h('button', { type: 'button', class: 'add', title: 'Agregar piso', text: '+ Piso', onclick: addFloor }));
  }
  function addFloor() {
    const names = ['Planta baja', 'Planta alta', 'Segundo piso', 'Tercer piso', 'Azotea'];
    plan.floors.push(names[plan.floors.length] || 'Piso ' + (plan.floors.length + 1));
    cur = plan.floors.length - 1;
    // copia el contorno del piso de abajo como punto de partida
    for (const r of roomsOf(cur - 1)) plan.rooms.push({ id: uid(), name: r.name + ' (arriba)', x: r.x, y: r.y, w: r.w, h: r.h, floor: cur });
    render(); save();
  }
  function floorPanel(side) {
    if (plan.floors.length < 2 && cur === 0) return;
    const name = h('input', { value: plan.floors[cur], maxlength: 30, 'aria-label': 'Nombre del piso' });
    name.addEventListener('change', () => { plan.floors[cur] = name.value.trim() || plan.floors[cur]; render(); save(); });
    side.append(h('div', { class: 'side-h', text: 'Piso actual' }), name,
      cur > 0 ? h('button', { class: 'btn ghost danger', type: 'button', text: 'Borrar este piso', onclick: () => {
        if (!confirm(`¿Borrar "${plan.floors[cur]}" y sus cuartos?`)) return;
        plan.rooms = plan.rooms.filter((r) => (r.floor || 0) !== cur).map((r) => ((r.floor || 0) > cur ? { ...r, floor: r.floor - 1 } : r));
        for (const [k, p] of Object.entries(plan.pins)) { if ((p.floor || 0) === cur) delete plan.pins[k]; else if ((p.floor || 0) > cur) p.floor--; }
        plan.floors.splice(cur, 1); cur = Math.max(0, cur - 1); render(); save();
      } }) : null);
  }

  // ------------------------------------------------------------ API
  function addRoom() {
    const names = S.settings.rooms.filter((n) => !plan.rooms.find((r) => r.name === n));
    const name = names[0] || 'Cuarto ' + (plan.rooms.length + 1);
    const here = roomsOf(cur);
    // buscar hueco libre
    let x = 0, y = 0; const w = 3, hh = 3;
    outer: for (y = 0; y <= plan.h - hh; y += 0.5) for (x = 0; x <= plan.w - w; x += 0.5) {
      if (!here.some((r) => x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + hh > r.y)) break outer;
    }
    if (y > plan.h - hh) { x = 0; y = 0; }
    const r = { id: uid(), name, x, y, w, h: hh, floor: cur };
    plan.rooms.push(r); sel = r.id; render(); save();
  }
  function addRepeater() {
    const n = plan.extra.length + 1;
    const id = 'extra-' + uid();
    plan.extra.push({ id, name: 'Repetidor nuevo' + (n > 1 ? ' ' + n : '') });
    plan.pins[id] = { x: plan.w / 2, y: plan.h / 2, floor: cur };
    render(); save();
  }
  function setSize(w, hh) {
    plan.w = Math.max(4, Math.min(60, +w || plan.w)); plan.h = Math.max(4, Math.min(60, +hh || plan.h));
    for (const r of plan.rooms) { r.x = Math.min(r.x, plan.w - 1); r.y = Math.min(r.y, plan.h - 1); r.w = Math.min(r.w, plan.w - r.x); r.h = Math.min(r.h, plan.h - r.y); }
    render(); save();
  }
  function init() {
    $('#btnAddRoomPlan').addEventListener('click', addRoom);
    $('#btnAddRep').addEventListener('click', addRepeater);
    $('#btnSuggest').addEventListener('click', () => {
      suggestion = suggest();
      if (!suggestion) { $('#planSide').prepend(h('div', { class: 'insight', text: 'Primero agrega cuartos y coloca el módem en el plano.' })); return; }
      render();
    });
    $('#heatToggle').addEventListener('change', (e) => { showHeat = e.target.checked; render(); });
    $('#planW').addEventListener('change', (e) => setSize(e.target.value, plan.h));
    $('#planH').addEventListener('change', (e) => setSize(plan.w, e.target.value));
    $('#planView').addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      $$('#planView button').forEach((x) => x.classList.toggle('on', x === b));
      const three = b.dataset.v === '3d';
      $('#plan').hidden = three; $('#house3d').hidden = !three; $('#btnRotate').hidden = !three;
      if (three) await show3d();
      else render();
    });
    $('#btnRotate').addEventListener('click', () => { if (window.House3D) $('#btnRotate').textContent = 'Girar: ' + (window.House3D.toggleRotate() ? 'sí' : 'no'); });
    let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if ($('#tab-casa').classList.contains('on')) render(); }, 150); });
  }
  function refresh() {
    if (!S) return;
    if (!plan) plan = Object.assign(defaults(), S.settings.plan || {});
    $('#planW').value = plan.w; $('#planH').value = plan.h;
    if (!drag) render();
    if (!$('#house3d').hidden && window.House3D && !drag) window.House3D.show($('#house3d'));
  }
  async function show3d() {
    const host = $('#house3d');
    if (!window.House3D) {
      host.replaceChildren(h('div', { class: 'empty', text: 'Cargando 3D…' }));
      try { await import('/house3d.js'); } catch (e) { host.replaceChildren(h('div', { class: 'empty', text: 'No se pudo cargar la vista 3D: ' + e.message })); return; }
      host.replaceChildren();
    }
    window.House3D.show(host);
  }
  /** Datos para la vista 3D. */
  function data() {
    if (!plan && S) plan = Object.assign(defaults(), S.settings.plan || {});
    if (plan) normalize();
    const pins = routers().map((r) => plan.pins[r.id] && { ...plan.pins[r.id], floor: plan.pins[r.id].floor || 0, id: r.id, name: r.name, main: r.main }).filter(Boolean);
    const meas = new Map((S ? S.rooms : []).map((r) => [r.room, r]));
    return { plan, pins, suggestion, measures: meas, floorH: FLOOR_H, roomsOf };
  }
  /** Mapa de calor como imagen (solo dentro de los cuartos), ppm = píxeles por metro. */
  function heatCanvas(ppm = 24, f = 0) {
    const c = document.createElement('canvas');
    c.width = Math.round(plan.w * ppm); c.height = Math.round(plan.h * ppm);
    const ctx = c.getContext('2d');
    if (f === 0) { ctx.fillStyle = '#2a2a28'; ctx.fillRect(0, 0, c.width, c.height); }
    const srcs = placedSources();
    for (const r of roomsOf(f)) {
      for (let x = r.x; x < r.x + r.w - 1e-6; x += CELL) for (let y = r.y; y < r.y + r.h - 1e-6; y += CELL) {
        let col = [90, 90, 86];
        if (srcs.length) col = levelOf(bestRssi(x + CELL / 2, y + CELL / 2, f, srcs)).c;
        ctx.fillStyle = `rgb(${col.map((v) => Math.round(v * 0.75 + 30)).join(',')})`;
        ctx.fillRect(x * ppm, y * ppm, CELL * ppm + 0.6, CELL * ppm + 0.6);
      }
    }
    return c;
  }
  return { init, refresh, render, data, heatCanvas, levels: LEVELS };
})();
window.Plan = Plan;
Plan.init();
