'use strict';
// Recomendaciones a partir de lo que se ha medido.
// Cada una: { id, level: 'critical'|'serious'|'warning'|'tip'|'good', title, why, steps[] }

function advice(m) {
  const s = m.summary();
  const rooms = m.rooms();
  const out = [];
  const add = (level, id, title, why, steps = []) => { const o = { id, level, title, why, steps }; out.push(o); return o; };
  const gw = s.net.gateway || '192.168.0.1';
  const dnsAvg = s.dns && s.dns.avg;

  // ------------------------------------------------ acceso desde el celular
  const fw = m.firewall;
  const lanRecent = m.lanSeen && Date.now() - m.lanSeen.t < 15 * 60000;
  if (fw && fw.applies && !fw.ok && !lanRecent) {
    const o = add('serious', 'firewall', 'Los celulares no pueden abrir el panel',
      fw.reason + ' Por eso en el celular la página se queda en blanco cargando.',
      ['Toca "Arreglar ahora" en esta PC: Windows te pedirá permiso de administrador y se crea la regla "WiFi Monitor".',
        'O en una terminal: wifimonitor firewall',
        'O a mano en cmd como administrador:',
        `netsh advfirewall firewall add rule name="WiFi Monitor" dir=in action=allow protocol=TCP localport=${m.port || 7777} profile=any`]);
    o.action = 'fix-firewall';
  }

  // ---------------------------------------------------------------- DNS
  if (s.dns && (s.dns.systemHijack || s.dns.modemHijack)) {
    add('critical', 'dns-hijack', 'El DNS está dando direcciones falsas',
      `Cuando se pidió ${s.dns.name}, el DNS ${s.dns.systemHijack ? 'que usa esta PC' : 'del módem'} respondió ${(s.dns.systemHijack ? s.dns.sistema : s.dns.modem).ips.join(', ')} (una dirección privada). Eso hace que apps como Steam digan "sin conexión" aunque el navegador funcione.`,
      ['Usa DNS públicos en esta PC (cmd como administrador, cambia "Ethernet" por el nombre de tu conexión):',
        'netsh interface ipv4 set dnsservers name="Ethernet" static 1.1.1.1 primary',
        'netsh interface ipv4 add dnsservers name="Ethernet" 8.8.8.8 index=2',
        'netsh interface ipv6 set dnsservers name="Ethernet" static 2606:4700:4700::1111 primary',
        'ipconfig /flushdns',
        'En el celular: Ajustes → Conexiones → Más ajustes → DNS privado → one.one.one.one']);
  } else if (dnsAvg && dnsAvg.modem !== null && dnsAvg.cloudflare !== null && dnsAvg.modem > dnsAvg.cloudflare * 2 && dnsAvg.modem > 40) {
    add('warning', 'dns-slow-modem', 'El DNS del módem es lento',
      `Responde en ~${Math.round(dnsAvg.modem)} ms contra ~${Math.round(dnsAvg.cloudflare)} ms de Cloudflare. Cada página tarda eso de más en empezar a cargar.`,
      ['Pon DNS públicos (1.1.1.1 y 8.8.8.8) en la PC y en el celular (DNS privado: one.one.one.one).']);
  }
  if (s.dns && s.dns.avg.sistema !== null && s.dns.avg.sistema <= 40 && !s.dns.systemHijack) {
    add('good', 'dns-ok', 'DNS de esta PC funcionando bien', `Resuelve nombres en ~${Math.round(s.dns.avg.sistema)} ms.`);
  }

  // ---------------------------------------------------------- módem / internet
  if (s.flags.gwDown) {
    add('critical', 'gw-down', 'El módem no responde', `No hay respuesta de ${gw}.`,
      ['Revisa que el cable de red de la PC esté bien conectado.', 'Apaga el módem 30 segundos y vuelve a prenderlo.']);
  } else if (s.gwLoss >= 5) {
    add('serious', 'gw-loss', 'Se pierden paquetes entre esta PC y el módem',
      `${s.gwLoss}% de pérdida en el último minuto. Por cable debería ser 0%.`,
      ['Cambia el cable de red o el puerto del módem.', 'Si la PC usa WiFi, acércala o usa 5 GHz.']);
  }
  if (s.flags.netDown) {
    add('critical', 'net-down', 'Internet caído (el módem sí responde)', 'La falla está del módem hacia afuera: línea del proveedor.',
      ['Reinicia el módem.', 'Si sigue, reporta al proveedor (Izzi: 800 120 0000) y menciona los datos de la pestaña Línea.']);
  } else if (s.netLoss >= 5 && s.gwLoss < 5) {
    add('serious', 'net-loss', 'Pérdida hacia internet con el módem bien',
      `${s.netLoss}% de pérdida hacia internet pero 0% al módem: el problema está en la línea o en el proveedor.`,
      ['Revisa la pestaña Línea (potencia y SNR).', 'Si persiste, repórtalo al proveedor con estos datos.']);
  }

  // ------------------------------------------------------------- cable
  const c = s.cable;
  if (c && c.available) {
    if (c.verdict === 'bad') {
      add('serious', 'cable-bad', 'La línea de cable está fuera de rango', c.issues.join('; ') + '.',
        ['Revisa que el cable coaxial esté bien apretado en el módem y en la pared.',
          'Quita divisores (splitters) que no uses entre la pared y el módem.',
          'Llama al proveedor para que revise la señal: con estos valores tienen que mandar técnico.']);
    } else if (c.verdict === 'warn') {
      add('warning', 'cable-warn', 'La línea de cable está al límite', c.issues.join('; ') + '.',
        ['Aprieta el conector coaxial del módem y de la pared.',
          'Si hay un divisor (splitter) antes del módem, quítalo si no lo necesitas.',
          'Una potencia de subida alta puede causar microcortes; si notas caídas, repórtalo al proveedor.']);
    } else {
      add('good', 'cable-ok', 'La línea de cable está sana',
        `Bajada ${c.summary.downPowerAvg} dBmV, SNR mínima ${c.summary.snrMin} dB, subida máx. ${c.summary.upPowerMax} dBmV.`);
    }
    if (c.newUncorrectables > 50) {
      add('warning', 'cable-unc', 'Errores en la línea de cable', `${c.newUncorrectables} errores incorregibles nuevos en el último minuto.`,
        ['Si aparecen seguido, es ruido en el cable: revisa conectores y repórtalo.']);
    }
  }

  // ------------------------------------------------------- cuartos (WiFi)
  const tested = rooms.filter((r) => r.down !== null);
  if (!tested.length) {
    add('tip', 'survey', 'Mide la señal en cada cuarto con tu celular',
      'Así la app sabe dónde está buena la señal, dónde conviene poner el repetidor y qué red usar en cada lugar.',
      ['Abre esta página en el celular (botón "Abrir en el celular" arriba).',
        'Ve a la pestaña Probar, escribe el nombre del cuarto y toca "Probar aquí".',
        'Repite en cada cuarto. Si tienes dos redes (2.4 y 5 GHz, o módem y repetidor), prueba con cada una.']);
  } else {
    const best = tested[0];
    const weak = tested.filter((r) => r.score !== null && r.score < 45);
    if (weak.length) {
      const w = weak.map((r) => `${r.room} (${r.down} Mbps, ${r.ping} ms)`).join(', ');
      add('warning', 'weak-rooms', `Señal débil en: ${weak.map((r) => r.room).join(', ')}`,
        `Comparado con ${best.room} (${best.down} Mbps): ${w}.`,
        ['Si tienes un segundo router/repetidor cableado, ponlo en el cuarto débil o a medio camino, en alto y sin muebles enfrente.',
          'Dale a cada router un canal distinto en 2.4 GHz (1, 6 u 11) para que no se estorben.',
          'En esos cuartos usa la red de 2.4 GHz: llega más lejos aunque sea más lenta. Cerca del módem usa 5 GHz.',
          'Evita que la señal cruce microondas, refrigerador, espejos, peceras o paredes con tubería.']);
    }
    for (const r of tested) {
      if (r.byNet.length >= 2) {
        const [a, b] = r.byNet;
        if (a.down && b.down && a.down > b.down * 1.4) {
          add('tip', 'net-' + r.room, `En ${r.room} conéctate a "${a.network}"`,
            `Ahí da ${a.down} Mbps contra ${b.down} Mbps de "${b.network}".`, []);
        }
      }
      if (r.jitter !== null && r.jitter > 25) {
        add('warning', 'jitter-' + r.room, `Señal inestable en ${r.room}`,
          `La latencia varía ±${Math.round(r.jitter)} ms: en videollamadas o juegos se nota como cortes.`,
          ['Suele ser interferencia o señal al límite. Acerca el punto de acceso o cambia de canal.']);
      }
    }
  }

  // ----------------------------------------------- dónde está el módem
  const modemRoom = s.net.gateway && m.settings.places[s.net.gateway];
  if (!modemRoom) {
    add('tip', 'place-modem', 'Indica en qué cuarto está tu módem',
      'Con eso la app relaciona las pruebas de cada cuarto con la distancia al módem y te dice dónde conviene el repetidor.',
      ['Pestaña Casa → "¿Dónde está?" → elige el cuarto del módem y de cada repetidor.']);
  } else if (tested.length >= 2) {
    const mr = tested.find((r) => r.room === modemRoom);
    if (mr && tested[0].room !== modemRoom && tested[0].down > (mr.down || 0) * 1.3) {
      add('tip', 'modem-not-best', `La mejor señal no está junto al módem`,
        `${tested[0].room} da más que ${modemRoom} (donde está el módem). Probablemente ahí llega el repetidor o el módem está tapado.`,
        ['Revisa que el módem no esté en el piso, dentro de un mueble o detrás de la TV.']);
    }
  }

  // ------------------------------------------- WiFi de la PC / vecinos
  if (s.wifi) {
    if (s.wifi.signal !== null && s.wifi.signal < 55) {
      add('warning', 'pc-wifi', 'La WiFi de esta PC es débil', `Señal ${s.wifi.signal}% en canal ${s.wifi.channel}.`,
        ['Si se puede, conéctala por cable: es más estable para jugar y descargar.']);
    }
    const n24 = m.wifiNeighbors.filter((n) => n.channel && n.channel <= 14);
    if (n24.length >= 4) {
      const count = {};
      for (const n of n24) {
        const near = [1, 6, 11].reduce((a, b) => (Math.abs(b - n.channel) < Math.abs(a - n.channel) ? b : a));
        count[near] = (count[near] || 0) + 1;
      }
      const best = Object.entries(count).sort((a, b) => a[1] - b[1])[0];
      add('tip', 'channels', `Canal 2.4 GHz menos saturado: ${best[0]}`,
        `Redes cercanas por canal: ${Object.entries(count).map(([k, v]) => `canal ${k}: ${v}`).join(', ')}.`,
        ['Pon tu red de 2.4 GHz en ese canal (si tu módem lo permite) o pídeselo a tu proveedor.']);
    }
  }

  // ------------------------------------------ dispositivos sin reconocer
  const unknown = [...m.devices.values()].filter((d) => d.online && d.mac && !m.settings.trusted[d.mac] && !['self', 'modem'].includes(d.kind) && d.ip !== s.net.gateway);
  if (unknown.length) {
    add(unknown.length > 3 ? 'warning' : 'tip', 'untrusted', `${unknown.length} dispositivo${unknown.length === 1 ? '' : 's'} sin marcar como tuyo${unknown.length === 1 ? '' : 's'}`,
      unknown.slice(0, 8).map((d) => `${m.deviceName(d)} (${d.ip})`).join(', ') + (unknown.length > 8 ? '…' : '') + '.',
      ['En Dispositivos toca cada uno y marca "Es mío" si lo reconoces. Así la app te avisa cuando se conecte uno nuevo.',
        'Para ver su nombre real, pega la lista de clientes de tu router (botón "Importar lista del router").',
        'Si uno no es tuyo: bloquéalo por MAC en el router (Inalámbrico → Control de direcciones MAC) y cambia la contraseña del WiFi; apaga WPS.']);
  }

  // ----------------------------------------------- dispositivos
  const flaky = [...m.devices.values()].filter((d) => (d.drops || 0) >= 3 && d.kind !== 'phone');
  if (flaky.length) {
    add('warning', 'flaky', 'Dispositivos que se desconectan seguido',
      flaky.map((d) => `${m.deviceName(d)} (${d.drops} veces)`).join(', ') + '.',
      ['Si es una TV o Chromecast, conéctalo al punto de acceso más cercano o por cable.',
        'Los celulares se "desconectan" al dormir para ahorrar batería; eso es normal.']);
  }

  // ------------------------------------------------ seguridad (checklist)
  const checks = [
    ['wps', 'Desactiva WPS en el módem y en el repetidor', 'WPS permite conectarse con un PIN que se puede adivinar.'],
    ['wpa2', 'Usa WPA2-AES o WPA3', 'Evita WEP o "WPA/TKIP": se rompen fácil.'],
    ['adminpass', 'Cambia la contraseña de administrador del módem', 'La de fábrica viene en la etiqueta y cualquiera que la vea entra a tu configuración.'],
    ['guest', 'Pon las visitas y aparatos inteligentes en una red de invitados', 'Así no ven tus computadoras ni tus archivos.'],
    ['firmware', 'Mantén actualizado el firmware del repetidor', 'En el Telmex/Huawei: Mantenimiento → Actualizar.'],
  ];
  for (const [id, title, why] of checks) {
    if (!m.settings.checklist[id]) add('tip', 'sec-' + id, title, why, []).security = true;
  }

  // ---------------------------------------- consejos generales de ubicación
  add('tip', 'placement', 'Dónde poner el módem y el repetidor',
    'La señal WiFi se va en todas direcciones desde las antenas; lo que la frena son paredes, metal y agua.',
    ['En alto (a la altura del pecho o más), en un lugar central de la casa, nunca en el piso.',
      'Fuera de muebles cerrados, sin la TV, espejos o peceras enfrente.',
      'Lejos del microondas, teléfonos inalámbricos y monitores de bebé (usan 2.4 GHz).',
      'Si tiene antenas: una vertical y una horizontal cubre mejor varios pisos.',
      'El repetidor va a medio camino entre el módem y donde falta señal, o cableado en el cuarto débil (mejor).']);

  const order = { critical: 0, serious: 1, warning: 2, tip: 3, good: 4 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

module.exports = { advice };
