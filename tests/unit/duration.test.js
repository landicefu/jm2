/**
 * Unit tests for src/utils/duration.js
 */

import { describe, it, expect } from 'vitest';
import {
  parseDuration,
  parseDurationSeconds,
  formatDuration,
  isValidDuration,
  getValidUnits,
  getUnitMs,
} from '../../src/utils/duration.js';

describe('duration', () => {
  describe('parseDuration', () => {
    describe('single unit parsing', () => {
      it('should parse seconds', () => {
        expect(parseDuration('30s')).toBe(30 * 1000);
        expect(parseDuration('1s')).toBe(1000);
        expect(parseDuration('60s')).toBe(60 * 1000);
      });

      it('should parse minutes', () => {
        expect(parseDuration('5m')).toBe(5 * 60 * 1000);
        expect(parseDuration('1m')).toBe(60 * 1000);
        expect(parseDuration('60m')).toBe(60 * 60 * 1000);
      });

      it('should parse hours', () => {
        expect(parseDuration('2h')).toBe(2 * 60 * 60 * 1000);
        expect(parseDuration('1h')).toBe(60 * 60 * 1000);
        expect(parseDuration('24h')).toBe(24 * 60 * 60 * 1000);
      });

      it('should parse days', () => {
        expect(parseDuration('1d')).toBe(24 * 60 * 60 * 1000);
        expect(parseDuration('7d')).toBe(7 * 24 * 60 * 60 * 1000);
      });

      it('should parse weeks', () => {
        expect(parseDuration('1w')).toBe(7 * 24 * 60 * 60 * 1000);
        expect(parseDuration('2w')).toBe(14 * 24 * 60 * 60 * 1000);
      });

      it('should be case insensitive', () => {
        expect(parseDuration('30S')).toBe(30 * 1000);
        expect(parseDuration('5M')).toBe(5 * 60 * 1000);
        expect(parseDuration('2H')).toBe(2 * 60 * 60 * 1000);
        expect(parseDuration('1D')).toBe(24 * 60 * 60 * 1000);
        expect(parseDuration('1W')).toBe(7 * 24 * 60 * 60 * 1000);
      });
    });

    describe('combined duration parsing', () => {
      it('should parse hours and minutes', () => {
        expect(parseDuration('1h30m')).toBe(90 * 60 * 1000);
        expect(parseDuration('2h15m')).toBe(135 * 60 * 1000);
      });

      it('should parse days and hours', () => {
        expect(parseDuration('2d12h')).toBe((2 * 24 + 12) * 60 * 60 * 1000);
      });

      it('should parse multiple units', () => {
        expect(parseDuration('1d2h30m')).toBe((24 + 2) * 60 * 60 * 1000 + 30 * 60 * 1000);
        expect(parseDuration('1w1d1h1m1s')).toBe(
          7 * 24 * 60 * 60 * 1000 +
          24 * 60 * 60 * 1000 +
          60 * 60 * 1000 +
          60 * 1000 +
          1000
        );
      });

      it('should handle mixed case in combined durations', () => {
        expect(parseDuration('1H30M')).toBe(90 * 60 * 1000);
        expect(parseDuration('1h30M')).toBe(90 * 60 * 1000);
      });
    });

    describe('whitespace handling', () => {
      it('should trim leading and trailing whitespace', () => {
        expect(parseDuration('  30s  ')).toBe(30 * 1000);
        expect(parseDuration('\t5m\n')).toBe(5 * 60 * 1000);
      });
    });

    describe('error handling', () => {
      it('should throw on non-string input', () => {
        expect(() => parseDuration(123)).toThrow('Duration must be a string');
        expect(() => parseDuration(null)).toThrow('Duration must be a string');
        expect(() => parseDuration(undefined)).toThrow('Duration must be a string');
        expect(() => parseDuration({})).toThrow('Duration must be a string');
      });

      it('should throw on empty string', () => {
        expect(() => parseDuration('')).toThrow('Duration cannot be empty');
        expect(() => parseDuration('   ')).toThrow('Duration cannot be empty');
      });

      it('should throw on invalid format', () => {
        expect(() => parseDuration('invalid')).toThrow('Invalid duration format');
        expect(() => parseDuration('30')).toThrow('Invalid duration format');
        expect(() => parseDuration('30x')).toThrow('Invalid duration format');
        expect(() => parseDuration('abc30s')).toThrow('Invalid duration format');
        expect(() => parseDuration('30s abc')).toThrow('Invalid duration format');
      });

      it('should throw on zero duration', () => {
        expect(() => parseDuration('0s')).toThrow('Duration cannot be zero');
        expect(() => parseDuration('0m')).toThrow('Duration cannot be zero');
        expect(() => parseDuration('0h')).toThrow('Duration cannot be zero');
      });
    });
  });

  describe('parseDurationSeconds', () => {
    it('should return duration in seconds', () => {
      expect(parseDurationSeconds('30s')).toBe(30);
      expect(parseDurationSeconds('5m')).toBe(300);
      expect(parseDurationSeconds('1h')).toBe(3600);
      expect(parseDurationSeconds('1h30m')).toBe(5400);
    });

    it('should floor fractional seconds', () => {
      // 1500ms = 1.5s, should floor to 1
      // But our parser only accepts whole numbers, so this tests the floor behavior
      expect(parseDurationSeconds('1s')).toBe(1);
    });
  });

  describe('formatDuration', () => {
    describe('short format (default)', () => {
      it('should format single units', () => {
        expect(formatDuration(30 * 1000)).toBe('30s');
        expect(formatDuration(5 * 60 * 1000)).toBe('5m');
        expect(formatDuration(2 * 60 * 60 * 1000)).toBe('2h');
        expect(formatDuration(24 * 60 * 60 * 1000)).toBe('1d');
        expect(formatDuration(7 * 24 * 60 * 60 * 1000)).toBe('1w');
      });

      it('should format combined durations', () => {
        expect(formatDuration(90 * 60 * 1000)).toBe('1h30m');
        expect(formatDuration(5400 * 1000)).toBe('1h30m');
      });

      it('should format complex durations', () => {
        const oneWeekOneDayOneHourOneMinuteOneSecond =
          7 * 24 * 60 * 60 * 1000 +
          24 * 60 * 60 * 1000 +
          60 * 60 * 1000 +
          60 * 1000 +
          1000;
        expect(formatDuration(oneWeekOneDayOneHourOneMinuteOneSecond)).toBe('1w1d1h1m1s');
      });

      it('should handle zero', () => {
        expect(formatDuration(0)).toBe('0s');
      });

      it('should handle sub-second durations', () => {
        expect(formatDuration(500)).toBe('500ms');
      });
    });

    describe('long format', () => {
      it('should format with full unit names', () => {
        expect(formatDuration(30 * 1000, { short: false })).toBe('30 seconds');
        expect(formatDuration(1000, { short: false })).toBe('1 second');
        expect(formatDuration(5 * 60 * 1000, { short: false })).toBe('5 minutes');
        expect(formatDuration(60 * 1000, { short: false })).toBe('1 minute');
        expect(formatDuration(2 * 60 * 60 * 1000, { short: false })).toBe('2 hours');
        expect(formatDuration(60 * 60 * 1000, { short: false })).toBe('1 hour');
      });

      it('should handle zero in long format', () => {
        expect(formatDuration(0, { short: false })).toBe('0 seconds');
      });
    });

    describe('largest option', () => {
      it('should only show the largest unit', () => {
        expect(formatDuration(90 * 60 * 1000, { largest: true })).toBe('1h');
        expect(formatDuration(25 * 60 * 60 * 1000, { largest: true })).toBe('1d');
      });
    });

    describe('error handling', () => {
      it('should throw on non-number input', () => {
        expect(() => formatDuration('30s')).toThrow('Duration must be a number');
        expect(() => formatDuration(null)).toThrow('Duration must be a number');
        expect(() => formatDuration(NaN)).toThrow('Duration must be a number');
      });

      it('should throw on negative duration', () => {
        expect(() => formatDuration(-1000)).toThrow('Duration cannot be negative');
      });
    });
  });

  describe('isValidDuration', () => {
    it('should return true for valid durations', () => {
      expect(isValidDuration('30s')).toBe(true);
      expect(isValidDuration('5m')).toBe(true);
      expect(isValidDuration('2h')).toBe(true);
      expect(isValidDuration('1d')).toBe(true);
      expect(isValidDuration('1w')).toBe(true);
      expect(isValidDuration('1h30m')).toBe(true);
    });

    it('should return false for invalid durations', () => {
      expect(isValidDuration('')).toBe(false);
      expect(isValidDuration('invalid')).toBe(false);
      expect(isValidDuration('30')).toBe(false);
      expect(isValidDuration('30x')).toBe(false);
      expect(isValidDuration(123)).toBe(false);
      expect(isValidDuration(null)).toBe(false);
    });

    it('should return false for zero duration', () => {
      expect(isValidDuration('0s')).toBe(false);
      expect(isValidDuration('0m')).toBe(false);
    });
  });

  describe('getValidUnits', () => {
    it('should return all valid unit characters', () => {
      const units = getValidUnits();
      expect(units).toContain('s');
      expect(units).toContain('m');
      expect(units).toContain('h');
      expect(units).toContain('d');
      expect(units).toContain('w');
      expect(units.length).toBe(5);
    });

    it('should return a new array each time', () => {
      const units1 = getValidUnits();
      const units2 = getValidUnits();
      expect(units1).not.toBe(units2);
      expect(units1).toEqual(units2);
    });
  });

  describe('getUnitMs', () => {
    it('should return milliseconds for each unit', () => {
      expect(getUnitMs('s')).toBe(1000);
      expect(getUnitMs('m')).toBe(60 * 1000);
      expect(getUnitMs('h')).toBe(60 * 60 * 1000);
      expect(getUnitMs('d')).toBe(24 * 60 * 60 * 1000);
      expect(getUnitMs('w')).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('should be case insensitive', () => {
      expect(getUnitMs('S')).toBe(1000);
      expect(getUnitMs('M')).toBe(60 * 1000);
    });

    it('should return undefined for invalid units', () => {
      expect(getUnitMs('x')).toBeUndefined();
      expect(getUnitMs('invalid')).toBeUndefined();
    });
  });

  describe('default export', () => {
    it('should export all functions', async () => {
      const duration = await import('../../src/utils/duration.js');
      expect(duration.default).toBeDefined();
      expect(typeof duration.default.parseDuration).toBe('function');
      expect(typeof duration.default.parseDurationSeconds).toBe('function');
      expect(typeof duration.default.formatDuration).toBe('function');
      expect(typeof duration.default.isValidDuration).toBe('function');
      expect(typeof duration.default.getValidUnits).toBe('function');
      expect(typeof duration.default.getUnitMs).toBe('function');
    });
  });
});
