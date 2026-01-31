/**
 * Unit tests for cron utilities
 */

import { describe, it, expect } from 'vitest';
import {
  validateCronExpression,
  getNextRunTime,
  getUpcomingRunTimes,
  isValidCronExpression,
  describeCronExpression,
  parseCronExpression,
  shouldRunAt,
  CronPresets,
} from '../../src/utils/cron.js';

describe('cron utilities', () => {
  describe('validateCronExpression', () => {
    it('should validate a valid 5-field cron expression', () => {
      const result = validateCronExpression('0 0 * * *');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should validate a valid 6-field cron expression', () => {
      const result = validateCronExpression('0 0 * * * *');
      expect(result.valid).toBe(true);
    });

    it('should reject an empty expression', () => {
      const result = validateCronExpression('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should reject null expression', () => {
      const result = validateCronExpression(null);
      expect(result.valid).toBe(false);
    });

    it('should reject undefined expression', () => {
      const result = validateCronExpression(undefined);
      expect(result.valid).toBe(false);
    });

    it('should reject invalid cron expression with wrong number of fields', () => {
      const result = validateCronExpression('0 0 * *');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject invalid cron expression with invalid characters', () => {
      const result = validateCronExpression('invalid');
      expect(result.valid).toBe(false);
    });

    it('should handle expressions with extra whitespace', () => {
      const result = validateCronExpression('  0 0 * * *  ');
      expect(result.valid).toBe(true);
    });
  });

  describe('getNextRunTime', () => {
    it('should return the next run time for a daily cron', () => {
      const now = new Date('2024-01-15T12:00:00Z');
      const nextRun = getNextRunTime('0 0 * * *', now);
      expect(nextRun).toBeInstanceOf(Date);
      // Next run should be after the current time
      expect(nextRun.getTime()).toBeGreaterThan(now.getTime());
      // Should be at midnight (00:00) in some timezone context
      const hours = nextRun.getHours();
      expect(hours).toBe(0);
    });

    it('should return the next run time for an hourly cron', () => {
      const now = new Date('2024-01-15T12:30:00Z');
      const nextRun = getNextRunTime('0 * * * *', now);
      expect(nextRun).toBeInstanceOf(Date);
      expect(nextRun.getTime()).toBeGreaterThan(now.getTime());
      // Minute should be 0
      expect(nextRun.getMinutes()).toBe(0);
    });

    it('should return the next run time for every minute cron', () => {
      const now = new Date('2024-01-15T12:00:00Z');
      const nextRun = getNextRunTime('* * * * *', now);
      expect(nextRun.getTime()).toBeGreaterThan(now.getTime());
      // Should be within 60 seconds
      expect(nextRun.getTime() - now.getTime()).toBeLessThanOrEqual(60000);
    });

    it('should return null for invalid expression', () => {
      const nextRun = getNextRunTime('invalid');
      expect(nextRun).toBeNull();
    });

    it('should calculate correctly from current time when no fromDate provided', () => {
      const before = Date.now();
      const nextRun = getNextRunTime('0 0 * * *');
      const after = Date.now();
      expect(nextRun).toBeInstanceOf(Date);
      expect(nextRun.getTime()).toBeGreaterThanOrEqual(before);
    });
  });

  describe('getUpcomingRunTimes', () => {
    it('should return multiple upcoming run times', () => {
      const now = new Date('2024-01-15T12:00:00Z');
      const times = getUpcomingRunTimes('0 0 * * *', 3, now);
      expect(times).toHaveLength(3);
      // Each subsequent time should be after the previous
      expect(times[1].getTime()).toBeGreaterThan(times[0].getTime());
      expect(times[2].getTime()).toBeGreaterThan(times[1].getTime());
    });

    it('should return empty array for invalid expression', () => {
      const times = getUpcomingRunTimes('invalid', 5);
      expect(times).toEqual([]);
    });

    it('should default to 5 times when count not specified', () => {
      const now = new Date('2024-01-15T12:00:00Z');
      const times = getUpcomingRunTimes('0 0 * * *', undefined, now);
      expect(times).toHaveLength(5);
    });
  });

  describe('isValidCronExpression', () => {
    it('should return true for valid expression', () => {
      expect(isValidCronExpression('0 0 * * *')).toBe(true);
    });

    it('should return false for invalid expression', () => {
      expect(isValidCronExpression('invalid')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidCronExpression('')).toBe(false);
    });
  });

  describe('describeCronExpression', () => {
    it('should return description for daily cron', () => {
      const description = describeCronExpression('0 0 * * *');
      expect(description).toContain('Daily');
      expect(description).toContain('midnight');
    });

    it('should return description for every minute cron', () => {
      const description = describeCronExpression('* * * * *');
      expect(description).toContain('Every minute');
    });

    it('should return error message for invalid expression', () => {
      const description = describeCronExpression('invalid');
      expect(description).toContain('Invalid');
    });

    it('should describe hourly cron', () => {
      const description = describeCronExpression('0 * * * *');
      expect(typeof description).toBe('string');
      expect(description.length).toBeGreaterThan(0);
    });

    it('should describe weekly cron', () => {
      const description = describeCronExpression('0 0 * * 0');
      expect(description).toContain('Weekly');
    });

    it('should describe monthly cron', () => {
      const description = describeCronExpression('0 0 1 * *');
      expect(description).toContain('Monthly');
    });

    it('should return cron with next run for custom expressions', () => {
      const description = describeCronExpression('0 30 14 * * 1');
      expect(description).toContain('Cron:');
    });
  });

  describe('parseCronExpression', () => {
    it('should return CronExpression object for valid expression', () => {
      const parsed = parseCronExpression('0 0 * * *');
      expect(parsed).toBeDefined();
      expect(parsed.next).toBeDefined();
    });

    it('should return null for invalid expression', () => {
      const parsed = parseCronExpression('invalid');
      expect(parsed).toBeNull();
    });

    it('should parse with custom from date', () => {
      const fromDate = new Date('2024-06-15T12:00:00Z');
      const parsed = parseCronExpression('0 0 * * *', fromDate);
      expect(parsed).toBeDefined();
      const next = parsed.next().toDate();
      // Next run should be after the from date
      expect(next.getTime()).toBeGreaterThan(fromDate.getTime());
    });
  });

  describe('shouldRunAt', () => {
    it('should return true for matching time', () => {
      // For an hourly cron at minute 0
      const checkTime = new Date('2024-01-15T13:00:00Z');
      const result = shouldRunAt('0 * * * *', checkTime);
      expect(result).toBe(true);
    });

    it('should return false for non-matching time', () => {
      // For an hourly cron at minute 0, checking at minute 30
      const checkTime = new Date('2024-01-15T13:30:00Z');
      const result = shouldRunAt('0 * * * *', checkTime);
      expect(result).toBe(false);
    });

    it('should handle every minute cron', () => {
      const checkTime = new Date('2024-01-15T13:30:00Z');
      const result = shouldRunAt('* * * * *', checkTime);
      expect(result).toBe(true);
    });

    it('should return false for invalid expression', () => {
      const result = shouldRunAt('invalid', new Date());
      expect(result).toBe(false);
    });
  });

  describe('CronPresets', () => {
    it('should have valid cron expressions', () => {
      Object.entries(CronPresets).forEach(([name, expression]) => {
        const result = validateCronExpression(expression);
        expect(result.valid).toBe(true);
      });
    });

    it('should have expected presets', () => {
      expect(CronPresets.EVERY_MINUTE).toBe('* * * * *');
      expect(CronPresets.HOURLY).toBe('0 * * * *');
      expect(CronPresets.DAILY).toBe('0 0 * * *');
      expect(CronPresets.WEEKLY).toBe('0 0 * * 0');
      expect(CronPresets.MONTHLY).toBe('0 0 1 * *');
    });
  });
});
