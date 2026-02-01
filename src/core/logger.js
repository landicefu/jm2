/**
 * Logger utilities for JM2
 * Provides consistent logging for daemon and job execution
 */

import { appendFileSync, writeFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { getDaemonLogFile, getJobLogFile, ensureLogsDir } from '../utils/paths.js';
import { getConfigValue } from './config.js';

/**
 * Log levels
 */
export const LogLevel = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
};

/**
 * Log level priority (higher = more severe)
 */
const LOG_LEVEL_PRIORITY = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
};

/**
 * Current minimum log level (can be set via environment variable)
 */
let minLogLevel = process.env.JM2_LOG_LEVEL?.toUpperCase() || LogLevel.INFO;

/**
 * Set the minimum log level
 * @param {string} level - Log level (DEBUG, INFO, WARN, ERROR)
 */
export function setLogLevel(level) {
  const upperLevel = level.toUpperCase();
  if (LOG_LEVEL_PRIORITY[upperLevel] !== undefined) {
    minLogLevel = upperLevel;
  }
}

/**
 * Get the current minimum log level
 * @returns {string} Current log level
 */
export function getLogLevel() {
  return minLogLevel;
}

/**
 * Check if a log level should be logged based on current minimum level
 * @param {string} level - Log level to check
 * @returns {boolean} True if should be logged
 */
function shouldLog(level) {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[minLogLevel];
}

/**
 * Format a timestamp for logging
 * @param {Date} date - Date to format
 * @returns {string} Formatted timestamp
 */
function formatTimestamp(date = new Date()) {
  return date.toISOString();
}

/**
 * Format a log message
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {object} meta - Additional metadata
 * @returns {string} Formatted log line
 */
function formatLogLine(level, message, meta = {}) {
  const timestamp = formatTimestamp();
  const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level}] ${message}${metaStr}`;
}

/**
 * Ensure the directory for a file exists
 * @param {string} filePath - File path
 */
function ensureFileDir(filePath) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Write a log line to a file with rotation support
 * @param {string} filePath - File path
 * @param {string} line - Log line
 * @param {object} rotation - Rotation options
 * @param {number} rotation.maxSize - Maximum file size in bytes
 * @param {number} rotation.maxFiles - Maximum number of log files to keep
 */
function writeToFile(filePath, line, rotation = null) {
  ensureFileDir(filePath);
  
  // Check for rotation if options provided
  if (rotation && rotation.maxSize > 0) {
    checkAndRotate(filePath, rotation.maxSize, rotation.maxFiles || 3);
  }
  
  appendFileSync(filePath, line + '\n', 'utf8');
}

/**
 * Get file size in bytes
 * @param {string} filePath - File path
 * @returns {number} File size in bytes, or 0 if file doesn't exist
 */
function getFileSize(filePath) {
  try {
    if (existsSync(filePath)) {
      return statSync(filePath).size;
    }
  } catch {
    // Ignore errors
  }
  return 0;
}

/**
 * Rotate log files
 * Renames existing log files: file.log -> file.log.1 -> file.log.2 -> ...
 * @param {string} filePath - Base log file path
 * @param {number} maxFiles - Maximum number of log files to keep (including current)
 */
function rotateLogs(filePath, maxFiles) {
  // Start from the oldest file and work backwards
  for (let i = maxFiles - 1; i >= 0; i--) {
    const srcPath = i === 0 ? filePath : `${filePath}.${i}`;
    const destPath = `${filePath}.${i + 1}`;
    
    try {
      if (existsSync(srcPath)) {
        if (i === maxFiles - 1) {
          // Delete the oldest file
          try {
            unlinkSync(srcPath);
          } catch {
            // Ignore unlink errors
          }
        } else {
          renameSync(srcPath, destPath);
        }
      }
    } catch {
      // Ignore rotation errors
    }
  }
}

/**
 * Check if log rotation is needed and perform rotation
 * @param {string} filePath - Log file path
 * @param {number} maxSize - Maximum file size in bytes
 * @param {number} maxFiles - Maximum number of log files to keep
 */
function checkAndRotate(filePath, maxSize, maxFiles) {
  const fileSize = getFileSize(filePath);
  if (fileSize >= maxSize) {
    rotateLogs(filePath, maxFiles);
  }
}

/**
 * Parse size string to bytes
 * Supports formats like: 100, 10kb, 5mb, 1gb
 * @param {string|number} size - Size string or number (in bytes)
 * @returns {number} Size in bytes
 */
export function parseSize(size) {
  if (typeof size === 'number') {
    return size;
  }
  
  const match = String(size).trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/);
  if (!match) {
    return 0;
  }
  
  const value = parseFloat(match[1]);
  const unit = match[2] || 'b';
  
  const multipliers = {
    'b': 1,
    'kb': 1024,
    'mb': 1024 * 1024,
    'gb': 1024 * 1024 * 1024,
  };
  
  return Math.floor(value * multipliers[unit]);
}

/**
 * Format bytes to human readable string
 * @param {number} bytes - Size in bytes
 * @returns {string} Human readable size (e.g., "10MB")
 */
export function formatSize(bytes) {
  if (bytes === 0) return '0B';
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  
  return `${value.toFixed(i === 0 ? 0 : 1)}${units[i]}`;
}

/**
 * Create a logger instance
 * @param {object} options - Logger options
 * @param {string} options.name - Logger name (for prefixing)
 * @param {string} options.file - Log file path (optional)
 * @param {boolean} options.console - Log to console (default: false for daemon)
 * @param {object} options.rotation - Rotation options
 * @param {number} options.rotation.maxSize - Maximum file size in bytes
 * @param {number} options.rotation.maxFiles - Maximum number of log files to keep
 * @returns {object} Logger instance
 */
export function createLogger(options = {}) {
  const { name = 'JM2', file = null, console: logToConsole = false, rotation = null } = options;

  const log = (level, message, meta = {}) => {
    if (!shouldLog(level)) {
      return;
    }

    const line = formatLogLine(level, `[${name}] ${message}`, meta);

    if (file) {
      writeToFile(file, line, rotation);
    }

    if (logToConsole) {
      const consoleFn = level === LogLevel.ERROR ? console.error :
                        level === LogLevel.WARN ? console.warn :
                        console.log;
      consoleFn(line);
    }
  };

  return {
    debug: (message, meta) => log(LogLevel.DEBUG, message, meta),
    info: (message, meta) => log(LogLevel.INFO, message, meta),
    warn: (message, meta) => log(LogLevel.WARN, message, meta),
    error: (message, meta) => log(LogLevel.ERROR, message, meta),
    log,
  };
}

/**
 * Create a daemon logger
 * Logs to ~/.jm2/daemon.log
 * @param {object} options - Additional options
 * @returns {object} Logger instance
 */
export function createDaemonLogger(options = {}) {
  // Get rotation settings from config
  const maxFileSize = getConfigValue('logging.maxFileSize', 10 * 1024 * 1024);
  const maxFiles = getConfigValue('logging.maxFiles', 5);
  
  return createLogger({
    name: 'daemon',
    file: getDaemonLogFile(),
    console: options.foreground || false,
    rotation: {
      maxSize: maxFileSize,
      maxFiles: maxFiles,
    },
    ...options,
  });
}

/**
 * Create a job logger
 * Logs to ~/.jm2/logs/{jobName}.log
 * @param {string} jobName - Job name
 * @param {object} options - Additional options
 * @returns {object} Logger instance
 */
export function createJobLogger(jobName, options = {}) {
  ensureLogsDir();
  
  // Get rotation settings from config
  const maxFileSize = getConfigValue('logging.maxFileSize', 10 * 1024 * 1024);
  const maxFiles = getConfigValue('logging.maxFiles', 5);
  
  return createLogger({
    name: jobName,
    file: getJobLogFile(jobName),
    console: false,
    rotation: {
      maxSize: maxFileSize,
      maxFiles: maxFiles,
    },
    ...options,
  });
}

/**
 * Log job execution start
 * @param {object} logger - Logger instance
 * @param {object} job - Job object
 * @param {string} triggeredBy - What triggered the execution (scheduled, manual)
 */
export function logJobStart(logger, job, triggeredBy = 'scheduled') {
  logger.info(`Job execution started`, {
    jobId: job.id,
    jobName: job.name,
    command: job.command,
    triggeredBy,
  });
}

/**
 * Log job execution completion
 * @param {object} logger - Logger instance
 * @param {object} job - Job object
 * @param {object} result - Execution result
 */
export function logJobComplete(logger, job, result) {
  const level = result.exitCode === 0 ? LogLevel.INFO : LogLevel.ERROR;
  logger.log(level, `Job execution completed`, {
    jobId: job.id,
    jobName: job.name,
    exitCode: result.exitCode,
    duration: result.duration,
    success: result.exitCode === 0,
  });
}

/**
 * Log job output (stdout/stderr)
 * @param {object} logger - Logger instance
 * @param {string} stream - 'stdout' or 'stderr'
 * @param {string} data - Output data
 */
export function logJobOutput(logger, stream, data) {
  const lines = data.toString().split('\n').filter(line => line.trim());
  for (const line of lines) {
    if (stream === 'stderr') {
      logger.error(`[${stream}] ${line}`);
    } else {
      logger.info(`[${stream}] ${line}`);
    }
  }
}

/**
 * Clear a log file
 * @param {string} filePath - File path to clear
 */
export function clearLogFile(filePath) {
  ensureFileDir(filePath);
  writeFileSync(filePath, '', 'utf8');
}

export default {
  LogLevel,
  setLogLevel,
  getLogLevel,
  createLogger,
  createDaemonLogger,
  createJobLogger,
  logJobStart,
  logJobComplete,
  logJobOutput,
  clearLogFile,
  parseSize,
  formatSize,
};
