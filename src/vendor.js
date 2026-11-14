'use strict';
// Fabricante de un dispositivo a partir de su MAC.
// Primero una tabla corta con marcas comunes en casa; si no está, se consulta
// api.macvendors.com (1 consulta por segundo como máximo) y se guarda en caché.

const OUI = {
  // Módems / routers
  'ec:a9:40': 'ARRIS', '98:f7:81': 'ARRIS', '00:1d:d0': 'ARRIS', '14:c0:3e': 'ARRIS', '20:3d:66': 'ARRIS',
  '44:1c:12': 'ARRIS', '5c:e3:0e': 'ARRIS', 'a8:9f:ec': 'ARRIS', 'e8:ed:05': 'ARRIS', 'f8:a0:97': 'ARRIS',
  '00:e0:fc': 'Huawei', '48:46:fb': 'Huawei', '70:72:3c': 'Huawei', '9c:28:ef': 'Huawei', 'e0:24:7f': 'Huawei',
  '00:25:9e': 'Huawei', '04:c0:6f': 'Huawei', '28:6e:d4': 'Huawei', 'ac:e2:15': 'Huawei',
  '50:c7:bf': 'TP-Link', '98:da:c4': 'TP-Link', 'f4:f2:6d': 'TP-Link', '60:32:b1': 'TP-Link', 'b0:be:76': 'TP-Link',
  '00:1f:33': 'Netgear', 'a0:40:a0': 'Netgear', '38:94:ed': 'Netgear',
  // Google / Chromecast
  'f4:f5:d8': 'Google', 'f4:f5:e8': 'Google', '54:60:09': 'Google', '6c:ad:f8': 'Google', 'a4:77:33': 'Google',
  'd8:6c:63': 'Google', '1c:f2:9a': 'Google', '20:df:b9': 'Google', '3c:28:6d': 'Google', '48:d6:d5': 'Google',
  // Samsung
  '8c:79:f5': 'Samsung', 'a0:cb:fd': 'Samsung', 'f0:5b:7b': 'Samsung', '64:1c:ae': 'Samsung', '84:25:19': 'Samsung',
  'cc:6e:a4': 'Samsung', '5c:49:7d': 'Samsung', 'e8:e5:d6': 'Samsung', '24:4b:03': 'Samsung',
  // Apple
  'a4:83:e7': 'Apple', 'f0:18:98': 'Apple', '3c:22:fb': 'Apple', 'bc:d0:74': 'Apple', '88:66:5a': 'Apple',
  // Otros comunes
  'fc:a1:83': 'Amazon', '44:65:0d': 'Amazon', '68:54:fd': 'Amazon', '74:c2:46': 'Amazon',
  '24:6f:28': 'Espressif (IoT)', '84:cc:a8': 'Espressif (IoT)', 'ec:fa:bc': 'Espressif (IoT)', '30:ae:a4': 'Espressif (IoT)',
  '00:04:4b': 'NVIDIA', '7c:2f:80': 'Gigaset', '28:39:5e': 'Samsung', 'b4:2e:99': 'Gigabyte',
  '00:d8:61': 'Micro-Star (MSI)', '04:42:1a': 'ASUS', '1c:87:2c': 'ASUS', 'd8:bb:c1': 'Micro-Star (MSI)',
  '08:00:27': 'VirtualBox', '0a:00:27': 'VirtualBox', '00:50:56': 'VMware', '00:15:5d': 'Hyper-V',
  '64:b4:73': 'Xiaomi', '78:11:dc': 'Xiaomi', '50:ec:50': 'Xiaomi', '28:6c:07': 'Xiaomi',
  '00:09:b0': 'Onkyo', '00:1a:11': 'Google', 'b8:27:eb': 'Raspberry Pi', 'dc:a6:32': 'Raspberry Pi',
  '00:0d:4b': 'Roku', 'b0:a7:37': 'Roku', 'cc:6d:a0': 'Roku', '00:24:e4': 'Withings', '7c:bb:8a': 'Nintendo',
  '98:41:5c': 'Nintendo', '00:d9:d1': 'Sony', 'fc:0f:e6': 'Sony', '70:9e:29': 'Sony', 'a8:e3:ee': 'Sony',
  'c4:36:6c': 'LG', '64:99:5d': 'LG', '78:5d:c8': 'LG', '00:e0:91': 'LG', '10:2b:41': 'Samsung',
  '00:1e:c2': 'Apple', 'd4:6e:0e': 'TP-Link', 'e4:5f:01': 'Raspberry Pi', '18:b4:30': 'Nest',
};

/** El segundo bit menos significativo del primer byte indica MAC "privada"/aleatoria (celulares modernos). */
function isRandomMac(mac) {
  const b = parseInt(mac.slice(0, 2), 16);
  return Number.isFinite(b) && (b & 0x02) === 0x02;
}

/** "HUAWEI TECHNOLOGIES CO.,LTD" → "Huawei", "Arris Group, Inc." → "Arris". */
function cleanVendor(v) {
  if (!v) return v;
  let s = String(v).replace(/[,.]?\s*(technologies|technology|co\.?,?\s*ltd\.?|ltd\.?|inc\.?|corporation|corp\.?|limited|gmbh|s\.?a\.?|llc|group|electronics|communications?|international|mobile|telecom|device|devices)\b\.?/gi, ' ')
    .replace(/[,.]+$/g, '').replace(/\s+/g, ' ').trim();
  if (!s) s = String(v).trim();
  if (s === s.toUpperCase() && s.length > 3) s = s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return s.slice(0, 30);
}

class VendorLookup {
  constructor(store) {
    this.store = store;
    this.cache = store.load('vendors', {});
    this.queue = [];
    this.busy = false;
  }

  get(mac) {
    if (!mac) return '';
    if (isRandomMac(mac)) return 'MAC privada (celular/tablet)';
    const p = mac.slice(0, 8);
    if (OUI[p]) return OUI[p];
    if (this.cache[p] !== undefined) return cleanVendor(this.cache[p]);
    if (!this.queue.includes(p)) this.queue.push(p);
    this.pump();
    return '';
  }

  async pump() {
    if (this.busy || !this.queue.length || process.env.WIFIMONITOR_OFFLINE) return;
    this.busy = true;
    while (this.queue.length) {
      const p = this.queue.shift();
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 4000);
        const r = await fetch('https://api.macvendors.com/' + encodeURIComponent(p), { signal: ctrl.signal });
        clearTimeout(t);
        if (r.status === 200) this.cache[p] = (await r.text()).trim().slice(0, 60);
        else if (r.status === 404) this.cache[p] = 'Desconocido';
        // 429 u otros: se reintenta más tarde
        this.store.save('vendors', this.cache);
      } catch { /* sin internet: se reintenta luego */ }
      await new Promise((r) => setTimeout(r, 1300));
    }
    this.busy = false;
  }
}

/** Adivina qué tipo de aparato es por su fabricante. */
function guessKind(vendor, ip, gateway) {
  const v = (vendor || '').toLowerCase();
  if (ip === gateway) return 'modem';
  if (/arris|technicolor|sagemcom|hitron|ubee/.test(v)) return 'modem';
  if (/huawei|tp-link|netgear|zte|mercusys|tenda|d-link|linksys|ubiquiti|mikrotik/.test(v)) return 'router';
  if (/google|chromecast|roku|amazon|nvidia|lg|sony|tcl|hisense|vizio/.test(v)) return 'tv';
  if (/privada|apple|samsung|xiaomi|motorola|oppo|vivo|oneplus|huawei device/.test(v)) return 'phone';
  if (/espressif|tuya|shelly|sonoff|nest|ring|withings/.test(v)) return 'iot';
  if (/nintendo|sony interactive|microsoft/.test(v)) return 'console';
  if (/intel|realtek|micro-star|msi|asus|gigabyte|dell|lenovo|hp|hewlett|acer|azurewave|liteon/.test(v)) return 'pc';
  if (/virtualbox|vmware|hyper-v/.test(v)) return 'vm';
  return 'unknown';
}

module.exports = { VendorLookup, guessKind, isRandomMac, cleanVendor };
