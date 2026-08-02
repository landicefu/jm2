/**
 * Unit tests for src/core/requirements.js
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import {
  parseRequirement,
  parseDiskFreeArg,
  validateRequirements,
  normalizeRequirements,
  checkRequirements,
  isRequirementSupported,
  unsupportedRequirements,
} from '../../src/core/requirements.js';

const THIS_FILE = fileURLToPath(import.meta.url);

describe('requirements', () => {
  describe('parseRequirement', () => {
    it('parses no-argument requirements', () => {
      expect(parseRequirement('ac')).toEqual({ raw: 'ac', type: 'ac', arg: null });
      expect(parseRequirement('WiFi').type).toBe('wifi'); // type is lower-cased
      expect(parseRequirement('not-vpn').type).toBe('not-vpn');
      expect(parseRequirement('screen-locked').type).toBe('screen-locked');
    });

    it('parses argument requirements, splitting on the first colon only', () => {
      expect(parseRequirement('ssid:My Home Net')).toEqual({
        raw: 'ssid:My Home Net',
        type: 'ssid',
        arg: 'My Home Net',
      });
      // path may contain colons and spaces
      const p = parseRequirement('path-exists:/Volumes/My Disk:extra');
      expect(p.type).toBe('path-exists');
      expect(p.arg).toBe('/Volumes/My Disk:extra');
    });

    it('preserves case in arguments but lower-cases the type', () => {
      const r = parseRequirement('SSID:CaseSensitive');
      expect(r.type).toBe('ssid');
      expect(r.arg).toBe('CaseSensitive');
    });

    it('throws on empty or unknown requirements', () => {
      expect(() => parseRequirement('')).toThrow();
      expect(() => parseRequirement('   ')).toThrow();
      expect(() => parseRequirement('bogus')).toThrow(/unknown requirement/);
    });

    it('throws when an argument requirement is missing its value', () => {
      expect(() => parseRequirement('ssid')).toThrow(/needs a value/);
      expect(() => parseRequirement('ssid:')).toThrow(/needs a value/);
      expect(() => parseRequirement('disk-free')).toThrow(/needs a value/);
    });

    it('throws when a no-argument requirement is given a value', () => {
      expect(() => parseRequirement('ac:1')).toThrow(/does not take a value/);
    });

    it('validates the disk-free size up front', () => {
      expect(() => parseRequirement('disk-free:abc')).toThrow(/invalid disk-free size/);
      expect(parseRequirement('disk-free:10').type).toBe('disk-free');
    });
  });

  describe('parseDiskFreeArg', () => {
    it('parses a bare gigabyte number defaulting to root', () => {
      const r = parseDiskFreeArg('10');
      expect(r.gb).toBe(10);
      expect(r.bytes).toBe(10 * 1024 * 1024 * 1024);
      expect(r.path).toBe('/');
    });

    it('accepts gb/g suffixes and a custom path', () => {
      expect(parseDiskFreeArg('5gb').bytes).toBe(5 * 1024 * 1024 * 1024);
      expect(parseDiskFreeArg('2G').bytes).toBe(2 * 1024 * 1024 * 1024);
      const r = parseDiskFreeArg('10:/Volumes/Backup');
      expect(r.path).toBe('/Volumes/Backup');
      expect(r.gb).toBe(10);
    });

    it('accepts fractional gigabytes', () => {
      expect(parseDiskFreeArg('1.5').bytes).toBe(Math.floor(1.5 * 1024 * 1024 * 1024));
    });

    it('throws on an invalid size', () => {
      expect(() => parseDiskFreeArg('abc')).toThrow();
      expect(() => parseDiskFreeArg('10mb')).toThrow();
    });
  });

  describe('validateRequirements', () => {
    it('accepts undefined/null/empty as valid (backward compatible)', () => {
      expect(validateRequirements(undefined).valid).toBe(true);
      expect(validateRequirements(null).valid).toBe(true);
      expect(validateRequirements([]).valid).toBe(true);
    });

    it('accepts a list of valid requirements', () => {
      const result = validateRequirements(['ac', 'wifi', 'ssid:Home', 'disk-free:10', 'online']);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('collects errors for invalid entries', () => {
      const result = validateRequirements(['ac', 'nope', 'ssid']);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(2);
    });

    it('rejects non-array input', () => {
      expect(validateRequirements('ac').valid).toBe(false);
    });
  });

  describe('normalizeRequirements', () => {
    it('trims, drops empties, and dedupes while preserving order and case', () => {
      expect(normalizeRequirements([' ac ', 'ac', '', 'ssid:Home', 'ssid:Home'])).toEqual([
        'ac',
        'ssid:Home',
      ]);
    });

    it('drops non-string entries', () => {
      expect(normalizeRequirements(['ac', 123, null, 'wifi'])).toEqual(['ac', 'wifi']);
    });

    it('returns an empty array for non-array input', () => {
      expect(normalizeRequirements(undefined)).toEqual([]);
    });
  });

  describe('checkRequirements', () => {
    it('is met when there are no requirements', async () => {
      expect(await checkRequirements([])).toEqual({ met: true, failures: [], unevaluable: [] });
      expect(await checkRequirements(undefined)).toEqual({
        met: true,
        failures: [],
        unevaluable: [],
      });
    });

    it('meets path-exists for an existing path and fails for a missing one', async () => {
      const ok = await checkRequirements([`path-exists:${THIS_FILE}`]);
      expect(ok.met).toBe(true);

      const missing = await checkRequirements(['path-exists:/no/such/path/xyz-123']);
      expect(missing.met).toBe(false);
      expect(missing.failures[0].requirement).toBe('path-exists:/no/such/path/xyz-123');
    });

    it('evaluates disk-free (0GB always met, absurd threshold never met)', async () => {
      expect((await checkRequirements(['disk-free:0'])).met).toBe(true);
      const huge = await checkRequirements(['disk-free:999999999']);
      expect(huge.met).toBe(false);
      expect(huge.failures[0].reason).toMatch(/free on/);
    });

    it('runs inline scripts and treats truthy as met, falsy as not met', async () => {
      expect((await checkRequirements(['script:1 + 1 === 2'])).met).toBe(true);
      expect((await checkRequirements(['script:return 1 === 2'])).met).toBe(false);
    });

    it('treats a throwing script as NOT met (skip)', async () => {
      const result = await checkRequirements([
        "script:return (() => { throw new Error('boom'); })()",
      ]);
      expect(result.met).toBe(false);
      expect(result.failures[0].reason).toMatch(/script error/);
    });

    it('treats a script with a syntax error as NOT met (skip)', async () => {
      const result = await checkRequirements(['script:return (']);
      expect(result.met).toBe(false);
      expect(result.failures[0].reason).toMatch(/script (syntax )?error/);
    });

    it('exposes the job to inline scripts', async () => {
      const result = await checkRequirements(['script:return job && job.name === "hello"'], {
        job: { name: 'hello' },
      });
      expect(result.met).toBe(true);
    });

    it('reports invalid requirements as failures', async () => {
      const result = await checkRequirements(['definitely-not-a-requirement']);
      expect(result.met).toBe(false);
      expect(result.failures[0].reason).toMatch(/invalid requirement/);
    });

    it('always returns an unevaluable array', async () => {
      const result = await checkRequirements([`path-exists:${THIS_FILE}`]);
      expect(Array.isArray(result.unevaluable)).toBe(true);
    });

    it('collects all failures across multiple requirements', async () => {
      const result = await checkRequirements([
        `path-exists:${THIS_FILE}`, // met
        'path-exists:/no/such/thing', // not met
        'disk-free:999999999', // not met
      ]);
      expect(result.met).toBe(false);
      expect(result.failures).toHaveLength(2);
    });
  });

  describe('platform support', () => {
    it('reports cross-platform requirements as supported everywhere', () => {
      for (const platform of ['darwin', 'linux', 'win32']) {
        expect(isRequirementSupported('online', platform)).toBe(true);
        expect(isRequirementSupported('disk-free', platform)).toBe(true);
        expect(isRequirementSupported('path-exists', platform)).toBe(true);
        expect(isRequirementSupported('script', platform)).toBe(true);
        expect(isRequirementSupported('ac', platform)).toBe(true);
      }
    });

    it('reports screen-lock as macOS-only', () => {
      expect(isRequirementSupported('screen-locked', 'darwin')).toBe(true);
      expect(isRequirementSupported('screen-locked', 'linux')).toBe(false);
      expect(isRequirementSupported('screen-unlocked', 'win32')).toBe(false);
    });

    it('treats unknown types as supported (no false warnings)', () => {
      expect(isRequirementSupported('mystery', 'linux')).toBe(true);
    });

    it('unsupportedRequirements finds only the platform-unsupported entries', () => {
      const reqs = ['ac', 'online', 'screen-locked', 'screen-unlocked'];
      const onLinux = unsupportedRequirements(reqs, 'linux');
      expect(onLinux.map(r => r.requirement)).toEqual(['screen-locked', 'screen-unlocked']);

      const onMac = unsupportedRequirements(reqs, 'darwin');
      expect(onMac).toHaveLength(0);
    });

    it('unsupportedRequirements ignores invalid requirement strings', () => {
      expect(unsupportedRequirements(['not-a-real-req', 'screen-locked'], 'win32')).toEqual([
        { requirement: 'screen-locked', type: 'screen-locked' },
      ]);
    });
  });
});
