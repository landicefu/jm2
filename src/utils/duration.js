/**
 * Duration parsing utilities for jm2
 * Parses human-readable duration strings like "30s", "5m", "2h", "1d", "1w", "1h30m"
 */

/**
 * Duration unit multipliers in milliseconds
 */
const UNIT_MS = {
  s: 1000,           // seconds
  m: 60 * 1000,      // minutes
  h: 60 * 60 * 1000, // hours
  d: 24 * 60 * 60 * 1000, // days
  w: 7 * 24 * 60 * 60 * 1000, // weeks
};

/**
 * Valid duration units
 */
const VALID_UNITS = Object.keys(UNIT_MS);

/**
 * Regular expression to match duration components
 * Matches patterns like "30s", "5m", "2h", "1d", "1w"
 */
const DURATION_COMPONENT_REGEX = /(\d+)([smhdw])/gi;

/**
 * Regular expression to validate the entire duration string
 * Ensures the string only contains valid duration components
 */
const DURATION_FULL_REGEX = /^(\d+[smhdw])+$/i;

/**
 * Parse a duration string into milliseconds
 * 
 * @param {string} durationStr - Duration string (e.g., "30s", "5m", "2h", "1d", "1w", "1h30m")
 * @returns {number} Duration in milliseconds
 * @throws {Error} If the duration string is invalid
 * 
 * @example
 * parseDuration("30s")   // 30000
 * parseDuration("5m")    // 300000
 * parseDuration("2h")    // 7200000
 * parseDuration("1d")    // 86400000
 * parseDuration("1w")    // 604800000
 * parseDuration("1h30m") // 5400000
 */
export function parseDuration(durationStr) {
  if (typeof durationStr !== 'string') {
    throw new Error('Duration must be a string');
  }

  const trimmed = durationStr.trim();
  
  if (trimmed === '') {
    throw new Error('Duration cannot be empty');
  }

  // Validate the overall format
  if (!DURATION_FULL_REGEX.test(trimmed)) {
    throw new Error(
      `Invalid duration format: "${durationStr}". ` +
      `Expected format like "30s", "5m", "2h", "1d", "1w", or combined like "1h30m"`
    );
  }

  let totalMs = 0;
  let match;

  // Reset regex lastIndex for global matching
  DURATION_COMPONENT_REGEX.lastIndex = 0;

  while ((match = DURATION_COMPONENT_REGEX.exec(trimmed)) !== null) {
    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    if (value < 0) {
      throw new Error('Duration values cannot be negative');
    }

    if (value === 0 && trimmed === `0${unit}`) {
      throw new Error('Duration cannot be zero');
    }

    totalMs += value * UNIT_MS[unit];
  }

  if (totalMs === 0) {
    throw new Error('Duration cannot be zero');
  }

  return totalMs;
}

/**
 * Parse a duration string into seconds
 * 
 * @param {string} durationStr - Duration string
 * @returns {number} Duration in seconds
 * @throws {Error} If the duration string is invalid
 */
export function parseDurationSeconds(durationStr) {
  return Math.floor(parseDuration(durationStr) / 1000);
}

/**
 * Format milliseconds into a human-readable duration string
 * 
 * @param {number} ms - Duration in milliseconds
 * @param {object} options - Formatting options
 * @param {boolean} options.short - Use short format (default: true)
 * @param {boolean} options.largest - Only show the largest unit (default: false)
 * @returns {string} Formatted duration string
 * 
 * @example
 * formatDuration(5400000)                    // "1h30m"
 * formatDuration(5400000, { largest: true }) // "1h"
 * formatDuration(90000)                      // "1m30s"
 */
export function formatDuration(ms, options = {}) {
  const { short = true, largest = false } = options;

  if (typeof ms !== 'number' || isNaN(ms)) {
    throw new Error('Duration must be a number');
  }

  if (ms < 0) {
    throw new Error('Duration cannot be negative');
  }

  if (ms === 0) {
    return short ? '0s' : '0 seconds';
  }

  const units = [
    { unit: 'w', ms: UNIT_MS.w, long: 'week' },
    { unit: 'd', ms: UNIT_MS.d, long: 'day' },
    { unit: 'h', ms: UNIT_MS.h, long: 'hour' },
    { unit: 'm', ms: UNIT_MS.m, long: 'minute' },
    { unit: 's', ms: UNIT_MS.s, long: 'second' },
  ];

  const parts = [];
  let remaining = ms;

  for (const { unit, ms: unitMs, long } of units) {
    if (remaining >= unitMs) {
      const value = Math.floor(remaining / unitMs);
      remaining = remaining % unitMs;

      if (short) {
        parts.push(`${value}${unit}`);
      } else {
        parts.push(`${value} ${long}${value !== 1 ? 's' : ''}`);
      }

      if (largest) {
        break;
      }
    }
  }

  if (parts.length === 0) {
    // Less than 1 second
    return short ? `${ms}ms` : `${ms} milliseconds`;
  }

  return short ? parts.join('') : parts.join(' ');
}

/**
 * Check if a string is a valid duration format
 * 
 * @param {string} durationStr - String to validate
 * @returns {boolean} True if valid duration format
 */
export function isValidDuration(durationStr) {
  if (typeof durationStr !== 'string') {
    return false;
  }

  const trimmed = durationStr.trim();
  
  if (trimmed === '') {
    return false;
  }

  if (!DURATION_FULL_REGEX.test(trimmed)) {
    return false;
  }

  // Check that it doesn't result in zero
  try {
    const ms = parseDuration(trimmed);
    return ms > 0;
  } catch {
    return false;
  }
}

/**
 * Get the valid duration units
 * @returns {string[]} Array of valid unit characters
 */
export function getValidUnits() {
  return [...VALID_UNITS];
}

/**
 * Get the milliseconds for a specific unit
 * @param {string} unit - Unit character (s, m, h, d, w)
 * @returns {number|undefined} Milliseconds for the unit, or undefined if invalid
 */
export function getUnitMs(unit) {
  return UNIT_MS[unit.toLowerCase()];
}

export default {
  parseDuration,
  parseDurationSeconds,
  formatDuration,
  isValidDuration,
  getValidUnits,
  getUnitMs,
};
