/**
 * Output formatting utilities for CLI
 * Provides table formatting, colors, and other output helpers
 */

import chalk from 'chalk';
import Table from 'cli-table3';

/**
 * Format a duration in milliseconds to human-readable string
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
export function formatDuration(ms) {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 
      ? `${minutes}m ${remainingSeconds}s`
      : `${minutes}m`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) {
    return remainingMinutes > 0
      ? `${hours}h ${remainingMinutes}m`
      : `${hours}h`;
  }
  
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0
    ? `${days}d ${remainingHours}h`
    : `${days}d`;
}

/**
 * Format uptime from a start date
 * @param {Date|string} startDate - When the process started
 * @returns {string} Formatted uptime
 */
export function formatUptime(startDate) {
  const start = new Date(startDate);
  const now = new Date();
  const ms = now - start;
  return formatDuration(ms);
}

/**
 * Format a date for display
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted date
 */
export function formatDate(date) {
  if (!date) return chalk.gray('Never');
  const d = new Date(date);
  return d.toLocaleString();
}

/**
 * Format a relative time (e.g., "2 minutes ago", "in 5 minutes")
 * @param {Date|string} date - Date to format
 * @returns {string} Relative time string
 */
export function formatRelativeTime(date) {
  if (!date) return chalk.gray('Never');
  
  const d = new Date(date);
  const now = new Date();
  const diffMs = d - now;
  const absMs = Math.abs(diffMs);
  
  const suffix = diffMs < 0 ? 'ago' : 'in';
  const duration = formatDuration(absMs);
  
  if (diffMs < 0) {
    return chalk.gray(`${duration} ago`);
  } else {
    return chalk.cyan(`in ${duration}`);
  }
}

/**
 * Colorize a job status
 * @param {string} status - Job status
 * @returns {string} Colorized status
 */
export function colorizeStatus(status) {
  switch (status) {
    case 'active':
      return chalk.green('active');
    case 'paused':
      return chalk.yellow('paused');
    case 'completed':
      return chalk.blue('completed');
    case 'failed':
      return chalk.red('failed');
    case 'running':
      return chalk.cyan('running');
    default:
      return chalk.gray(status);
  }
}

/**
 * Colorize daemon status
 * @param {boolean} running - Whether daemon is running
 * @returns {string} Colorized status
 */
export function colorizeDaemonStatus(running) {
  return running 
    ? chalk.green('Running')
    : chalk.red('Stopped');
}

/**
 * Create a table for job listing
 * @returns {Table} CLI table instance
 */
export function createJobTable() {
  return new Table({
    head: [
      chalk.bold('ID'),
      chalk.bold('Name'),
      chalk.bold('Status'),
      chalk.bold('Schedule'),
      chalk.bold('Next Run'),
      chalk.bold('Last Run'),
    ],
    colWidths: [6, 20, 12, 20, 20, 20],
    wordWrap: true,
  });
}

/**
 * Create a table for daemon status
 * @returns {Table} CLI table instance
 */
export function createStatusTable() {
  return new Table({
    colWidths: [20, 40],
    style: {
      head: [],
      border: [],
    },
  });
}

/**
 * Print a success message
 * @param {string} message - Message to print
 */
export function printSuccess(message) {
  console.log(chalk.green('✓'), message);
}

/**
 * Print an error message
 * @param {string} message - Message to print
 */
export function printError(message) {
  console.error(chalk.red('✗'), message);
}

/**
 * Print a warning message
 * @param {string} message - Message to print
 */
export function printWarning(message) {
  console.warn(chalk.yellow('⚠'), message);
}

/**
 * Print an info message
 * @param {string} message - Message to print
 */
export function printInfo(message) {
  console.log(chalk.blue('ℹ'), message);
}

/**
 * Print a section header
 * @param {string} title - Section title
 */
export function printHeader(title) {
  console.log();
  console.log(chalk.bold.underline(title));
  console.log();
}

/**
 * Print a section header (alias for printHeader)
 * @param {string} title - Section title
 */
export function printSection(title) {
  console.log();
  console.log(chalk.bold.underline(title));
  console.log();
}

/**
 * Print a key-value pair
 * @param {string} key - Key label
 * @param {*} value - Value to display
 */
export function printKeyValue(key, value) {
  console.log(`  ${chalk.cyan(key)}: ${value}`);
}

/**
 * Print an empty line
 */
export function printEmptyLine() {
  console.log();
}

/**
 * Format job schedule for display
 * @param {object} job - Job object
 * @returns {string} Formatted schedule
 */
export function formatJobSchedule(job) {
  if (job.cron) {
    return chalk.gray(job.cron);
  } else if (job.runAt) {
    return chalk.gray(`at ${formatDate(job.runAt)}`);
  } else {
    return chalk.gray('Manual only');
  }
}

export default {
  formatDuration,
  formatUptime,
  formatDate,
  formatRelativeTime,
  colorizeStatus,
  colorizeDaemonStatus,
  createJobTable,
  createStatusTable,
  printSuccess,
  printError,
  printWarning,
  printInfo,
  printHeader,
  printEmptyLine,
  formatJobSchedule,
  printSection,
  printKeyValue,
  // Aliases for convenience
  success: printSuccess,
  error: printError,
  warning: printWarning,
  info: printInfo,
  section: printSection,
  keyValue: printKeyValue,
};
