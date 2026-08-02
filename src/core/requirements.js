/**
 * Job execution requirements (preconditions) for JM2
 *
 * A job may declare a list of requirements (e.g. "ac", "wifi", "ssid:Home",
 * "disk-free:10", "online"). Before a scheduled run, the daemon evaluates them;
 * if any is not met, the run is skipped (and the reason is logged).
 *
 * Requirements are stored on the job as an array of strings for easy
 * serialization and to preserve spaces in paths/scripts. Missing/empty means
 * "no requirements" (always run), which keeps existing jobs backward compatible.
 *
 * Policy:
 *  - A requirement that cannot be evaluated on the current platform is treated
 *    as MET (the job runs anyway), EXCEPT `script:` which is treated as NOT MET
 *    when it throws or times out.
 */

import { existsSync, statfsSync, readdirSync, readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { connect } from 'node:net';
import { createRequire } from 'node:module';

const execFileAsync = promisify(execFile);
const require_ = createRequire(import.meta.url);

/** Timeout for an inline `script:` requirement. */
export const SCRIPT_TIMEOUT_MS = 5000;

/** Requirement types that take no argument. */
const NO_ARG_TYPES = new Set([
  'ac',
  'wifi',
  'ethernet',
  'online',
  'vpn',
  'not-vpn',
  'screen-locked',
  'screen-unlocked',
]);

/** Requirement types that require an argument. */
const ARG_TYPES = new Set(['ssid', 'disk-free', 'path-exists', 'script']);

/** All recognised requirement types (for help/validation). */
export const REQUIREMENT_TYPES = [...NO_ARG_TYPES, ...ARG_TYPES];

/**
 * Platforms on which each requirement type can actually be detected.
 * A type not listed for the current platform is "unevaluable" and, per policy,
 * treated as met (the job runs anyway) — so we warn about it at add/edit time.
 * Types absent from this map are considered supported everywhere.
 */
export const PLATFORM_SUPPORT = {
  ac: ['darwin', 'linux', 'win32'],
  wifi: ['darwin', 'linux', 'win32'],
  ssid: ['darwin', 'linux', 'win32'],
  ethernet: ['darwin', 'linux', 'win32'],
  online: ['darwin', 'linux', 'win32'],
  vpn: ['darwin', 'linux', 'win32'],
  'not-vpn': ['darwin', 'linux', 'win32'],
  'disk-free': ['darwin', 'linux', 'win32'],
  'path-exists': ['darwin', 'linux', 'win32'],
  'screen-locked': ['darwin'],
  'screen-unlocked': ['darwin'],
  script: ['darwin', 'linux', 'win32'],
};

/**
 * Whether a requirement type is detectable on the given platform.
 * @param {string} type - Requirement type
 * @param {string} [platform] - Platform (defaults to the current one)
 * @returns {boolean}
 */
export function isRequirementSupported(type, platform = process.platform) {
  const platforms = PLATFORM_SUPPORT[type];
  return !platforms || platforms.includes(platform);
}

/**
 * From a list of requirement strings, return the ones whose type is not
 * detectable on the given platform. Invalid strings are ignored.
 * @param {Array<string>} requirements
 * @param {string} [platform] - Platform (defaults to the current one)
 * @returns {Array<{ requirement: string, type: string }>}
 */
export function unsupportedRequirements(requirements, platform = process.platform) {
  const result = [];
  for (const raw of requirements || []) {
    let parsed;
    try {
      parsed = parseRequirement(raw);
    } catch {
      continue;
    }
    if (!isRequirementSupported(parsed.type, platform)) {
      result.push({ requirement: raw, type: parsed.type });
    }
  }
  return result;
}

/**
 * Parse a requirement string into its type and argument.
 * Splits on the FIRST colon only, so arguments may themselves contain colons
 * (e.g. paths, scripts, "disk-free:10:/some:path").
 * @param {string} raw - Raw requirement string
 * @returns {{ raw: string, type: string, arg: string|null }}
 * @throws {Error} If the requirement is empty or of an unknown type
 */
export function parseRequirement(raw) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) {
    throw new Error('requirement is empty');
  }

  const colon = trimmed.indexOf(':');
  const type = (colon === -1 ? trimmed : trimmed.slice(0, colon)).toLowerCase();
  const arg = colon === -1 ? null : trimmed.slice(colon + 1);

  if (!NO_ARG_TYPES.has(type) && !ARG_TYPES.has(type)) {
    throw new Error(`unknown requirement type "${type}"`);
  }

  if (ARG_TYPES.has(type)) {
    if (arg === null || arg.trim() === '') {
      throw new Error(`requirement "${type}" needs a value (e.g. "${type}:...")`);
    }
    if (type === 'disk-free') {
      // Validate the size portion up front.
      parseDiskFreeArg(arg);
    }
  } else if (arg !== null) {
    throw new Error(`requirement "${type}" does not take a value`);
  }

  return { raw: trimmed, type, arg };
}

/**
 * Parse the argument of a `disk-free` requirement.
 * Format: "<gigabytes>[:<path>]" where the size is in GB (a bare number or a
 * number with a gb/g suffix). Path defaults to "/".
 * @param {string} arg
 * @returns {{ bytes: number, path: string, gb: number }}
 * @throws {Error} If the size is invalid
 */
export function parseDiskFreeArg(arg) {
  const firstColon = String(arg).indexOf(':');
  const sizePart = firstColon === -1 ? arg : arg.slice(0, firstColon);
  const path = firstColon === -1 ? '/' : arg.slice(firstColon + 1).trim() || '/';

  const match = String(sizePart).trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(gb|g)?$/);
  if (!match) {
    throw new Error(`invalid disk-free size "${sizePart}" (expected gigabytes, e.g. "10" or "10gb")`);
  }

  const gb = parseFloat(match[1]);
  return { bytes: Math.floor(gb * 1024 * 1024 * 1024), path, gb };
}

/**
 * Validate an array of requirement strings.
 * @param {Array<string>} requirements
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateRequirements(requirements) {
  const errors = [];
  if (requirements === undefined || requirements === null) {
    return { valid: true, errors };
  }
  if (!Array.isArray(requirements)) {
    return { valid: false, errors: ['requirements must be an array of strings'] };
  }
  for (const raw of requirements) {
    if (typeof raw !== 'string') {
      errors.push('each requirement must be a string');
      continue;
    }
    try {
      parseRequirement(raw);
    } catch (error) {
      errors.push(`invalid requirement "${raw}": ${error.message}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Normalize an array of requirement strings: trim, drop empties, dedupe
 * (preserving order and case — paths, SSIDs, and scripts are case-sensitive).
 * @param {Array<string>} requirements
 * @returns {string[]}
 */
export function normalizeRequirements(requirements) {
  if (!Array.isArray(requirements)) {
    return [];
  }
  const seen = new Set();
  const result = [];
  for (const raw of requirements) {
    if (typeof raw !== 'string') {
      continue;
    }
    const trimmed = raw.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return result;
}

/**
 * Evaluate all of a job's requirements.
 * @param {Array<string>} requirements - Requirement strings
 * @param {object} [context] - Evaluation context ({ job })
 * @returns {Promise<{ met: boolean, failures: Array<{requirement: string, reason: string}>, unevaluable: Array<{requirement: string, reason: string}> }>}
 */
export async function checkRequirements(requirements, context = {}) {
  if (!Array.isArray(requirements) || requirements.length === 0) {
    return { met: true, failures: [], unevaluable: [] };
  }

  const evaluations = await Promise.all(
    requirements.map(async raw => {
      let parsed;
      try {
        parsed = parseRequirement(raw);
      } catch (error) {
        return { kind: 'fail', requirement: raw, reason: `invalid requirement (${error.message})` };
      }

      let result;
      try {
        result = await checkOne(parsed, context);
      } catch (error) {
        // A checker itself failing is treated as unevaluable (met) per policy,
        // except for scripts which are handled inside checkScript.
        result = { met: true, evaluable: false, observed: `check error: ${error.message}` };
      }

      // Scripts: a throw/timeout means NOT met (handled in checkScript).
      if (parsed.type === 'script') {
        return result.met
          ? { kind: 'ok' }
          : { kind: 'fail', requirement: raw, reason: result.observed };
      }

      // Unevaluable requirements are treated as met (run anyway), but surfaced
      // so the caller can note them.
      if (!result.evaluable) {
        return { kind: 'unevaluable', requirement: raw, reason: result.observed };
      }

      return result.met
        ? { kind: 'ok' }
        : { kind: 'fail', requirement: raw, reason: result.observed };
    })
  );

  const pick = kind =>
    evaluations
      .filter(e => e.kind === kind)
      .map(({ requirement, reason }) => ({ requirement, reason }));

  const failures = pick('fail');
  return { met: failures.length === 0, failures, unevaluable: pick('unevaluable') };
}

/**
 * Dispatch a single parsed requirement to its checker.
 * @param {{type: string, arg: string|null}} parsed
 * @param {object} context
 * @returns {Promise<{met: boolean, evaluable: boolean, observed: string}>}
 */
async function checkOne(parsed, context) {
  switch (parsed.type) {
    case 'ac':
      return checkAc();
    case 'wifi':
      return checkWifi();
    case 'ssid':
      return checkSsid(parsed.arg);
    case 'ethernet':
      return checkEthernet();
    case 'online':
      return checkOnline();
    case 'vpn':
      return checkVpn(true);
    case 'not-vpn':
      return checkVpn(false);
    case 'disk-free':
      return checkDiskFree(parsed.arg);
    case 'path-exists':
      return checkPathExists(parsed.arg);
    case 'screen-locked':
      return checkScreenLock(true);
    case 'screen-unlocked':
      return checkScreenLock(false);
    case 'script':
      return checkScript(parsed.arg, context);
    default:
      return { met: true, evaluable: false, observed: 'unknown requirement' };
  }
}

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

/**
 * Run a command and return stdout, or null if the command is unavailable.
 * A non-zero exit that still produced stdout (e.g. `pgrep` with no match)
 * returns that stdout rather than null.
 */
async function run(cmd, args, timeoutMs = 4000) {
  try {
    const { stdout } = await execFileAsync(cmd, args, { timeout: timeoutMs });
    return stdout;
  } catch (error) {
    if (error && typeof error.stdout === 'string') {
      return error.stdout;
    }
    return null;
  }
}

/** Human-readable GB string. */
function gbStr(bytes) {
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

const UNEVALUABLE = observed => ({ met: true, evaluable: false, observed });

// ---------------------------------------------------------------------------
// Checkers
// ---------------------------------------------------------------------------

async function checkAc() {
  if (process.platform === 'darwin') {
    const out = await run('pmset', ['-g', 'batt']);
    if (out == null) {
      return UNEVALUABLE('could not read power source');
    }
    if (/AC Power/.test(out)) {
      return { met: true, evaluable: true, observed: 'on AC power' };
    }
    if (/Battery Power/.test(out)) {
      return { met: false, evaluable: true, observed: 'on battery' };
    }
    return UNEVALUABLE('unknown power source');
  }

  if (process.platform === 'linux') {
    try {
      const base = '/sys/class/power_supply';
      const entries = readdirSync(base);
      let hasMains = false;
      let mainsOnline = false;
      for (const entry of entries) {
        let type;
        try {
          type = readFileSync(`${base}/${entry}/type`, 'utf8').trim();
        } catch {
          continue;
        }
        if (type === 'Mains') {
          hasMains = true;
          try {
            if (readFileSync(`${base}/${entry}/online`, 'utf8').trim() === '1') {
              mainsOnline = true;
            }
          } catch {
            // ignore
          }
        }
      }
      if (!hasMains) {
        return UNEVALUABLE('no AC adapter info');
      }
      return {
        met: mainsOnline,
        evaluable: true,
        observed: mainsOnline ? 'on AC power' : 'on battery',
      };
    } catch {
      return UNEVALUABLE('could not read power source');
    }
  }

  if (process.platform === 'win32') {
    // Win32_Battery.BatteryStatus: 1 = discharging (on battery), 2 = on AC,
    // 3-9,11 = charging/charged (plugged in), 10 = undefined. No battery
    // (desktop) => empty output => treat as AC.
    const out = await run(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        'Get-CimInstance Win32_Battery | Select-Object -First 1 -ExpandProperty BatteryStatus',
      ],
      6000
    );
    if (out == null) {
      return UNEVALUABLE('could not read power source');
    }
    const value = out.trim();
    if (value === '') {
      return { met: true, evaluable: true, observed: 'on AC power (no battery)' };
    }
    const code = parseInt(value, 10);
    if (Number.isNaN(code) || code === 10) {
      return UNEVALUABLE('unknown power source');
    }
    const onAc = code !== 1;
    return { met: onAc, evaluable: true, observed: onAc ? 'on AC power' : 'on battery' };
  }

  return UNEVALUABLE('AC detection not supported on this platform');
}

/**
 * Get Wi-Fi info on the current platform.
 * @returns {Promise<{ok: boolean, device?: string|null, ssid?: string|null, associated?: boolean}>}
 */
async function getWifiInfo() {
  if (process.platform === 'darwin') {
    const ports = await run('networksetup', ['-listallhardwareports']);
    if (ports == null) {
      return { ok: false };
    }
    const device = findHardwarePortDevice(ports, /Wi-Fi|AirPort/i);
    if (!device) {
      return { ok: true, device: null, ssid: null, associated: false };
    }
    const net = await run('networksetup', ['-getairportnetwork', device]);
    if (net == null) {
      return { ok: false };
    }
    const match = net.match(/Current Wi-Fi Network:\s*(.+)/);
    if (match) {
      return { ok: true, device, ssid: match[1].trim(), associated: true };
    }
    return { ok: true, device, ssid: null, associated: false };
  }

  if (process.platform === 'linux') {
    const ssidOut = await run('iwgetid', ['-r']);
    if (ssidOut != null) {
      const ssid = ssidOut.trim();
      return { ok: true, device: null, ssid: ssid || null, associated: !!ssid };
    }
    const nm = await run('nmcli', ['-t', '-f', 'TYPE,STATE', 'device']);
    if (nm != null) {
      const connected = /(^|\n)wifi:connected/.test(nm);
      return { ok: true, device: null, ssid: null, associated: connected };
    }
    return { ok: false };
  }

  if (process.platform === 'win32') {
    const out = await run('netsh', ['wlan', 'show', 'interfaces'], 6000);
    if (out == null) {
      return { ok: false };
    }
    if (/no wireless interface/i.test(out)) {
      return { ok: true, device: null, ssid: null, associated: false };
    }
    const stateMatch = out.match(/^\s*State\s*:\s*(.+)$/im);
    const connected = stateMatch ? /connected/i.test(stateMatch[1]) : false;
    if (!connected) {
      return { ok: true, device: null, ssid: null, associated: false };
    }
    // Match the SSID line but not BSSID (which starts with "B").
    const ssidMatch = out.match(/^\s*SSID\s*:\s*(.+)$/im);
    const ssid = ssidMatch ? ssidMatch[1].trim() : null;
    return { ok: true, device: null, ssid, associated: true };
  }

  return { ok: false };
}

/**
 * Parse `networksetup -listallhardwareports` for the device of the first
 * hardware port whose name matches `nameRegex`.
 */
function findHardwarePortDevice(portsOutput, nameRegex) {
  const blocks = portsOutput.split(/Hardware Port:/).slice(1);
  for (const block of blocks) {
    const nameLine = block.split('\n')[0] || '';
    if (nameRegex.test(nameLine)) {
      const deviceMatch = block.match(/Device:\s*(\S+)/);
      if (deviceMatch) {
        return deviceMatch[1];
      }
    }
  }
  return null;
}

/** All hardware-port devices whose name matches `nameRegex`. */
function findHardwarePortDevices(portsOutput, nameRegex) {
  const devices = [];
  const blocks = portsOutput.split(/Hardware Port:/).slice(1);
  for (const block of blocks) {
    const nameLine = block.split('\n')[0] || '';
    if (nameRegex.test(nameLine)) {
      const deviceMatch = block.match(/Device:\s*(\S+)/);
      if (deviceMatch) {
        devices.push(deviceMatch[1]);
      }
    }
  }
  return devices;
}

async function checkWifi() {
  const info = await getWifiInfo();
  if (!info.ok) {
    return UNEVALUABLE('could not determine Wi-Fi state');
  }
  if (info.device === null && info.ssid === null && info.associated === false) {
    // macOS: no Wi-Fi hardware port at all.
    if (process.platform === 'darwin') {
      return { met: false, evaluable: true, observed: 'no Wi-Fi interface' };
    }
  }
  return {
    met: !!info.associated,
    evaluable: true,
    observed: info.associated
      ? `on Wi-Fi${info.ssid ? ` (${info.ssid})` : ''}`
      : 'not connected to Wi-Fi',
  };
}

async function checkSsid(wanted) {
  const info = await getWifiInfo();
  if (!info.ok) {
    return UNEVALUABLE('could not determine current SSID');
  }
  if (!info.associated) {
    return { met: false, evaluable: true, observed: 'not connected to Wi-Fi' };
  }
  if (info.ssid == null) {
    return UNEVALUABLE('connected to Wi-Fi but SSID unknown');
  }
  return {
    met: info.ssid === wanted,
    evaluable: true,
    observed: `current SSID: ${info.ssid}`,
  };
}

async function checkEthernet() {
  if (process.platform === 'darwin') {
    const ports = await run('networksetup', ['-listallhardwareports']);
    if (ports == null) {
      return UNEVALUABLE('could not determine Ethernet state');
    }
    const devices = findHardwarePortDevices(ports, /Ethernet|LAN/i);
    if (devices.length === 0) {
      return { met: false, evaluable: true, observed: 'no Ethernet interface' };
    }
    for (const device of devices) {
      const ifc = await run('ifconfig', [device]);
      if (ifc && /status:\s*active/.test(ifc) && /\binet\b/.test(ifc)) {
        return { met: true, evaluable: true, observed: `Ethernet active (${device})` };
      }
    }
    return { met: false, evaluable: true, observed: 'Ethernet not connected' };
  }

  if (process.platform === 'linux') {
    const nm = await run('nmcli', ['-t', '-f', 'TYPE,STATE', 'device']);
    if (nm != null) {
      const connected = /(^|\n)ethernet:connected/.test(nm);
      return {
        met: connected,
        evaluable: true,
        observed: connected ? 'Ethernet connected' : 'Ethernet not connected',
      };
    }
    return UNEVALUABLE('could not determine Ethernet state');
  }

  if (process.platform === 'win32') {
    // A physical adapter that is Up with 802.3 (wired) media.
    const out = await run(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        "Get-NetAdapter -Physical | Where-Object { $_.Status -eq 'Up' -and $_.PhysicalMediaType -match '802.3' } | Select-Object -First 1 -ExpandProperty Name",
      ],
      6000
    );
    if (out == null) {
      return UNEVALUABLE('could not determine Ethernet state');
    }
    const name = out.trim();
    return {
      met: name !== '',
      evaluable: true,
      observed: name ? `Ethernet connected (${name})` : 'Ethernet not connected',
    };
  }

  return UNEVALUABLE('Ethernet detection not supported on this platform');
}

/**
 * Detect whether a VPN appears to be active (heuristic).
 * @param {boolean} wantActive - true for `vpn`, false for `not-vpn`
 */
async function checkVpn(wantActive) {
  const ifaces = networkInterfaces();
  let activeIf = null;
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (/^(utun|tun|tap|ppp|ipsec|wg|nordlynx|tailscale)/i.test(name)) {
      for (const addr of addrs || []) {
        if (!addr.internal && addr.family === 'IPv4') {
          activeIf = name;
          break;
        }
      }
    }
    if (activeIf) {
      break;
    }
  }

  let openvpnRunning = false;
  if (!activeIf && process.platform !== 'win32') {
    const pgrep = await run('pgrep', ['-x', 'openvpn'], 2000);
    if (pgrep != null && pgrep.trim() !== '') {
      openvpnRunning = true;
    }
  }

  const active = !!activeIf || openvpnRunning;
  const observed = active
    ? `VPN active${activeIf ? ` (${activeIf})` : ' (openvpn process)'}`
    : 'no VPN detected';

  return { met: active === wantActive, evaluable: true, observed };
}

async function checkOnline() {
  const reachable =
    (await tcpProbe('1.1.1.1', 443, 3000)) || (await tcpProbe('8.8.8.8', 53, 3000));
  return {
    met: reachable,
    evaluable: true,
    observed: reachable ? 'internet reachable' : 'no internet connectivity',
  };
}

/** Attempt a TCP connection; resolves true on success. */
function tcpProbe(host, port, timeoutMs) {
  return new Promise(resolve => {
    const socket = connect({ host, port });
    let settled = false;
    const done = ok => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

function checkDiskFree(arg) {
  let parsed;
  try {
    parsed = parseDiskFreeArg(arg);
  } catch (error) {
    return { met: true, evaluable: false, observed: error.message };
  }
  try {
    const stats = statfsSync(parsed.path);
    const free = stats.bavail * stats.bsize;
    return {
      met: free >= parsed.bytes,
      evaluable: true,
      observed: `${gbStr(free)} free on ${parsed.path} (need ${parsed.gb}GB)`,
    };
  } catch {
    return UNEVALUABLE(`could not check free space on ${parsed.path}`);
  }
}

function checkPathExists(path) {
  const exists = existsSync(path);
  return {
    met: exists,
    evaluable: true,
    observed: exists ? `path exists: ${path}` : `path missing: ${path}`,
  };
}

async function checkScreenLock(wantLocked) {
  if (process.platform === 'darwin') {
    const out = await run('ioreg', ['-n', 'Root', '-d1']);
    if (out == null) {
      return UNEVALUABLE('could not determine screen lock state');
    }
    const locked = /CGSSessionScreenIsLocked"\s*=\s*Yes/.test(out);
    return {
      met: locked === wantLocked,
      evaluable: true,
      observed: locked ? 'screen locked' : 'screen unlocked',
    };
  }
  return UNEVALUABLE('screen lock detection not supported on this platform');
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

async function checkScript(body, context) {
  let source = String(body).trim();
  // Allow a bare expression ("os.cpus().length > 4") as well as a full body
  // with an explicit `return`.
  if (!/\breturn\b/.test(source)) {
    source = `return (${source})`;
  }

  let fn;
  try {
    fn = new AsyncFunction('require', 'process', 'os', 'job', 'console', source);
  } catch (error) {
    return { met: false, evaluable: true, observed: `script syntax error: ${error.message}` };
  }

  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`script timed out after ${SCRIPT_TIMEOUT_MS}ms`)),
      SCRIPT_TIMEOUT_MS
    );
  });

  try {
    const result = await Promise.race([
      fn(require_, process, os, context?.job, console),
      timeout,
    ]);
    return {
      met: !!result,
      evaluable: true,
      observed: result ? 'script returned truthy' : 'script returned falsy',
    };
  } catch (error) {
    return { met: false, evaluable: true, observed: `script error: ${error.message}` };
  } finally {
    clearTimeout(timer);
  }
}

export default {
  SCRIPT_TIMEOUT_MS,
  REQUIREMENT_TYPES,
  PLATFORM_SUPPORT,
  isRequirementSupported,
  unsupportedRequirements,
  parseRequirement,
  parseDiskFreeArg,
  validateRequirements,
  normalizeRequirements,
  checkRequirements,
};
