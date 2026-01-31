/**
 * Datetime parsing utilities for jm2
 * Handles parsing --at datetime strings and --in duration to datetime conversion
 */

import { parseDuration } from './duration.js';

/**
 * Parse a datetime string into a Date object
 * Supports various formats including ISO 8601, and human-readable formats
 * 
 * @param {string} datetimeStr - Datetime string to parse
 * @returns {Date} Parsed Date object
 * @throws {Error} If the datetime string is invalid
 * 
 * @example
 * parseDateTime('2026-01-31T10:00:00Z')    // ISO 8601
 * parseDateTime('2026-01-31 10:00:00')     // Date and time
 * parseDateTime('2026-01-31')              // Date only (time set to 00:00:00)
 * parseDateTime('today 10:00')             // Today at specific time
 * parseDateTime('tomorrow 14:30')          // Tomorrow at specific time
 */
export function parseDateTime(datetimeStr) {
  if (typeof datetimeStr !== 'string') {
    throw new Error('Datetime must be a string');
  }

  const trimmed = datetimeStr.trim();
  
  if (trimmed === '') {
    throw new Error('Datetime cannot be empty');
  }

  const lower = trimmed.toLowerCase();
  const now = new Date();

  // Handle special keywords
  if (lower === 'now') {
    return new Date();
  }

  // Handle "today" and "tomorrow" with time
  const todayTomorrowMatch = lower.match(/^(today|tomorrow)(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (todayTomorrowMatch) {
    const day = todayTomorrowMatch[1];
    const hours = parseInt(todayTomorrowMatch[2] || '0', 10);
    const minutes = parseInt(todayTomorrowMatch[3] || '0', 10);
    const seconds = parseInt(todayTomorrowMatch[4] || '0', 10);

    if (hours > 23 || minutes > 59 || seconds > 59) {
      throw new Error(`Invalid time in datetime: "${datetimeStr}"`);
    }

    const date = new Date(now);
    if (day === 'tomorrow') {
      date.setDate(date.getDate() + 1);
    }
    date.setHours(hours, minutes, seconds, 0);
    return date;
  }

  // Try parsing as ISO 8601 or standard Date format
  const date = new Date(trimmed);
  
  if (!isNaN(date.getTime())) {
    // Valid date parsed
    return date;
  }

  throw new Error(
    `Invalid datetime format: "${datetimeStr}". ` +
    `Supported formats: ISO 8601 (2026-01-31T10:00:00Z), ` +
    `date and time (2026-01-31 10:00:00), date only (2026-01-31), ` +
    `today/tomorrow with time (today 10:00, tomorrow 14:30), or "now"`
  );
}

/**
 * Calculate a future datetime by adding a duration to now
 * Used for --in option (e.g., --in 1h30m)
 * 
 * @param {string} durationStr - Duration string (e.g., "30s", "5m", "2h", "1d", "1h30m")
 * @param {Date} [fromDate] - Starting date (default: now)
 * @returns {Date} Future datetime
 * @throws {Error} If the duration string is invalid
 * 
 * @example
 * parseRunIn('1h30m')   // Returns Date for 1 hour 30 minutes from now
 * parseRunIn('1d')      // Returns Date for 1 day from now
 * parseRunIn('30m')     // Returns Date for 30 minutes from now
 */
export function parseRunIn(durationStr, fromDate = new Date()) {
  if (typeof durationStr !== 'string') {
    throw new Error('Duration must be a string');
  }

  const trimmed = durationStr.trim();
  
  if (trimmed === '') {
    throw new Error('Duration cannot be empty');
  }

  // Parse the duration to get milliseconds
  const durationMs = parseDuration(trimmed);
  
  // Calculate future datetime
  return new Date(fromDate.getTime() + durationMs);
}

/**
 * Convert a datetime option (either --at or --in) to an ISO datetime string
 * This is the main entry point for job creation
 * 
 * @param {object} options - Options object with either 'at' or 'in' property
 * @param {string} [options.at] - Datetime string for --at option
 * @param {string} [options.in] - Duration string for --in option
 * @returns {string} ISO 8601 datetime string
 * @throws {Error} If neither or both options are provided, or if parsing fails
 * 
 * @example
 * parseRunAtOption({ at: '2026-01-31T10:00:00Z' })  // Returns ISO string
 * parseRunAtOption({ in: '1h30m' })                 // Returns ISO string for 1h30m from now
 */
export function parseRunAtOption(options) {
  if (!options || typeof options !== 'object') {
    throw new Error('Options must be an object');
  }

  const hasAt = options.at !== undefined && options.at !== null && options.at !== '';
  const hasIn = options.in !== undefined && options.in !== null && options.in !== '';

  if (!hasAt && !hasIn) {
    throw new Error('Either "at" or "in" option must be provided');
  }

  if (hasAt && hasIn) {
    throw new Error('Cannot specify both "at" and "in" options');
  }

  if (hasIn) {
    const date = parseRunIn(options.in);
    return date.toISOString();
  }

  if (hasAt) {
    const date = parseDateTime(options.at);
    return date.toISOString();
  }

  throw new Error('Unexpected error parsing datetime option');
}

/**
 * Check if a datetime has passed (is in the past)
 * 
 * @param {Date|string} date - Date to check
 * @param {Date} [referenceDate] - Reference date (default: now)
 * @returns {boolean} True if the date is in the past
 */
export function isDateTimePast(date, referenceDate = new Date()) {
  const checkDate = date instanceof Date ? date : new Date(date);
  
  if (isNaN(checkDate.getTime())) {
    throw new Error('Invalid date provided');
  }
  
  return checkDate.getTime() < referenceDate.getTime();
}

/**
 * Format a date for display in CLI output
 * 
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted date string
 */
export function formatDateTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  
  if (isNaN(d.getTime())) {
    return 'Invalid date';
  }
  
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/**
 * Get relative time description (e.g., "in 5 minutes", "2 hours ago")
 * 
 * @param {Date|string} date - Date to describe
 * @param {Date} [referenceDate] - Reference date (default: now)
 * @returns {string} Relative time description
 */
export function getRelativeTimeDescription(date, referenceDate = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  
  if (isNaN(d.getTime())) {
    return 'Invalid date';
  }
  
  const diffMs = d.getTime() - referenceDate.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHour = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHour / 24);
  
  if (Math.abs(diffSec) < 60) {
    return diffSec >= 0 ? 'in a few seconds' : 'just now';
  }
  
  if (Math.abs(diffMin) < 60) {
    return diffMin >= 0 
      ? `in ${diffMin} minute${diffMin !== 1 ? 's' : ''}`
      : `${Math.abs(diffMin)} minute${Math.abs(diffMin) !== 1 ? 's' : ''} ago`;
  }
  
  if (Math.abs(diffHour) < 24) {
    return diffHour >= 0
      ? `in ${diffHour} hour${diffHour !== 1 ? 's' : ''}`
      : `${Math.abs(diffHour)} hour${Math.abs(diffHour) !== 1 ? 's' : ''} ago`;
  }
  
  if (Math.abs(diffDay) < 30) {
    return diffDay >= 0
      ? `in ${diffDay} day${diffDay !== 1 ? 's' : ''}`
      : `${Math.abs(diffDay)} day${Math.abs(diffDay) !== 1 ? 's' : ''} ago`;
  }
  
  return formatDateTime(d);
}
