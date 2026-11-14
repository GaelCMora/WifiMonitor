// Vista 3D de la casa con Three.js.
// - Paredes y piso con la señal estimada, por pisos
// - Arrastrar módem/repetidores directamente en 3D
// - Importar un modelo de la casa (GLB/GLTF, STL, OBJ) y ajustarlo al plano
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

const SLAB = 0.15;                 // grosor de losa
let renderer, scene, camera, controls, root, modelRoot, waves = [], pinMeshes = [], built = false, host;
let lastData = null;
const opt = {
  autoRotate: false,
  walls: 'cut',                    // 'cut' (1.2 m para ver adentro) | 'full' (altura real)
  view: 'all',                     // 'all' | índice de piso
  explode: 0,                      // metros extra entre pisos para separarlos
};
try { Object.assign(opt, JSON.parse(localStorage.getItem('wm-3d') || '{}')); } catch { /* */ }
const saveOpt = () => { try { localStorage.setItem('wm-3d', JSON.stringify(opt)); } catch { /* */ } };

let modelObj = null;               // modelo importado (ya cargado)
let modelKey = '';                 // para no recargarlo si no cambió

// ------------------------------------------------------------- utilidades
function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
const realWallH = (plan) => plan.wallH || 2.5;
const levelH = (plan) => realWallH(plan) + SLAB;                       // altura real de un piso
const floorBase = (plan, f) => f * (levelH(plan) + opt.explode);

function textSprite(text, sub, color = '#f0efec', onTop = true, size = 1) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = '600 40px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.font = font;
  const w = Math.max(ctx.measureText(text).width, sub ? ctx.measureText(sub).width * 0.72 : 0) + 40;
  c.width = Math.ceil(w); c.height = sub ? 104 : 68;
  ctx.font = font;
  ctx.fillStyle = 'rgba(13,13,13,0.74)';
  ctx.beginPath(); ctx.roundRect(0, 0, c.width, c.height, 16); ctx.fill();
  ctx.fillStyle = color; ctx.textBaseline = 'top'; ctx.fillText(text, 20, 12);
  if (sub) { ctx.font = '500 28px system-ui, -apple-system, Segoe UI, sans-serif'; ctx.fillStyle = '#c3c2b7'; ctx.fillText(sub, 20, 62); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: !onTop, transparent: true }));
  const k = 0.0072 * size;
  s.scale.set(c.width * k, c.height * k, 1);
  s.renderOrder = onTop ? 10 : 0;
  return s;
}

// --------------------------------------------------------------- escena
function init(el) {
  host = el;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const canvasWrap = h('div', { class: 'h3d-canvas' });
  canvasWrap.append(renderer.domElement);
  host.append(canvasWrap);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 2; controls.maxDistance = 120;
  controls.autoRotate = opt.autoRotate; controls.autoRotateSpeed = 0.6;
  controls.addEventListener('start', () => { if (controls.autoRotate) { controls.autoRotate = false; opt.autoRotate = false; saveOpt(); syncBar(); } });
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.7));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(10, 20, 8); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, far: 80 });
  scene.add(sun);
  modelRoot = new THREE.Group(); scene.add(modelRoot);
  new ResizeObserver(resize).observe(canvasWrap);
  resize();
  bindDrag();
  const loop = () => {
    requestAnimationFrame(loop);
    if (!host.offsetParent) return;
    const t = performance.now() / 1000;
    for (const w of waves) {
      const k = (t * 0.45 + w.phase) % 1;
      w.mesh.scale.setScalar(0.2 + k * w.reach);
      w.mesh.material.opacity = 0.14 * (1 - k);
    }
    controls.update();
    renderer.render(scene, camera);
  };
  loop();
}

function resize() {
  const wrap = renderer.domElement.parentElement;
  const w = wrap.clientWidth, hh = wrap.clientHeight;
  if (!w || !hh) return;
  renderer.setSize(w, hh, false);
  renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
  camera.aspect = w / hh; camera.updateProjectionMatrix();
}

function wall(x1, z1, x2, z2, mat, base, height) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const m = new THREE.Mesh(new THREE.BoxGeometry(len + 0.1, height, 0.1), mat);
  m.position.set((x1 + x2) / 2, base + height / 2, (z1 + z2) / 2);
  m.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function routerModel(main) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.09, 0.28),
    new THREE.MeshStandardMaterial({ color: main ? 0x2a2a28 : 0xeeeeea, roughness: 0.5, metalness: 0.1 }));
  body.castShadow = true; g.add(body);
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.012, 0.012), new THREE.MeshBasicMaterial({ color: 0x0ca30c }));
  led.position.set(0, 0, 0.142); g.add(led);
  const antMat = new THREE.MeshStandardMaterial({ color: 0x1a1a19, roughness: 0.6 });
  for (const x of [-0.16, 0.16]) {
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.32), antMat);
    a.position.set(x, 0.2, -0.11); g.add(a);
  }
  return g;
}

function dispose(obj) {
  obj.traverse((o) => { o.geometry?.dispose(); const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => { if (m) { m.map?.dispose(); m.dispose(); } }); });
}

/** Construye la escena a partir del plano. */
function build(data) {
  lastData = data;
  const { plan, pins, suggestion, measures, roomsOf } = data;
  if (root) { scene.remove(root); dispose(root); }
  root = new THREE.Group(); waves = []; pinMeshes = [];
  scene.add(root);
  root.position.set(-plan.w / 2, 0, -plan.h / 2);
  const visible = (f) => opt.view === 'all' || +opt.view === f;
  const top = opt.view === 'all' ? plan.floors.length - 1 : +opt.view;
  const useModel = !!(modelObj && plan.model);
  const showWalls = !(useModel && plan.model.hideWalls !== false);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(plan.w + 8, plan.h + 8), new THREE.MeshStandardMaterial({ color: 0x1d2b1d, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(plan.w / 2, -0.03, plan.h / 2); ground.receiveShadow = true;
  root.add(ground);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0xe9e6dd, roughness: 0.85, transparent: true, opacity: 0.82 });
  plan.floors.forEach((fname, f) => {
    if (!visible(f)) return;
    const base = floorBase(plan, f);
    const heat = window.Plan.heatCanvas(32, f);
    const tex = new THREE.CanvasTexture(heat); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(plan.w, plan.h),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, transparent: true, opacity: useModel ? 0.85 : 1, alphaTest: f > 0 ? 0.05 : 0, side: THREE.DoubleSide }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(plan.w / 2, base + 0.012, plan.h / 2); floor.receiveShadow = true;
    root.add(floor);
    if (f > 0 && showWalls) {
      for (const r of roomsOf(f)) {
        const slab = new THREE.Mesh(new THREE.BoxGeometry(r.w, SLAB, r.h), new THREE.MeshStandardMaterial({ color: 0x9a968c, roughness: 0.9, transparent: true, opacity: 0.55 }));
        slab.position.set(r.x + r.w / 2, base - SLAB / 2, r.y + r.h / 2); slab.receiveShadow = true;
        root.add(slab);
      }
    }
    // Pisos de abajo: paredes de altura real, hasta la losa de arriba. Piso de arriba: cortadas para ver adentro.
    const hgt = f === top && opt.walls === 'cut' ? 1.2 : realWallH(plan);
    const seen = new Set();
    const key = (a, b, c, d) => [a, b, c, d].map((v) => v.toFixed(2)).join(',');
    for (const r of roomsOf(f)) {
      if (showWalls) {
        const edges = [[r.x, r.y, r.x + r.w, r.y], [r.x + r.w, r.y, r.x + r.w, r.y + r.h], [r.x, r.y + r.h, r.x + r.w, r.y + r.h], [r.x, r.y, r.x, r.y + r.h]];
        for (const [a, b, c, d] of edges) {
          const k1 = key(a, b, c, d);
          if (seen.has(k1)) continue; seen.add(k1);
          root.add(wall(a, b, c, d, wallMat, base, hgt));
        }
      }
      if (f === top) {
        const m = measures.get(r.name);
        const sub = m && m.down !== null ? `${m.down >= 100 ? Math.round(m.down) : m.down.toFixed(1)} Mbps medidos` : null;
        const label = textSprite(r.name, sub, '#f0efec', false, 0.8);
        label.position.set(r.x + r.w / 2, base + 0.45, r.y + r.h / 2);
        root.add(label);
      }
    }
  });

  // módem y repetidores (se pueden arrastrar)
  for (const p of pins) {
    const f = p.floor || 0;
    if (!visible(f)) continue;
    const base = floorBase(plan, f);
    const grp = new THREE.Group();
    grp.position.set(p.x, base, p.y);
    const dev = routerModel(p.main); dev.position.y = 1.05; grp.add(dev);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 1.0, 16), new THREE.MeshStandardMaterial({ color: 0x6b5a45, roughness: 0.8 }));
    stand.position.y = 0.5; stand.castShadow = true; grp.add(stand);
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.8, 12), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.9; hit.userData.pin = p; grp.add(hit);
    pinMeshes.push(hit);
    const view = window.Plan.view();
    if (view.focus === 'all' || view.focus === p.id) {
      // una onda por banda: 2.4 GHz llega más lejos que 5 GHz
      const bands = view.band === 'best' ? ['2.4', '5'] : [view.band];
      for (const bnd of bands) {
        const color = new THREE.Color(bnd === '5' ? '#9085e9' : (p.main ? css('--s1') || '#3987e5' : '#1baf7a'));
        const reach = Math.min(9, window.Plan.reach(bnd) * 0.4);
        for (let i = 0; i < 2; i++) {
          const sph = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false }));
          sph.position.y = 1.05; grp.add(sph);
          waves.push({ mesh: sph, phase: i / 2 + (bnd === '5' ? 0.25 : 0), reach });
        }
      }
    }
    const lbl = textSprite(p.name, p.main ? 'da el internet' : 'repetidor', p.main ? '#9cc4f5' : '#7fe0b9', true, 0.7);
    lbl.position.y = 1.7; grp.add(lbl);
    root.add(grp);
  }

  if (suggestion && visible(suggestion.floor || 0)) {
    const base = floorBase(plan, suggestion.floor || 0);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.05, 12, 48), new THREE.MeshBasicMaterial({ color: 0xfab219 }));
    ring.rotation.x = Math.PI / 2; ring.position.set(suggestion.x, base + 0.06, suggestion.y);
    const lbl = textSprite('Repetidor ideal', null, '#fab219', true, 0.75);
    lbl.position.set(suggestion.x, base + 1.1, suggestion.y);
    root.add(ring, lbl);
  }

  placeModel(plan);
  if (!built) { frame(plan); built = true; }
}

function frame(plan) {
  const d = Math.max(plan.w, plan.h);
  const hgt = (plan.floors.length - 1) * (levelH(plan) + opt.explode);
  camera.position.set(d * 0.45, d * 0.85 + hgt, d * 1.0);
  controls.target.set(0, hgt / 2, 0);
}

// ------------------------------------------------- arrastrar routers en 3D
function bindDrag() {
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hitPt = new THREE.Vector3();
  let drag = null;
  const el = renderer.domElement;
  const pick = (e) => {
    const r = el.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  };
  // captura: se revisa antes que OrbitControls para que el arrastre no gire la cámara
  el.addEventListener('pointerdown', (e) => {
    if (!lastData) return;
    pick(e);
    const hit = ray.intersectObjects(pinMeshes, false)[0];
    if (!hit) return;
    const p = hit.object.userData.pin;
    const base = floorBase(lastData.plan, p.floor || 0);
    drag = { p, grp: hit.object.parent, plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -base) };
    controls.enabled = false;
    el.setPointerCapture(e.pointerId);
    el.style.cursor = 'grabbing';
    e.preventDefault(); e.stopImmediatePropagation();
  }, { capture: true });
  el.addEventListener('pointermove', (e) => {
    pick(e);
    if (!drag) { el.style.cursor = ray.intersectObjects(pinMeshes, false).length ? 'grab' : ''; return; }
    if (!ray.ray.intersectPlane(drag.plane, hitPt)) return;
    const plan = lastData.plan;
    const x = Math.max(0, Math.min(plan.w, Math.round((hitPt.x + plan.w / 2) * 4) / 4));
    const z = Math.max(0, Math.min(plan.h, Math.round((hitPt.z + plan.h / 2) * 4) / 4));
    drag.grp.position.x = x; drag.grp.position.z = z;
    drag.x = x; drag.z = z;
  });
  const end = () => {
    if (!drag) return;
    const d = drag; drag = null;
    controls.enabled = true; el.style.cursor = '';
    if (d.x !== undefined) window.Plan.setPin(d.p.id, d.x, d.z, d.p.floor || 0);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

// --------------------------------------------------------- modelo importado
const LOADERS = {
  glb: () => new GLTFLoader(), gltf: () => new GLTFLoader(),
  stl: () => new STLLoader(), obj: () => new OBJLoader(),
};

async function loadModel(plan) {
  const m = plan.model;
  if (!m || !m.ext) { clearModel(); modelKey = ''; return; }
  const key = m.ext + ':' + m.v;
  if (key === modelKey && modelObj) return;
  modelKey = key;
  const loader = LOADERS[m.ext] && LOADERS[m.ext]();
  if (!loader) return;
  setStatus('Cargando modelo…');
  try {
    const res = await new Promise((ok, bad) => loader.load('/api/model?v=' + encodeURIComponent(m.v || '0'), ok, undefined, bad));
    let obj;
    if (m.ext === 'stl') {
      res.computeVertexNormals();
      obj = new THREE.Mesh(res, new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.8 }));
    } else obj = res.scene || res;
    obj.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      if (m.ext === 'obj' && (!o.material || o.material.type === 'MeshPhongMaterial')) o.material = new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.8 });
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((mt) => { if (mt) { mt.transparent = true; mt.side = THREE.DoubleSide; } });
    });
    clearModel();
    modelObj = new THREE.Group(); modelObj.add(obj);
    modelRoot.add(modelObj);
    setStatus('');
    if (lastData) { build(lastData); syncBar(); }
  } catch (e) {
    setStatus('No se pudo leer el modelo: ' + (e.message || e));
  }
}
function clearModel() {
  if (modelObj) { modelRoot.remove(modelObj); dispose(modelObj); modelObj = null; }
}

/** Aplica escala, giro, posición y transparencia guardadas. */
function placeModel(plan) {
  if (!modelObj) return;
  const m = plan.model || {};
  const inner = modelObj.children[0];
  inner.rotation.set(m.zUp ? -Math.PI / 2 : 0, 0, 0);
  modelObj.rotation.set(0, THREE.MathUtils.degToRad(m.rotY || 0), 0);
  modelObj.scale.setScalar(m.scale || 1);
  modelObj.position.set(0, 0, 0);
  modelObj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(modelObj);
  const c = box.getCenter(new THREE.Vector3());
  // apoyado en el suelo y centrado en el plano, más el ajuste manual
  modelObj.position.set(-c.x + (m.dx || 0), -box.min.y + (m.dy || 0), -c.z + (m.dz || 0));
  const op = m.opacity ?? 0.6;
  modelObj.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((mt) => { if (mt) { mt.opacity = op; mt.depthWrite = op > 0.95; } });
  });
}

/** Tamaño del modelo en metros: crudo (sin escala) y con la escala actual. */
function modelSize(plan) {
  if (!modelObj) return null;
  const m = plan.model || {};
  const prev = { r: modelObj.rotation.y, s: modelObj.scale.x };
  modelObj.rotation.y = 0; modelObj.scale.setScalar(1); modelObj.updateMatrixWorld(true);
  const raw = new THREE.Box3().setFromObject(modelObj).getSize(new THREE.Vector3());
  modelObj.rotation.y = prev.r; modelObj.scale.setScalar(prev.s); modelObj.updateMatrixWorld(true);
  return { raw, scaled: raw.clone().multiplyScalar(m.scale || 1) };
}

/** Detecta unidades (m, cm, mm, pulgadas, pies) por el tamaño: una casa mide de 3 a 80 m. */
function guessScale(raw) {
  const big = Math.max(raw.x, raw.z);
  for (const [s, name] of [[1, 'metros'], [0.01, 'centímetros'], [0.001, 'milímetros'], [0.0254, 'pulgadas'], [0.3048, 'pies']]) {
    const v = big * s;
    if (v >= 3 && v <= 80) return { scale: s, units: name };
  }
  return { scale: 12 / big, units: 'desconocidas (ajustado a 12 m)' };
}

// ------------------------------------------------------------ barra de 3D
let statusEl;
function setStatus(t) { if (statusEl) { statusEl.textContent = t; statusEl.hidden = !t; } }

function bar() {
  const b = h('div', { class: 'h3d-bar' });
  const floors = h('select', { id: 'h3dView', 'aria-label': 'Pisos visibles' });
  const walls = h('select', { id: 'h3dWalls', 'aria-label': 'Paredes' },
    h('option', { value: 'cut', text: 'Paredes cortadas' }), h('option', { value: 'full', text: 'Paredes completas' }));
  const explode = h('input', { id: 'h3dExplode', type: 'range', min: 0, max: 4, step: 0.25, 'aria-label': 'Separar pisos' });
  const rot = h('button', { class: 'btn ghost', type: 'button', id: 'h3dRot' });
  const center = h('button', { class: 'btn ghost', type: 'button', text: 'Centrar', onclick: () => { if (lastData) frame(lastData.plan); } });
  const file = h('input', { type: 'file', accept: '.glb,.gltf,.stl,.obj', hidden: true, onchange: (e) => { upload(e.target.files[0]); e.target.value = ''; } });
  const imp = h('button', { class: 'btn', type: 'button', text: 'Importar modelo 3D', title: 'GLB, GLTF, STL u OBJ', onclick: () => file.click() });
  floors.addEventListener('change', () => { opt.view = floors.value; saveOpt(); refresh(); });
  walls.addEventListener('change', () => { opt.walls = walls.value; saveOpt(); refresh(); });
  explode.addEventListener('input', () => { opt.explode = +explode.value; saveOpt(); refresh(); });
  rot.addEventListener('click', () => { opt.autoRotate = !opt.autoRotate; controls.autoRotate = opt.autoRotate; saveOpt(); syncBar(); });
  b.append(floors, walls, h('label', { class: 'h3d-range' }, h('span', { text: 'Separar pisos' }), explode), rot, center, imp, file);
  statusEl = h('div', { class: 'h3d-status', hidden: true });
  const model = h('div', { class: 'h3d-model', id: 'h3dModel', hidden: true });
  const hint = h('p', { class: 'hint h3d-hint', text: 'Ondas: azul/verde = 2.4 GHz (llega más lejos), morado = 5 GHz (más rápida, alcance menor). Arrastra el módem o el repetidor para moverlo; arrastra el fondo para girar.' });
  return [b, model, statusEl, hint];
}

function syncBar() {
  if (!lastData || !$('#h3dView')) return;
  const plan = lastData.plan;
  const v = $('#h3dView');
  v.replaceChildren(h('option', { value: 'all', text: 'Todos los pisos' }), ...plan.floors.map((f, i) => h('option', { value: String(i), text: f })));
  if (opt.view !== 'all' && +opt.view >= plan.floors.length) opt.view = 'all';
  v.value = String(opt.view);
  v.hidden = plan.floors.length < 2;
  $('#h3dWalls').value = opt.walls;
  $('#h3dExplode').value = opt.explode;
  $('#h3dExplode').parentElement.hidden = plan.floors.length < 2;
  $('#h3dRot').textContent = opt.autoRotate ? 'Girar: sí' : 'Girar: no';
  renderModelPanel(plan);
}

function renderModelPanel(plan) {
  const box = $('#h3dModel');
  const m = plan.model;
  if (!m || !m.ext) { box.hidden = true; return; }
  box.hidden = false;
  const size = modelSize(plan);
  const set = (k, v) => { plan.model[k] = v; window.Plan.saveModel(plan.model); placeModel(plan); renderModelPanel(plan); };
  const num = (label, k, step, def) => {
    const i = h('input', { type: 'number', step, value: m[k] ?? def });
    i.addEventListener('change', () => set(k, +i.value || 0));
    return h('label', { class: 'mini' }, h('span', { text: label }), i);
  };
  const op = h('input', { type: 'range', min: 0.1, max: 1, step: 0.05, value: m.opacity ?? 0.6 });
  op.addEventListener('input', () => { plan.model.opacity = +op.value; placeModel(plan); });
  op.addEventListener('change', () => window.Plan.saveModel(plan.model));
  box.replaceChildren(
    h('div', { class: 'h3d-mh' }, h('b', { text: 'Modelo: ' + (m.name || 'casa') }),
      size ? h('span', { text: ` · mide ${size.scaled.x.toFixed(1)} × ${size.scaled.z.toFixed(1)} m, alto ${size.scaled.y.toFixed(1)} m` }) : null),
    h('div', { class: 'h3d-mrow' },
      num('Escala', 'scale', 0.001, 1), num('Girar (°)', 'rotY', 90, 0),
      num('Mover X (m)', 'dx', 0.25, 0), num('Mover Z (m)', 'dz', 0.25, 0), num('Subir (m)', 'dy', 0.1, 0),
      h('label', { class: 'mini' }, h('span', { text: 'Transparencia' }), op)),
    h('div', { class: 'h3d-mrow' },
      h('label', { class: 'tog' }, h('input', { type: 'checkbox', checked: m.zUp || null, onchange: (e) => set('zUp', e.target.checked) }), 'Z hacia arriba (STL/CAD)'),
      h('label', { class: 'tog' }, h('input', { type: 'checkbox', checked: m.hideWalls !== false || null, onchange: (e) => { plan.model.hideWalls = e.target.checked; window.Plan.saveModel(plan.model); refresh(); } }), 'Ocultar paredes del plano'),
      h('button', { class: 'btn', type: 'button', text: 'Auto-escala', title: 'Detecta si el modelo está en mm, cm o metros', onclick: () => { const s = modelSize(plan); if (s) { const g = guessScale(s.raw); set('scale', g.scale); setStatus('Unidades detectadas: ' + g.units); } } }),
      h('button', { class: 'btn', type: 'button', text: 'Ajustar plano al modelo', title: 'Usa el tamaño del modelo como ancho y largo del plano', onclick: fitPlanToModel }),
      h('button', { class: 'btn ghost danger', type: 'button', text: 'Quitar modelo', onclick: async () => { await fetch('/api/model', { method: 'DELETE' }); plan.model = null; window.Plan.saveModel(null); clearModel(); modelKey = ''; refresh(); } })));
}

function fitPlanToModel() {
  const plan = lastData.plan;
  const s = modelSize(plan); if (!s) return;
  const rotated = Math.abs((plan.model.rotY || 0) % 180) === 90;
  const w = Math.ceil((rotated ? s.scaled.z : s.scaled.x) * 4) / 4, d = Math.ceil((rotated ? s.scaled.x : s.scaled.z) * 4) / 4;
  plan.model.dx = 0; plan.model.dz = 0;
  window.Plan.saveModel(plan.model);
  window.Plan.setSize(w, d);
  setStatus(`Plano ajustado a ${w} × ${d} m. Ahora marca los cuartos encima en el Plano 2D para que la señal se calcule bien.`);
}

async function upload(file) {
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (!LOADERS[ext]) { setStatus('Formato no soportado. Usa GLB, GLTF (de un solo archivo), STL u OBJ.'); return; }
  if (file.size > 150e6) { setStatus('El archivo pesa más de 150 MB.'); return; }
  setStatus(`Subiendo ${file.name}…`);
  const r = await fetch('/api/model?ext=' + ext, { method: 'POST', body: file });
  if (!r.ok) { setStatus('No se pudo guardar el modelo.'); return; }
  const plan = lastData.plan;
  plan.model = { ext, name: file.name.slice(0, 60), v: Date.now(), scale: 1, rotY: 0, dx: 0, dy: 0, dz: 0, opacity: 0.6, zUp: ext === 'stl', hideWalls: true };
  modelKey = '';
  await loadModel(plan);
  const s = modelSize(plan);
  if (s) { const g = guessScale(s.raw); plan.model.scale = g.scale; setStatus(`Listo. Unidades detectadas: ${g.units}. Ajusta escala y giro si hace falta.`); }
  window.Plan.saveModel(plan.model);
  placeModel(plan);
  refresh();
}

function refresh() { const d = window.Plan.data(); build(d); syncBar(); }

window.House3D = {
  show(el) {
    if (!renderer) {
      el.replaceChildren(...bar());
      init(el);
    }
    const d = window.Plan.data();
    build(d);
    syncBar();
    loadModel(d.plan);
  },
  reset() { built = false; refresh(); },
  /** Posición en pantalla de un router (para pruebas y para ubicarlo). */
  pinScreen(id) {
    const hit = pinMeshes.find((m) => m.userData.pin.id === id); if (!hit) return null;
    const v = new THREE.Vector3(); hit.getWorldPosition(v); v.project(camera);
    const r = renderer.domElement.getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  },
};
window.dispatchEvent(new Event('house3d-ready'));
