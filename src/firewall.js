'use strict';
// Revisa si el Firewall de Windows deja entrar a otros dispositivos (el celular) al panel, y lo arregla.
// Solo aplica en Windows. Para arreglarlo se pide permiso de administrador (aparece la ventana de UAC).

const { execFile } = require('child_process');

const IS_WIN = process.platform === 'win32';
const RULE = 'WiFi Monitor';

function ps(script, timeoutMs = 20000) {
  return new Promise((resolve) => {
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout: timeoutMs, windowsHide: true, encoding: 'utf8', maxBuffer: 4 << 20 },
      (err, stdout) => resolve(err && !stdout ? '' : String(stdout || '')));
  });
}

const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";

/**
 * Devuelve { applies, ok, reason, profile, firewallOn, ruleOk, nodeAllowed, nodeBlocked }.
 * ok=false significa que muy probablemente el celular no podrá abrir el panel.
 */
async function check(port) {
  if (!IS_WIN) return { applies: false, ok: true };
  const script = `
$ErrorActionPreference='SilentlyContinue'
$cps = @(Get-NetConnectionProfile)
$cp = $cps | Where-Object { "$($_.IPv4Connectivity)" -eq 'Internet' } | Select-Object -First 1
if (-not $cp) { $cp = $cps | Select-Object -First 1 }
$cat = "$($cp.NetworkCategory)"
$prof = if ($cat -eq 'DomainAuthenticated') { 'Domain' } else { $cat }
$fw = [bool]((Get-NetFirewallProfile -Name $prof).Enabled)
$rule = @(Get-NetFirewallRule -DisplayName ${q(RULE)} | Where-Object { "$($_.Enabled)" -eq 'True' -and "$($_.Action)" -eq 'Allow' -and "$($_.Direction)" -eq 'Inbound' }).Count
$node = @(Get-NetFirewallApplicationFilter -Program ${q(process.execPath)} | Get-NetFirewallRule | Where-Object { "$($_.Enabled)" -eq 'True' -and "$($_.Direction)" -eq 'Inbound' } | ForEach-Object { @{ a = "$($_.Action)"; p = "$($_.Profile)" } })
@{ profile = $prof; fw = $fw; rule = $rule; node = $node } | ConvertTo-Json -Depth 4 -Compress`;
  const out = await ps(script);
  let d;
  try { d = JSON.parse(out.trim()); } catch { return { applies: true, ok: true, unknown: true, reason: 'No se pudo revisar el Firewall.' }; }
  const profile = d.profile || 'Public';
  const covers = (p) => /Any/i.test(p) || new RegExp(profile, 'i').test(p) || p === '0';
  const node = [].concat(d.node || []);
  const nodeBlocked = node.some((r) => /Block/i.test(r.a) && covers(r.p));
  const nodeAllowed = node.some((r) => /Allow/i.test(r.a) && covers(r.p));
  const ruleOk = d.rule > 0;
  const firewallOn = !!d.fw;
  let ok = true, reason = '';
  if (firewallOn && nodeBlocked) { ok = false; reason = `El Firewall tiene una regla que BLOQUEA a Node.js en redes "${profile === 'Public' ? 'Públicas' : profile}".`; }
  else if (firewallOn && !ruleOk && !nodeAllowed) { ok = false; reason = `El Firewall no tiene permiso para el puerto ${port} en tu red (perfil "${profile === 'Public' ? 'Pública' : profile === 'Private' ? 'Privada' : profile}").`; }
  return { applies: true, ok, reason, profile, firewallOn, ruleOk, nodeAllowed, nodeBlocked };
}

/** Abre una ventana de permiso de administrador y crea la regla. Devuelve cuando el usuario responde. */
async function fix(port) {
  if (!IS_WIN) return { ok: false, error: 'Solo aplica en Windows.' };
  const inner = `
Remove-NetFirewallRule -DisplayName ${q(RULE)} -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName ${q(RULE)} -Description 'Permite abrir WiFi Monitor desde el celular en la red de la casa' -Direction Inbound -Action Allow -Protocol TCP -LocalPort ${Number(port)} -Profile Any | Out-Null
Get-NetFirewallApplicationFilter -Program ${q(process.execPath)} -ErrorAction SilentlyContinue | Get-NetFirewallRule | Where-Object { "$($_.Direction)" -eq 'Inbound' -and "$($_.Action)" -eq 'Block' } | Disable-NetFirewallRule`;
  const b64 = Buffer.from(inner, 'utf16le').toString('base64');
  const outer = `try { $p = Start-Process powershell -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','${b64}'; exit $p.ExitCode } catch { Write-Output 'CANCELADO'; exit 1 }`;
  const out = await ps(outer, 120000);
  if (/CANCELADO/.test(out)) return { ok: false, error: 'Se canceló el permiso de administrador.' };
  const c = await check(port);
  return { ok: c.ok, check: c };
}

module.exports = { check, fix, RULE };
