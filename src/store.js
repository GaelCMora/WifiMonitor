'use strict';
// Guardado sencillo en ~/.wifimonitor (JSON y CSV diarios).

const fs = require('fs');
const path = require('path');
const os = require('os');

class Store {
  constructor(dir) {
    this.dir = dir || process.env.WIFIMONITOR_HOME || path.join(os.homedir(), '.wifimonitor');
    fs.mkdirSync(path.join(this.dir, 'logs'), { recursive: true });
  }

  file(name) { return path.join(this.dir, name + '.json'); }

  load(name, def) {
    try { return JSON.parse(fs.readFileSync(this.file(name), 'utf8')); } catch { return def; }
  }

  save(name, data) {
    const f = this.file(name);
    try {
      fs.writeFileSync(f + '.tmp', JSON.stringify(data, null, 1));
      fs.renameSync(f + '.tmp', f);
    } catch { /* disco lleno o sin permisos: se ignora */ }
  }

  static day(t = Date.now()) {
    const d = new Date(t);
    return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  }

  appendCsv(prefix, header, row, t = Date.now()) {
    const f = path.join(this.dir, 'logs', `${prefix}_${Store.day(t)}.csv`);
    const line = row.map((v) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',') + '\n';
    try {
      if (!fs.existsSync(f)) fs.writeFileSync(f, header.join(',') + '\n');
      fs.appendFileSync(f, line);
    } catch { /* ignorar */ }
  }

  appendText(prefix, line, t = Date.now()) {
    try { fs.appendFileSync(path.join(this.dir, 'logs', `${prefix}_${Store.day(t)}.txt`), line + '\n'); } catch { /* */ }
  }

  logFiles() {
    try {
      return fs.readdirSync(path.join(this.dir, 'logs')).sort().reverse()
        .map((n) => ({ name: n, size: fs.statSync(path.join(this.dir, 'logs', n)).size }));
    } catch { return []; }
  }

  logPath(name) {
    const safe = path.basename(name);
    return path.join(this.dir, 'logs', safe);
  }
}

module.exports = { Store };
