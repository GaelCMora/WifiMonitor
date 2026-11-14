'use strict';
/* Pestaña Administrar: accesos a los paneles de los routers y herramientas de red. Usa h, post, S, ICON de app.js. */

const Admin = (() => {
  const GUIDES = {
    arris: {
      title: 'Módem ARRIS (Izzi)',
      login: 'Usuario y contraseña: vienen en la etiqueta de abajo del módem.',
      items: [
        ['Reiniciar', 'Utilidades → Reiniciar el router'],
        ['Nombre y contraseña del WiFi', 'Inalámbrico de 2.4 / Inalámbrico de 5 → Básico → "Clave precompartida"'],
        ['Seguridad', 'Inalámbrico → Básico → Modo de seguridad: WPA2-PSK (AES)'],
        ['WPS', 'Inalámbrico → (si aparece) WPS → Desactivado'],
        ['Canal', 'Izzi lo bloquea en este modelo: pídeselo al 800 120 0000 (canal 1 o 6 en 2.4 GHz)'],
        ['Dispositivos conectados', 'LAN → Lista de clientes'],
        ['Señal de la línea', 'Botón HSD, o http://192.168.100.1 (también en la pestaña Línea de esta app)'],
      ],
    },
    huawei: {
      title: 'Módem Huawei HG659 (Telmex) como repetidor',
      login: 'Usuario TELMEX; la contraseña viene en la etiqueta.',
      items: [
        ['Reiniciar', 'Mantenimiento → Dispositivo → Reiniciar'],
        ['Canal WiFi', 'Red local → WLAN → Configuración avanzada → Canal (usa 1 o 6 si el Arris está en 11)'],
        ['Nombre y contraseña', 'Red local → WLAN → Configuración básica'],
        ['WPS', 'Red local → WLAN → WPS → Desactivar'],
        ['Que reparta IPs el Arris, no el Telmex', 'Red local → DHCP → desactivar servidor DHCP (así todos quedan en la misma red)'],
        ['Actualizar', 'Mantenimiento → Actualizar firmware'],
      ],
    },
    generic: {
      title: 'Router',
      login: 'Usuario y contraseña: normalmente en la etiqueta del equipo.',
      items: [
        ['Reiniciar', 'Busca "Reiniciar", "Reboot" o "Mantenimiento"'],
        ['Canal y WiFi', 'Busca "Inalámbrico", "WLAN" o "Wireless"'],
        ['WPS', 'Apágalo si aparece'],
      ],
    },
  };

  function guideFor(d) {
    const v = (d.vendor || '').toLowerCase();
    if (/arris/.test(v) || (d.kind === 'modem' && !/huawei/.test(v))) return GUIDES.arris;
    if (/huawei/.test(v)) return GUIDES.huawei;
    return GUIDES.generic;
  }

  function render() {
    if (!S) return;
    const gw = S.summary.net.gateway;
    const list = S.devices.filter((d) => d.kind === 'modem' || d.kind === 'router' || d.ip === gw);
    if (gw && !list.find((d) => d.ip === gw)) list.unshift({ ip: gw, name: 'Módem principal', kind: 'modem', vendor: '', online: true });
    const cards = list.map((d) => {
      const g = guideFor(d);
      const place = S.settings.places[d.ip];
      return h('div', { class: 'admin-card' },
        h('div', { class: 'admin-h' },
          h('div', { class: 'dev-ic', html: ICON[d.ip === gw ? 'modem' : 'router'] }),
          h('div', { class: 'pn' }, h('b', { text: d.name }), h('span', { text: `${g.title} · ${d.ip}${place ? ' · ' + place : ''}` })),
          badge(d.online ? 'good' : 'critical', d.online ? 'En línea' : 'Sin respuesta')),
        h('div', { class: 'admin-actions' },
          h('a', { class: 'btn primary', href: 'http://' + d.ip, target: '_blank', rel: 'noopener', text: 'Abrir panel' }),
          d.ip === gw ? h('a', { class: 'btn', href: 'http://192.168.100.1', target: '_blank', rel: 'noopener', text: 'Diagnóstico de línea' }) : null,
          h('button', { class: 'btn ghost', type: 'button', text: 'Ping', onclick: () => { $('#tHost').value = d.ip; run('ping', { host: d.ip }); } })),
        h('p', { class: 'hint', text: g.login }),
        h('dl', { class: 'guide' }, ...g.items.flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })])));
    });
    $('#adminRouters').replaceChildren(...cards);

    const pcs = S.devices.filter((d) => d.mac && (d.kind === 'pc' || d.kind === 'self' || d.kind === 'unknown' || d.kind === 'console'));
    const sel = $('#tWol'); const cur = sel.value;
    sel.replaceChildren(...(pcs.length ? pcs.map((d) => h('option', { value: d.mac, text: `${d.name} (${d.mac})`, selected: d.mac === cur || null }))
      : [h('option', { value: '', text: 'Sin PCs detectadas aún' })]));
  }

  async function run(tool, body) {
    const out = $('#tOut'); out.hidden = false;
    out.textContent = 'Ejecutando…';
    try {
      const r = await post('/api/tools/' + tool, body);
      out.textContent = r.output || r.error || JSON.stringify(r, null, 2);
    } catch (e) { out.textContent = 'Error: ' + e.message; }
  }

  function init() {
    $('#tPing').addEventListener('click', () => run('ping', { host: $('#tHost').value.trim() || 'google.com' }));
    $('#tTrace').addEventListener('click', () => run('trace', { host: $('#tHost').value.trim() || 'google.com' }));
    $('#tDnsGo').addEventListener('click', () => run('dns', { name: $('#tDns').value.trim() || 'api.steampowered.com' }));
    $('#tWolGo').addEventListener('click', () => { const m = $('#tWol').value; if (m) run('wol', { mac: m }); });
    $('#tFlush').addEventListener('click', () => run('flushdns', {}));
    $('#tHost').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#tPing').click(); });
    $('#tDns').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#tDnsGo').click(); });
  }
  init();
  return { render };
})();
window.Admin = Admin;
if (typeof S !== "undefined" && S) Admin.render();
