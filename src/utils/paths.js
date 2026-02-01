/**
 * Path utilities for jm2
 * Provides consistent paths for data directory, config files, logs, etc.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';

/**
 * Default data directory name
 */
const DATA_DIR_NAME = '.jm2';

/**
 * Get the base data directory path (~/.jm2/)
 * Can be overridden via JM2_DATA_DIR environment variable for testing
 * @returns {string} The data directory path
 */
export function getDataDir() {
  if (process.env.JM2_DATA_DIR) {
    return process.env.JM2_DATA_DIR;
  }
  return join(homedir(), DATA_DIR_NAME);
}

/**
 * Get the jobs.json file path
 * @returns {string} The jobs file path
 */
export function getJobsFile() {
  return join(getDataDir(), 'jobs.json');
}

/**
 * Get the config.json file path
 * @returns {string} The config file path
 */
export function getConfigFile() {
  return join(getDataDir(), 'config.json');
}

/**
 * Get the daemon.pid file path
 * @returns {string} The PID file path
 */
export function getPidFile() {
  return join(getDataDir(), 'daemon.pid');
}

/**
 * Get the daemon.log file path
 * @returns {string} The daemon log file path
 */
export function getDaemonLogFile() {
  return join(getDataDir(), 'daemon.log');
}

/**
 * Get the logs directory path
 * @returns {string} The logs directory path
 */
export function getLogsDir() {
  return join(getDataDir(), 'logs');
}

/**
 * Get the log file path for a specific job
 * @param {string} jobName - The job name
 * @returns {string} The job log file path
 */
export function getJobLogFile(jobName) {
  return join(getLogsDir(), `${jobName}.log`);
}

/**
 * Get the IPC socket path
 * On Unix: ~/.jm2/daemon.sock
 * On Windows: \\.\pipe\jm2-daemon
 * @returns {string} The socket path
 */
export function getSocketPath() {
  if (process.platform === 'win32') {
    return '\\\\.\\pipe\\jm2-daemon';
  }
  return join(getDataDir(), 'daemon.sock');
}

/**
 * Get the history.json file path for execution history (deprecated, use getHistoryDbFile)
 * @returns {string} The history file path
 * @deprecated Use getHistoryDbFile() instead
 */
export function getHistoryFile() {
  return join(getDataDir(), 'history.json');
}

/**
 * Get the history.db file path for SQLite-based execution history
 * @returns {string} The history database file path
 */
export function getHistoryDbFile() {
  return join(getDataDir(), 'history.db');
}

/**
 * Ensure the data directory exists
 * Creates ~/.jm2/ if it doesn't exist
 * @returns {string} The data directory path
 */
export function ensureDataDir() {
  const dataDir = getDataDir();
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  return dataDir;
}

/**
 * Ensure the logs directory exists
 * Creates ~/.jm2/logs/ if it doesn't exist
 * @returns {string} The logs directory path
 */
export function ensureLogsDir() {
  ensureDataDir();
  const logsDir = getLogsDir();
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
  }
  return logsDir;
}

/**
 * Check if the data directory exists
 * @returns {boolean} True if data directory exists
 */
export function dataDirExists() {
  return existsSync(getDataDir());
}

/**
 * Check if the PID file exists
 * @returns {boolean} True if PID file exists
 */
export function pidFileExists() {
  return existsSync(getPidFile());
}

export default {
  getDataDir,
  getJobsFile,
  getConfigFile,
  getPidFile,
  getDaemonLogFile,
  getLogsDir,
  getJobLogFile,
  getSocketPath,
  getHistoryFile,
  getHistoryDbFile,
  ensureDataDir,
  ensureLogsDir,
  dataDirExists,
  pidFileExists,
};
