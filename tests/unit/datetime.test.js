/**
 * Unit tests for datetime parsing utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseDateTime,
  parseRunIn,
  parseRunAtOption,
  isDateTimePast,
  formatDateTime,
  getRelativeTimeDescription,
} from '../../src/utils/datetime.js';

describe('datetime utilities', () => {
  describe('parseDateTime', () => {
    it('should parse ISO 8601 datetime', () => {
      const result = parseDateTime('2026-01-31T10:00:00Z');
      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString()).toBe('2026-01-31T10:00:00.000Z');
    });

    it('should parse date and time format', () => {
      const result = parseDateTime('2026-01-31 10:00:00');
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2026);
      expect(result.getMonth()).toBe(0); // January
      expect(result.getDate()).toBe(31);
    });

    it('should parse date only format', () => {
      const result = parseDateTime('2026-01-31');
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2026);
      expect(result.getMonth()).toBe(0); // January
      expect(result.getDate()).toBe(31);
    });

    it('should parse "now" keyword', () => {
      const before = new Date();
      const result = parseDateTime('now');
      const after = new Date();
      
      expect(result).toBeInstanceOf(Date);
      expect(result.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should parse "today" keyword', () => {
      const result = parseDateTime('today');
      const now = new Date();
      
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(now.getFullYear());
      expect(result.getMonth()).toBe(now.getMonth());
      expect(result.getDate()).toBe(now.getDate());
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
    });

    it('should parse "today HH:MM" format', () => {
      const result = parseDateTime('today 14:30');
      const now = new Date();
      
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(now.getFullYear());
      expect(result.getMonth()).toBe(now.getMonth());
      expect(result.getDate()).toBe(now.getDate());
      expect(result.getHours()).toBe(14);
      expect(result.getMinutes()).toBe(30);
      expect(result.getSeconds()).toBe(0);
    });

    it('should parse "today HH:MM:SS" format', () => {
      const result = parseDateTime('today 09:15:45');
      const now = new Date();
      
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(now.getFullYear());
      expect(result.getMonth()).toBe(now.getMonth());
      expect(result.getDate()).toBe(now.getDate());
      expect(result.getHours()).toBe(9);
      expect(result.getMinutes()).toBe(15);
      expect(result.getSeconds()).toBe(45);
    });

    it('should parse "tomorrow" keyword', () => {
      const result = parseDateTime('tomorrow');
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(tomorrow.getFullYear());
      expect(result.getMonth()).toBe(tomorrow.getMonth());
      expect(result.getDate()).toBe(tomorrow.getDate());
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
    });

    it('should parse "tomorrow HH:MM" format', () => {
      const result = parseDateTime('tomorrow 16:45');
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(tomorrow.getFullYear());
      expect(result.getMonth()).toBe(tomorrow.getMonth());
      expect(result.getDate()).toBe(tomorrow.getDate());
      expect(result.getHours()).toBe(16);
      expect(result.getMinutes()).toBe(45);
      expect(result.getSeconds()).toBe(0);
    });

    it('should handle uppercase keywords', () => {
      const result = parseDateTime('TODAY 10:00');
      const now = new Date();
      
      expect(result).toBeInstanceOf(Date);
      expect(result.getDate()).toBe(now.getDate());
    });

    it('should throw error for invalid datetime string', () => {
      expect(() => parseDateTime('invalid')).toThrow('Invalid datetime format');
    });

    it('should throw error for empty string', () => {
      expect(() => parseDateTime('')).toThrow('Datetime cannot be empty');
    });

    it('should throw error for non-string input', () => {
      expect(() => parseDateTime(123)).toThrow('Datetime must be a string');
    });

    it('should throw error for invalid time in today/tomorrow', () => {
      expect(() => parseDateTime('today 25:00')).toThrow('Invalid time');
      expect(() => parseDateTime('today 12:60')).toThrow('Invalid time');
    });
  });

  describe('parseRunIn', () => {
    it('should calculate future date for minutes', () => {
      const before = new Date();
      const result = parseRunIn('30m');
      const after = new Date();
      
      const expectedMin = before.getTime() + 30 * 60 * 1000;
      const expectedMax = after.getTime() + 30 * 60 * 1000;
      
      expect(result).toBeInstanceOf(Date);
      expect(result.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(result.getTime()).toBeLessThanOrEqual(expectedMax);
    });

    it('should calculate future date for hours', () => {
      const before = new Date();
      const result = parseRunIn('2h');
      const after = new Date();
      
      const expectedMin = before.getTime() + 2 * 60 * 60 * 1000;
      const expectedMax = after.getTime() + 2 * 60 * 60 * 1000;
      
      expect(result).toBeInstanceOf(Date);
      expect(result.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(result.getTime()).toBeLessThanOrEqual(expectedMax);
    });

    it('should calculate future date for combined duration', () => {
      const before = new Date();
      const result = parseRunIn('1h30m');
      const after = new Date();
      
      const expectedMin = before.getTime() + 90 * 60 * 1000;
      const expectedMax = after.getTime() + 90 * 60 * 1000;
      
      expect(result).toBeInstanceOf(Date);
      expect(result.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(result.getTime()).toBeLessThanOrEqual(expectedMax);
    });

    it('should accept custom fromDate', () => {
      const fromDate = new Date('2026-01-01T00:00:00Z');
      const result = parseRunIn('1d', fromDate);
      
      expect(result.toISOString()).toBe('2026-01-02T00:00:00.000Z');
    });

    it('should throw error for invalid duration', () => {
      expect(() => parseRunIn('invalid')).toThrow('Invalid duration format');
    });

    it('should throw error for empty string', () => {
      expect(() => parseRunIn('')).toThrow('Duration cannot be empty');
    });
  });

  describe('parseRunAtOption', () => {
    it('should parse --at option', () => {
      const result = parseRunAtOption({ at: '2026-01-31T10:00:00Z' });
      expect(result).toBe('2026-01-31T10:00:00.000Z');
    });

    it('should parse --in option and return ISO string', () => {
      const before = new Date();
      const result = parseRunAtOption({ in: '1h' });
      const after = new Date();
      
      const resultDate = new Date(result);
      const expectedMin = before.getTime() + 60 * 60 * 1000;
      const expectedMax = after.getTime() + 60 * 60 * 1000;
      
      expect(resultDate.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(resultDate.getTime()).toBeLessThanOrEqual(expectedMax);
    });

    it('should throw error if neither option is provided', () => {
      expect(() => parseRunAtOption({})).toThrow('Either "at" or "in" option must be provided');
    });

    it('should throw error if both options are provided', () => {
      expect(() => parseRunAtOption({ at: '2026-01-31', in: '1h' })).toThrow(
        'Cannot specify both "at" and "in" options'
      );
    });

    it('should throw error for empty options', () => {
      expect(() => parseRunAtOption({ at: '' })).toThrow('Either "at" or "in" option must be provided');
      expect(() => parseRunAtOption({ in: '' })).toThrow('Either "at" or "in" option must be provided');
    });
  });

  describe('isDateTimePast', () => {
    it('should return true for past dates', () => {
      const pastDate = new Date(Date.now() - 60000); // 1 minute ago
      expect(isDateTimePast(pastDate)).toBe(true);
    });

    it('should return false for future dates', () => {
      const futureDate = new Date(Date.now() + 60000); // 1 minute from now
      expect(isDateTimePast(futureDate)).toBe(false);
    });

    it('should return false for current time', () => {
      const now = new Date();
      expect(isDateTimePast(now)).toBe(false);
    });

    it('should work with string dates', () => {
      const pastString = new Date(Date.now() - 60000).toISOString();
      expect(isDateTimePast(pastString)).toBe(true);
    });

    it('should accept custom reference date', () => {
      const reference = new Date('2026-01-15T00:00:00Z');
      const before = new Date('2026-01-14T00:00:00Z');
      const after = new Date('2026-01-16T00:00:00Z');
      
      expect(isDateTimePast(before, reference)).toBe(true);
      expect(isDateTimePast(after, reference)).toBe(false);
    });

    it('should throw error for invalid date', () => {
      expect(() => isDateTimePast('invalid')).toThrow('Invalid date provided');
    });
  });

  describe('formatDateTime', () => {
    it('should format Date object', () => {
      const date = new Date('2026-01-31T10:30:45Z');
      const result = formatDateTime(date);
      expect(result).toContain('Jan');
      expect(result).toContain('31');
      expect(result).toContain('2026');
    });

    it('should format ISO string', () => {
      const result = formatDateTime('2026-01-31T10:30:45Z');
      expect(result).toContain('Jan');
      expect(result).toContain('2026');
    });

    it('should return "Invalid date" for invalid input', () => {
      expect(formatDateTime('invalid')).toBe('Invalid date');
    });
  });

  describe('getRelativeTimeDescription', () => {
    it('should describe future times', () => {
      const future = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now
      const result = getRelativeTimeDescription(future);
      expect(result).toContain('in');
      expect(result).toContain('minute');
    });

    it('should describe past times', () => {
      const past = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      const result = getRelativeTimeDescription(past);
      expect(result).toContain('ago');
      expect(result).toContain('hour');
    });

    it('should return "Invalid date" for invalid input', () => {
      expect(getRelativeTimeDescription('invalid')).toBe('Invalid date');
    });

    it('should handle seconds for very near future', () => {
      const nearFuture = new Date(Date.now() + 5000); // 5 seconds from now
      const result = getRelativeTimeDescription(nearFuture);
      expect(result).toContain('in');
    });

    it('should handle days for distant times', () => {
      const distantFuture = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days
      const result = getRelativeTimeDescription(distantFuture);
      expect(result).toContain('in');
      expect(result).toContain('day');
    });
  });
});
