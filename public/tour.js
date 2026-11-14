'use strict';
/* Recorrido guiado, paso a paso, por todo el sistema. Usa h, $, showTab de app.js. */

const Tour = (() => {
  const STEPS = [
    { tab: 'resumen', sel: null, title: 'Bienvenido a WiFi Monitor',
      body: 'Te enseño en 2 minutos todo lo que puede hacer. Puedes salir cuando quieras y repetirlo con el botón "Recorrido" de arriba.' },
    { tab: 'resumen', sel: '.hero-house', title: 'Tu casa, en vivo',
      body: 'Gira sola. Los colores del piso son la señal estimada: verde es buena y rojo es mala. Los puntos son tus aparatos: azul si es tuyo, amarillo si no lo has reconocido. Haz doble clic para editarla.' },
    { tab: 'resumen', sel: '.hero-side', title: 'Salud de la red',
      body: 'La calificación de 0 a 100 resume todo, y abajo te dice por qué. Cada lectura (módem, internet, DNS, dispositivos, línea) se puede tocar para ver el detalle.' },
    { tab: 'resumen', sel: '#latChart', title: 'Latencia en tiempo real',
      body: 'Azul es lo que tarda el módem en responder y naranja lo que tarda internet. Las franjas rojas son cortes. Pasa el mouse para ver cada momento y cambia el rango arriba (15 min a 24 h).' },
    { tab: 'resumen', sel: '#btnQr', title: 'Ábrelo en el celular',
      body: 'Escanea el código con el celular, conectado a la misma WiFi. Así puedes caminar por la casa midiendo la señal.' },
    { tab: 'probar', sel: '.test-card', title: 'Mide la señal en cada cuarto',
      body: 'Desde el celular: escribe en qué cuarto estás y a qué red estás conectado, y toca "Probar aquí". Repite en cada cuarto y con cada red (2.4 GHz, 5 GHz, repetidor).' },
    { tab: 'probar', sel: '#btnInet', title: 'La velocidad real de tu internet',
      body: 'Mide desde la PC por cable, sin WiFi de por medio. Si aquí sale bien y en el celular mal, el problema es el WiFi, no tu proveedor.' },
    { tab: 'casa', sel: '.plan-tools', title: 'Dibuja tu casa',
      body: 'Pon el ancho y el largo en metros, agrega cada cuarto y acomódalo arrastrándolo. Si tu casa es de dos pisos, usa "+ Piso".' },
    { tab: 'casa', sel: '#plan', title: 'Coloca el módem y los repetidores',
      body: 'Arrástralos a donde están de verdad. El mapa de colores se recalcula al instante. Pasa el mouse sobre cualquier punto para ver cuánta señal llega de cada router en 2.4 y 5 GHz.' },
    { tab: 'casa', sel: '#heatBand', title: 'Cada router y cada banda',
      body: 'Elige "Solo 5 GHz" o "Solo el módem" para ver hasta dónde llega cada uno. "Sugerir lugar para repetidor" calcula el mejor sitio para mejorar las zonas débiles.' },
    { tab: 'casa', sel: '#planView', title: 'Tu casa en 3D',
      body: 'Gírala, separa los pisos y arrastra los routers también aquí. Si tienes el modelo de tu casa (GLB, STL u OBJ, por ejemplo de Blender), impórtalo y la app lo ajusta a tu plano.' },
    { tab: 'equipos', sel: '#btnClients', title: 'Conecta la app con tu router',
      body: 'Con la lista de clientes del router, la app sabe el nombre real de cada aparato, a qué router y banda está conectado y con cuánta señal. Con eso calcula en qué cuarto está. Puede leerla sola cada 2 minutos.' },
    { tab: 'equipos', sel: '#devList', title: '¿Es tuyo?',
      body: 'Toca un aparato para ponerle nombre y marca "Es mío". Así, si se conecta uno que no conoces, la app te avisa. El filtro "Sin reconocer" te muestra los pendientes.' },
    { tab: 'linea', sel: '#cableBox', title: 'La línea de tu proveedor',
      body: 'Si tu internet es por cable (Izzi, Megacable…), aquí ves la señal que llega a tu módem. Si sale de rango, el problema es de ellos: repórtalo con una captura de esta pantalla.' },
    { tab: 'admin', sel: '#adminRouters', title: 'Administrar tus routers',
      body: 'Accesos directos a cada panel y dónde está cada opción en tu modelo: reiniciar, canal, contraseña, WPS. Abajo tienes herramientas: ping, ruta, comparar DNS y encender una PC.' },
    { tab: 'mejoras', sel: '#advAll', title: 'Qué mejorar',
      body: 'Recomendaciones calculadas con lo que se ha medido, de lo más urgente a lo menos. Los comandos tienen botón de copiar. Abajo está la lista de seguridad.' },
    { tab: 'eventos', sel: '#evAll', title: 'Historial',
      body: 'Cada corte, reconexión y aparato nuevo queda aquí con su hora. Los registros diarios se descargan en CSV desde la derecha.' },
    { tab: 'resumen', sel: null, title: 'Listo',
      body: 'Empieza por dibujar tu casa y hacer pruebas con el celular en cada cuarto: con eso, todo lo demás se vuelve más preciso.' },
  ];

  let i = 0, els = null;

  function build() {
    const veil = h('div', { class: 'tour-veil' });
    const hole = h('div', { class: 'tour-hole' });
    const pop = h('div', { class: 'tour-pop', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'tourT' });
    veil.addEventListener('click', () => go(i + 1));
    document.body.append(veil, hole, pop);
    els = { veil, hole, pop };
    document.addEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (!els) return;
    if (e.key === 'Escape') end();
    else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); go(i + 1); }
    else if (e.key === 'ArrowLeft') go(i - 1);
  }

  function end() {
    if (!els) return;
    Object.values(els).forEach((e) => e.remove());
    els = null;
    document.removeEventListener('keydown', onKey);
    try { localStorage.setItem('wm-tour-done', '1'); } catch { /* */ }
  }

  function go(n) {
    if (n < 0) return;
    if (n >= STEPS.length) { end(); return; }
    i = n;
    const st = STEPS[i];
    if (st.tab && !$('#tab-' + st.tab).classList.contains('on')) showTab(st.tab);
    // esperar a que la pestaña se dibuje
    setTimeout(() => place(st), 120);
  }

  function place(st) {
    if (!els) return;
    const { hole, pop } = els;
    let target = st.sel ? document.querySelector(st.sel) : null;
    if (target && !target.getClientRects().length) target = null;
    if (target) {
      target.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
    setTimeout(() => {
      const pad = 8;
      let r = target ? target.getBoundingClientRect() : null;
      if (r) {
        // si el elemento es más alto que la pantalla, enfocar solo la parte visible
        const top = Math.max(8, r.top - pad), bottom = Math.min(innerHeight - 8, r.bottom + pad);
        Object.assign(hole.style, { left: r.left - pad + 'px', top: top + 'px', width: r.width + pad * 2 + 'px', height: Math.max(24, bottom - top) + 'px', opacity: 1 });
        r = { left: r.left - pad, right: r.right + pad, top, bottom };
      } else {
        Object.assign(hole.style, { left: innerWidth / 2 + 'px', top: innerHeight / 2 + 'px', width: '0px', height: '0px', opacity: 1 });
      }
      pop.replaceChildren(
        h('div', { class: 'tour-step', text: `${i + 1} de ${STEPS.length}` }),
        h('h3', { id: 'tourT', text: st.title }),
        h('p', { text: st.body }),
        h('div', { class: 'tour-bar' }, h('i', { style: `width:${((i + 1) / STEPS.length) * 100}%` })),
        h('div', { class: 'tour-actions' },
          h('button', { class: 'skip', type: 'button', text: i === STEPS.length - 1 ? 'Cerrar' : 'Salir del recorrido', onclick: end }),
          i > 0 ? h('button', { class: 'btn ghost', type: 'button', text: 'Atrás', onclick: () => go(i - 1) }) : null,
          h('button', { class: 'btn primary', type: 'button', text: i === STEPS.length - 1 ? 'Terminar' : 'Siguiente', onclick: () => go(i + 1) })));
      const pw = pop.offsetWidth, ph = pop.offsetHeight, m = 14;
      let x, y;
      if (!r) { x = (innerWidth - pw) / 2; y = (innerHeight - ph) / 2; }
      else if (innerHeight - r.bottom > ph + m) { x = r.left; y = r.bottom + m; }
      else if (r.top > ph + m) { x = r.left; y = r.top - ph - m; }
      else if (innerWidth - r.right > pw + m) { x = r.right + m; y = r.top; }
      else if (r.left > pw + m) { x = r.left - pw - m; y = r.top; }
      else { x = (innerWidth - pw) / 2; y = innerHeight - ph - 16; }
      pop.style.left = Math.max(12, Math.min(innerWidth - pw - 12, x)) + 'px';
      pop.style.top = Math.max(12, Math.min(innerHeight - ph - 12, y)) + 'px';
      const btn = pop.querySelector('.btn.primary'); if (btn) btn.focus({ preventScroll: true });
    }, target ? 380 : 0);
  }

  function start() { if (!els) build(); go(0); }

  $('#btnTour').addEventListener('click', start);
  addEventListener('resize', () => { if (els) place(STEPS[i]); });
  // Primera vez en la PC: arranca solo
  setTimeout(() => {
    let done = false; try { done = !!localStorage.getItem('wm-tour-done'); } catch { /* */ }
    if (!done && typeof S !== 'undefined' && S && S.local && !location.hash) start();
  }, 1500);
  return { start, end };
})();
