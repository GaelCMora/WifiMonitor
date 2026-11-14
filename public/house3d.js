// Vista 3D de la casa con Three.js: paredes, piso con la señal estimada, módem y repetidores con ondas.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const WALL_H = 1.3;          // paredes cortadas a media altura para ver adentro
const WALL_T = 0.1;
let renderer, scene, camera, controls, root, clock, raf, waves = [], built = false, autoRotate = true;

function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

function textSprite(text, sub, color = '#f0efec', onTop = true) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = '600 44px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.font = font;
  const w = Math.max(ctx.measureText(text).width, sub ? ctx.measureText(sub).width * 0.7 : 0) + 48;
  c.width = Math.ceil(w); c.height = sub ? 120 : 76;
  ctx.font = font;
  ctx.fillStyle = 'rgba(13,13,13,0.72)';
  const r = 18; ctx.beginPath(); ctx.roundRect(0, 0, c.width, c.height, r); ctx.fill();
  ctx.fillStyle = color; ctx.textBaseline = 'top'; ctx.fillText(text, 24, 14);
  if (sub) { ctx.font = '500 30px system-ui, -apple-system, Segoe UI, sans-serif'; ctx.fillStyle = '#c3c2b7'; ctx.fillText(sub, 24, 70); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: !onTop, transparent: true }));
  const k = 0.0085;
  s.scale.set(c.width * k, c.height * k, 1);
  s.renderOrder = onTop ? 10 : 0;
  return s;
}

function init(host) {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.append(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 300);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.minDistance = 3; controls.maxDistance = 80;
  controls.autoRotate = autoRotate; controls.autoRotateSpeed = 0.6;
  controls.addEventListener('start', () => { controls.autoRotate = false; });
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(8, 16, 6); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -20; sun.shadow.camera.right = 20; sun.shadow.camera.top = 20; sun.shadow.camera.bottom = -20;
  scene.add(sun);
  clock = new THREE.Clock();
  new ResizeObserver(() => resize(host)).observe(host);
  resize(host);
  const loop = () => {
    raf = requestAnimationFrame(loop);
    if (!host.offsetParent) return;              // pestaña oculta: no gastar GPU
    const t = clock.getElapsedTime();
    for (const w of waves) {
      const k = ((t * 0.45 + w.phase) % 1);
      w.mesh.scale.setScalar(0.2 + k * w.reach);
      w.mesh.material.opacity = 0.22 * (1 - k);
    }
    controls.update();
    renderer.render(scene, camera);
  };
  loop();
}

function resize(host) {
  const w = host.clientWidth, h = host.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
  camera.aspect = w / h; camera.updateProjectionMatrix();
}

function wall(x1, z1, x2, z2, mat, base = 0) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const m = new THREE.Mesh(new THREE.BoxGeometry(len + WALL_T, WALL_H, WALL_T), mat);
  m.position.set((x1 + x2) / 2, base + WALL_H / 2, (z1 + z2) / 2);
  m.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function routerModel(main) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.09, 0.28, 2, 1, 2),
    new THREE.MeshStandardMaterial({ color: main ? 0x2a2a28 : 0xeeeeea, roughness: 0.5, metalness: 0.1 }));
  body.castShadow = true; g.add(body);
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.012, 0.012), new THREE.MeshBasicMaterial({ color: 0x0ca30c }));
  led.position.set(0, 0.0, 0.142); g.add(led);
  const antMat = new THREE.MeshStandardMaterial({ color: 0x1a1a19, roughness: 0.6 });
  for (const x of [-0.16, 0.16]) {
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.32), antMat);
    a.position.set(x, 0.2, -0.11); a.castShadow = true; g.add(a);
  }
  return g;
}

/** Construye o reconstruye la escena a partir del plano. */
function build(data) {
  const { plan, pins, suggestion, measures, floorH, roomsOf } = data;
  const FH = floorH || 3;
  if (root) { scene.remove(root); root.traverse((o) => { o.geometry?.dispose(); if (o.material) { o.material.map?.dispose(); o.material.dispose(); } }); }
  root = new THREE.Group(); waves = [];
  scene.add(root);
  const ox = -plan.w / 2, oz = -plan.h / 2;      // centrar
  root.position.set(ox, 0, oz);

  // terreno
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(plan.w + 6, plan.h + 6), new THREE.MeshStandardMaterial({ color: 0x1d2b1d, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(plan.w / 2, -0.02, plan.h / 2); ground.receiveShadow = true;
  root.add(ground);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0xe9e6dd, roughness: 0.85, transparent: true, opacity: 0.8 });
  plan.floors.forEach((fname, f) => {
    const base = f * FH;
    // piso con mapa de calor (en pisos de arriba, solo donde hay cuartos)
    const heat = window.Plan.heatCanvas(32, f);
    const tex = new THREE.CanvasTexture(heat); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(plan.w, plan.h),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, transparent: f > 0, alphaTest: f > 0 ? 0.05 : 0, side: THREE.DoubleSide }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(plan.w / 2, base + 0.01, plan.h / 2); floor.receiveShadow = true;
    root.add(floor);
    // paredes (sin duplicar las compartidas)
    const seen = new Set();
    const key = (a, b, c, d) => [a, b, c, d].map((v) => v.toFixed(2)).join(',');
    for (const r of roomsOf(f)) {
      const edges = [[r.x, r.y, r.x + r.w, r.y], [r.x + r.w, r.y, r.x + r.w, r.y + r.h], [r.x, r.y + r.h, r.x + r.w, r.y + r.h], [r.x, r.y, r.x, r.y + r.h]];
      for (const [a, b, c, d] of edges) {
        const k1 = key(a, b, c, d);
        if (seen.has(k1)) continue; seen.add(k1);
        root.add(wall(a, b, c, d, wallMat, base));
      }
      const m = measures.get(r.name);
      const sub = m && m.down !== null ? `${m.down >= 100 ? Math.round(m.down) : m.down.toFixed(1)} Mbps medidos` : null;
      const label = textSprite(r.name, sub, '#f0efec', f === plan.floors.length - 1);
      label.position.set(r.x + r.w / 2, base + WALL_H + 0.9, r.y + r.h / 2);
      root.add(label);
    }
    if (plan.floors.length > 1) {
      const fl = textSprite(fname, null, '#9cc4f5');
      fl.position.set(-0.6, base + 0.6, plan.h / 2);
      root.add(fl);
    }
  });

  // módem y repetidores
  for (const p of pins) {
    const base = (p.floor || 0) * FH;
    const g = routerModel(p.main);
    g.position.set(p.x, base + 1.05, p.y);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 1.0, 16), new THREE.MeshStandardMaterial({ color: 0x6b5a45, roughness: 0.8 }));
    stand.position.set(p.x, base + 0.5, p.y); stand.castShadow = true;
    root.add(g, stand);
    const color = new THREE.Color(p.main ? css('--s1') || '#3987e5' : '#1baf7a');
    for (let i = 0; i < 3; i++) {
      const sph = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }));
      sph.position.set(p.x, base + 1.05, p.y);
      root.add(sph);
      waves.push({ mesh: sph, phase: i / 3, reach: 4 });
    }
    const lbl = textSprite(p.name, p.main ? 'da el internet' : 'repetidor', p.main ? '#9cc4f5' : '#7fe0b9');
    lbl.position.set(p.x, base + 1.85, p.y);
    root.add(lbl);
  }

  if (suggestion) {
    const base = (suggestion.floor || 0) * FH;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.05, 12, 48), new THREE.MeshBasicMaterial({ color: 0xfab219 }));
    ring.rotation.x = Math.PI / 2; ring.position.set(suggestion.x, base + 0.06, suggestion.y);
    const lbl = textSprite('Repetidor ideal', null, '#fab219');
    lbl.position.set(suggestion.x, base + 1.2, suggestion.y);
    root.add(ring, lbl);
  }

  if (!built) {
    const d = Math.max(plan.w, plan.h) + (plan.floors.length - 1) * 2;
    camera.position.set(d * 0.35, d * 1.0 + (plan.floors.length - 1) * FH, d * 0.95);
    controls.target.set(0, (plan.floors.length - 1) * FH / 2, 0);
    built = true;
  }
}

window.House3D = {
  show(host) {
    if (!renderer) init(host);
    build(window.Plan.data());
  },
  toggleRotate() { autoRotate = !autoRotate; if (controls) controls.autoRotate = autoRotate; return autoRotate; },
  reset() { built = false; if (renderer) build(window.Plan.data()); },
};
window.dispatchEvent(new Event('house3d-ready'));
