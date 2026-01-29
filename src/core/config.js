/**
 * Configuration management for jm2
 * Handles daemon and application configuration
 */

import { readJsonFile, writeJsonFile } from './storage.js';
import { getConfigFile } from '../utils/paths.js';

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
  // Daemon settings
  daemon: {
    // Maximum concurrent job executions
    maxConcurrent: 10,
    // Default shell for command execution
    shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
    // Shell arguments
    shellArgs: process.platform === 'win32' ? ['/c'] : ['-c'],
  },
  
  // Job defaults
  jobs: {
    // Default timeout for jobs (null = no timeout)
    defaultTimeout: null,
    // Default retry count
    defaultRetry: 0,
    // Default working directory (null = current directory)
    defaultCwd: null,
  },
  
  // Logging settings
  logging: {
    // Log level (DEBUG, INFO, WARN, ERROR)
    level: 'INFO',
    // Maximum log file size in bytes (10MB)
    maxFileSize: 10 * 1024 * 1024,
    // Number of log files to keep
    maxFiles: 5,
  },
  
  // History settings
  history: {
    // Maximum number of history entries per job
    maxEntriesPerJob: 100,
    // Days to keep history
    retentionDays: 30,
  },
  
  // Cleanup settings
  cleanup: {
    // Auto-cleanup completed one-time jobs after N days
    completedJobRetentionDays: 7,
    // Auto-cleanup old logs after N days
    logRetentionDays: 30,
  },
};

/**
 * Get the current configuration
 * Merges stored config with defaults
 * @returns {object} Configuration object
 */
export function getConfig() {
  const stored = readJsonFile(getConfigFile(), {});
  return deepMerge(DEFAULT_CONFIG, stored);
}

/**
 * Save configuration
 * Only saves values that differ from defaults
 * @param {object} config - Configuration to save
 */
export function saveConfig(config) {
  writeJsonFile(getConfigFile(), config);
}

/**
 * Get a specific configuration value by path
 * @param {string} path - Dot-separated path (e.g., 'daemon.maxConcurrent')
 * @param {*} defaultValue - Default value if path not found
 * @returns {*} Configuration value
 */
export function getConfigValue(path, defaultValue = undefined) {
  const config = getConfig();
  const parts = path.split('.');
  let value = config;
  
  for (const part of parts) {
    if (value === null || value === undefined || typeof value !== 'object') {
      return defaultValue;
    }
    value = value[part];
  }
  
  return value !== undefined ? value : defaultValue;
}

/**
 * Set a specific configuration value by path
 * @param {string} path - Dot-separated path (e.g., 'daemon.maxConcurrent')
 * @param {*} value - Value to set
 */
export function setConfigValue(path, value) {
  const config = getConfig();
  const parts = path.split('.');
  let current = config;
  
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (current[part] === undefined || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part];
  }
  
  current[parts[parts.length - 1]] = value;
  saveConfig(config);
}

/**
 * Reset configuration to defaults
 */
export function resetConfig() {
  saveConfig({});
}

/**
 * Validate configuration object
 * @param {object} config - Configuration to validate
 * @returns {object} Validation result { valid: boolean, errors: string[] }
 */
export function validateConfig(config) {
  const errors = [];
  
  // Validate daemon settings
  if (config.daemon) {
    if (config.daemon.maxConcurrent !== undefined) {
      if (typeof config.daemon.maxConcurrent !== 'number' || config.daemon.maxConcurrent < 1) {
        errors.push('daemon.maxConcurrent must be a positive number');
      }
    }
    if (config.daemon.shell !== undefined) {
      if (typeof config.daemon.shell !== 'string' || config.daemon.shell.length === 0) {
        errors.push('daemon.shell must be a non-empty string');
      }
    }
  }
  
  // Validate job defaults
  if (config.jobs) {
    if (config.jobs.defaultRetry !== undefined) {
      if (typeof config.jobs.defaultRetry !== 'number' || config.jobs.defaultRetry < 0) {
        errors.push('jobs.defaultRetry must be a non-negative number');
      }
    }
  }
  
  // Validate logging settings
  if (config.logging) {
    if (config.logging.level !== undefined) {
      const validLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
      if (!validLevels.includes(config.logging.level)) {
        errors.push(`logging.level must be one of: ${validLevels.join(', ')}`);
      }
    }
    if (config.logging.maxFileSize !== undefined) {
      if (typeof config.logging.maxFileSize !== 'number' || config.logging.maxFileSize < 1024) {
        errors.push('logging.maxFileSize must be at least 1024 bytes');
      }
    }
  }
  
  // Validate history settings
  if (config.history) {
    if (config.history.maxEntriesPerJob !== undefined) {
      if (typeof config.history.maxEntriesPerJob !== 'number' || config.history.maxEntriesPerJob < 1) {
        errors.push('history.maxEntriesPerJob must be a positive number');
      }
    }
    if (config.history.retentionDays !== undefined) {
      if (typeof config.history.retentionDays !== 'number' || config.history.retentionDays < 1) {
        errors.push('history.retentionDays must be a positive number');
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Deep merge two objects
 * @param {object} target - Target object
 * @param {object} source - Source object
 * @returns {object} Merged object
 */
function deepMerge(target, source) {
  const result = { ...target };
  
  for (const key of Object.keys(source)) {
    if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (target[key] !== null && typeof target[key] === 'object' && !Array.isArray(target[key])) {
        result[key] = deepMerge(target[key], source[key]);
      } else {
        result[key] = { ...source[key] };
      }
    } else {
      result[key] = source[key];
    }
  }
  
  return result;
}

export default {
  DEFAULT_CONFIG,
  getConfig,
  saveConfig,
  getConfigValue,
  setConfigValue,
  resetConfig,
  validateConfig,
};
