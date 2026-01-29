/**
 * Logger utilities for jm2
 * Provides consistent logging for daemon and job execution
 */

import { appendFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { getDaemonLogFile, getJobLogFile, ensureLogsDir } from '../utils/paths.js';

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
 * Write a log line to a file
 * @param {string} filePath - File path
 * @param {string} line - Log line
 */
function writeToFile(filePath, line) {
  ensureFileDir(filePath);
  appendFileSync(filePath, line + '\n', 'utf8');
}

/**
 * Create a logger instance
 * @param {object} options - Logger options
 * @param {string} options.name - Logger name (for prefixing)
 * @param {string} options.file - Log file path (optional)
 * @param {boolean} options.console - Log to console (default: false for daemon)
 * @returns {object} Logger instance
 */
export function createLogger(options = {}) {
  const { name = 'jm2', file = null, console: logToConsole = false } = options;

  const log = (level, message, meta = {}) => {
    if (!shouldLog(level)) {
      return;
    }

    const line = formatLogLine(level, `[${name}] ${message}`, meta);

    if (file) {
      writeToFile(file, line);
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
  return createLogger({
    name: 'daemon',
    file: getDaemonLogFile(),
    console: options.foreground || false,
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
  return createLogger({
    name: jobName,
    file: getJobLogFile(jobName),
    console: false,
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
};
