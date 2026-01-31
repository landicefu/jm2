/**
 * Cron expression utilities for jm2
 * Uses cron-parser library for parsing and calculating next run times
 */

import { CronExpressionParser } from 'cron-parser';

/**
 * Default options for cron parsing with UTC
 */
const DEFAULT_OPTIONS = {
  utc: true,
};

/**
 * Validate a cron expression
 * @param {string} expression - Cron expression to validate
 * @returns {{ valid: boolean, error?: string }} Validation result
 */
export function validateCronExpression(expression) {
  if (!expression || typeof expression !== 'string') {
    return { valid: false, error: 'Cron expression must be a non-empty string' };
  }

  const trimmed = expression.trim();
  if (trimmed === '') {
    return { valid: false, error: 'Cron expression cannot be empty' };
  }

  try {
    CronExpressionParser.parse(trimmed, DEFAULT_OPTIONS);
    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

/**
 * Get the next run time for a cron expression
 * @param {string} expression - Cron expression
 * @param {Date} [fromDate] - Date to calculate from (default: now)
 * @returns {Date|null} Next run time or null if invalid
 */
export function getNextRunTime(expression, fromDate = new Date()) {
  try {
    const interval = CronExpressionParser.parse(expression.trim(), {
      ...DEFAULT_OPTIONS,
      currentDate: fromDate,
    });
    return interval.next().toDate();
  } catch (error) {
    return null;
  }
}

/**
 * Get multiple upcoming run times for a cron expression
 * @param {string} expression - Cron expression
 * @param {number} count - Number of run times to get (default: 5)
 * @param {Date} [fromDate] - Date to calculate from (default: now)
 * @returns {Date[]} Array of upcoming run times
 */
export function getUpcomingRunTimes(expression, count = 5, fromDate = new Date()) {
  try {
    const interval = CronExpressionParser.parse(expression.trim(), {
      ...DEFAULT_OPTIONS,
      currentDate: fromDate,
    });

    const times = [];
    for (let i = 0; i < count; i++) {
      times.push(interval.next().toDate());
    }
    return times;
  } catch (error) {
    return [];
  }
}

/**
 * Check if a cron expression has a valid format
 * @param {string} expression - Cron expression to check
 * @returns {boolean} True if valid
 */
export function isValidCronExpression(expression) {
  return validateCronExpression(expression).valid;
}

/**
 * Get a human-readable description of a cron expression
 * @param {string} expression - Cron expression
 * @returns {string} Human-readable description or error message
 */
export function describeCronExpression(expression) {
  const validation = validateCronExpression(expression);
  if (!validation.valid) {
    return `Invalid cron: ${validation.error}`;
  }

  try {
    const interval = CronExpressionParser.parse(expression.trim(), DEFAULT_OPTIONS);
    const fields = interval.fields;

    // Build a simple description using the cron string itself
    // and getting a sample next run time
    const nextRun = interval.next().toDate();
    const timeStr = nextRun.toISOString().slice(11, 16); // HH:MM
    const dateStr = nextRun.toISOString().slice(0, 10); // YYYY-MM-DD

    // Simple description based on the pattern
    const parts = [];

    // Check for common patterns
    if (expression === '* * * * *') {
      return 'Every minute';
    }
    if (expression === '0 * * * *') {
      return 'Every hour at minute 0';
    }
    if (expression === '0 0 * * *') {
      return 'Daily at midnight (00:00)';
    }
    if (expression === '0 0 * * 0') {
      return 'Weekly on Sunday at midnight';
    }
    if (expression === '0 0 1 * *') {
      return 'Monthly on the 1st at midnight';
    }

    // Generic description with next occurrence
    return `Cron: ${expression.trim()} (next: ${dateStr} ${timeStr} UTC)`;
  } catch (error) {
    return `Invalid cron expression`;
  }
}

/**
 * Parse a cron expression and return the interval object
 * @param {string} expression - Cron expression
 * @param {Date} [fromDate] - Date to calculate from
 * @returns {CronExpression|null} CronExpression object or null if invalid
 */
export function parseCronExpression(expression, fromDate = new Date()) {
  try {
    return CronExpressionParser.parse(expression.trim(), {
      ...DEFAULT_OPTIONS,
      currentDate: fromDate,
    });
  } catch (error) {
    return null;
  }
}

/**
 * Check if a job should run at a specific time
 * @param {string} expression - Cron expression
 * @param {Date} checkTime - Time to check
 * @returns {boolean} True if job should run at checkTime
 */
export function shouldRunAt(expression, checkTime = new Date()) {
  try {
    const interval = CronExpressionParser.parse(expression.trim(), {
      ...DEFAULT_OPTIONS,
      currentDate: new Date(checkTime.getTime() - 60000), // 1 minute before
    });
    const nextRun = interval.next().toDate();

    // Check if the next run is within the same minute as checkTime
    const nextMinute = Math.floor(nextRun.getTime() / 60000);
    const checkMinute = Math.floor(checkTime.getTime() / 60000);

    return nextMinute === checkMinute;
  } catch (error) {
    return false;
  }
}

/**
 * Common cron expression presets
 */
export const CronPresets = {
  EVERY_MINUTE: '* * * * *',
  EVERY_5_MINUTES: '*/5 * * * *',
  EVERY_15_MINUTES: '*/15 * * * *',
  EVERY_30_MINUTES: '*/30 * * * *',
  HOURLY: '0 * * * *',
  EVERY_2_HOURS: '0 */2 * * *',
  DAILY: '0 0 * * *',
  WEEKLY: '0 0 * * 0',
  MONTHLY: '0 0 1 * *',
  YEARLY: '0 0 1 1 *',
  WEEKDAYS: '0 0 * * 1-5',
  WEEKENDS: '0 0 * * 0,6',
};

export default {
  validateCronExpression,
  getNextRunTime,
  getUpcomingRunTimes,
  isValidCronExpression,
  describeCronExpression,
  parseCronExpression,
  shouldRunAt,
  CronPresets,
};
