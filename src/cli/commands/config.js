/**
 * Config command for jm2
 * View and modify configuration settings
 */

import { getConfig, saveConfig, setConfigValue, getConfigValue, validateConfig, DEFAULT_CONFIG } from '../../core/config.js';
import output from '../utils/output.js';

/**
 * Parse a value to the appropriate type based on the config key
 * @param {string} key - Config key
 * @param {string} value - Value as string
 * @returns {*} Parsed value
 */
function parseConfigValue(key, value) {
  // Handle numeric values
  if (key.includes('max') || key.includes('Count') || key.includes('Days') || key.includes('Size')) {
    const num = parseInt(value, 10);
    if (isNaN(num)) {
      throw new Error(`Invalid numeric value: ${value}`);
    }
    return num;
  }
  
  // Handle boolean values
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  
  // Return as string
  return value;
}

/**
 * Format a config value for display
 * @param {*} value - Config value
 * @returns {string} Formatted value
 */
function formatValue(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') {
    // Format large numbers (bytes) as human readable
    if (value >= 1024 * 1024) {
      return `${value} (${(value / 1024 / 1024).toFixed(1)}MB)`;
    }
    if (value >= 1024) {
      return `${value} (${(value / 1024).toFixed(1)}KB)`;
    }
    return String(value);
  }
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Show all configuration settings
 * @param {object} config - Config object
 */
function showAllConfig(config) {
  output.section('Daemon Settings');
  output.keyValue('Max Concurrent', formatValue(config.daemon?.maxConcurrent));
  output.keyValue('Shell', formatValue(config.daemon?.shell));
  output.keyValue('Shell Args', formatValue(config.daemon?.shellArgs));
  
  output.section('Job Defaults');
  output.keyValue('Default Timeout', formatValue(config.jobs?.defaultTimeout));
  output.keyValue('Default Retry', formatValue(config.jobs?.defaultRetry));
  output.keyValue('Default CWD', formatValue(config.jobs?.defaultCwd));
  
  output.section('Logging Settings');
  output.keyValue('Log Level', formatValue(config.logging?.level));
  output.keyValue('Max File Size', formatValue(config.logging?.maxFileSize));
  output.keyValue('Max Files', formatValue(config.logging?.maxFiles));
  
  output.section('History Settings');
  output.keyValue('Max Entries Per Job', formatValue(config.history?.maxEntriesPerJob));
  output.keyValue('Retention Days', formatValue(config.history?.retentionDays));
  
  output.section('Cleanup Settings');
  output.keyValue('Completed Job Retention (days)', formatValue(config.cleanup?.completedJobRetentionDays));
  output.keyValue('Log Retention (days)', formatValue(config.cleanup?.logRetentionDays));
}

/**
 * Config command implementation
 * @param {object} options - Command options
 * @returns {number} Exit code
 */
export async function configCommand(options) {
  try {
    const config = getConfig();
    
    // Show all config if no specific option provided
    if (options.show || Object.keys(options).length === 0 || 
        (!options.logMaxSize && !options.logMaxFiles && !options.level && 
         !options.maxConcurrent && !options.reset)) {
      showAllConfig(config);
      return 0;
    }
    
    // Handle reset
    if (options.reset) {
      saveConfig({});
      output.success('Configuration reset to defaults');
      return 0;
    }
    
    let changes = [];
    
    // Handle log-max-size
    if (options.logMaxSize !== undefined) {
      const size = parseSizeOption(options.logMaxSize);
      if (size === null) {
        output.error(`Invalid size format: ${options.logMaxSize}`);
        output.info('Use formats like: 10mb, 50MB, 100kb, 1gb');
        return 1;
      }
      setConfigValue('logging.maxFileSize', size);
      changes.push(`Log max file size: ${formatValue(size)}`);
    }
    
    // Handle log-max-files
    if (options.logMaxFiles !== undefined) {
      const count = parseInt(options.logMaxFiles, 10);
      if (isNaN(count) || count < 1) {
        output.error(`Invalid file count: ${options.logMaxFiles}`);
        output.info('Must be a positive number');
        return 1;
      }
      setConfigValue('logging.maxFiles', count);
      changes.push(`Log max files: ${count}`);
    }
    
    // Handle log level
    if (options.level !== undefined) {
      const validLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
      const level = options.level.toUpperCase();
      if (!validLevels.includes(level)) {
        output.error(`Invalid log level: ${options.level}`);
        output.info(`Valid levels: ${validLevels.join(', ')}`);
        return 1;
      }
      setConfigValue('logging.level', level);
      changes.push(`Log level: ${level}`);
    }
    
    // Handle max concurrent
    if (options.maxConcurrent !== undefined) {
      const count = parseInt(options.maxConcurrent, 10);
      if (isNaN(count) || count < 1) {
        output.error(`Invalid concurrent count: ${options.maxConcurrent}`);
        output.info('Must be a positive number');
        return 1;
      }
      setConfigValue('daemon.maxConcurrent', count);
      changes.push(`Max concurrent jobs: ${count}`);
    }
    
    // Validate the new config
    const newConfig = getConfig();
    const validation = validateConfig(newConfig);
    if (!validation.valid) {
      output.error('Configuration validation failed:');
      for (const error of validation.errors) {
        output.error(`  - ${error}`);
      }
      return 1;
    }
    
    // Show changes
    if (changes.length > 0) {
      output.success('Configuration updated:');
      for (const change of changes) {
        output.info(`  • ${change}`);
      }
    }
    
    return 0;
  } catch (error) {
    output.error(`Config command failed: ${error.message}`);
    return 1;
  }
}

/**
 * Parse a size option (e.g., "10mb", "50MB")
 * @param {string} value - Size string
 * @returns {number|null} Size in bytes or null if invalid
 */
function parseSizeOption(value) {
  const match = String(value).trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/);
  if (!match) {
    return null;
  }
  
  const num = parseFloat(match[1]);
  const unit = match[2] || 'b';
  
  const multipliers = {
    'b': 1,
    'kb': 1024,
    'mb': 1024 * 1024,
    'gb': 1024 * 1024 * 1024,
  };
  
  return Math.floor(num * multipliers[unit]);
}

export default { configCommand };
