/**
 * jm2 logs command
 * View job execution logs with tail, follow, and time filtering
 */

import { createReadStream, existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { watch } from 'node:fs';
import { send } from '../../ipc/client.js';
import { MessageType } from '../../ipc/protocol.js';
import {
  printSuccess,
  printError,
  printInfo,
  printWarning,
} from '../utils/output.js';
import { isDaemonRunning } from '../../daemon/index.js';
import { getJobLogFile } from '../../utils/paths.js';
import { parseDuration } from '../../utils/duration.js';
import chalk from 'chalk';

/**
 * Execute the logs command
 * @param {string} jobRef - Job ID or name
 * @param {object} options - Command options
 * @returns {Promise<number>} Exit code
 */
export async function logsCommand(jobRef, options = {}) {
  // Check if daemon is running
  if (!isDaemonRunning()) {
    printError('Daemon is not running. Start it with: jm2 start');
    return 1;
  }

  if (!jobRef || jobRef.trim() === '') {
    printError('Job ID or name is required');
    return 1;
  }

  try {
    // Get job details to find the job name (for log file path)
    const jobId = parseInt(jobRef, 10);
    const message = isNaN(jobId)
      ? { type: MessageType.JOB_GET, jobName: jobRef }
      : { type: MessageType.JOB_GET, jobId };

    const response = await send(message);

    if (response.type === MessageType.ERROR) {
      printError(response.message);
      return 1;
    }

    if (response.type !== MessageType.JOB_GET_RESULT || !response.job) {
      printError(`Job not found: ${jobRef}`);
      return 1;
    }

    const job = response.job;
    const logFile = getJobLogFile(job.name || `job-${job.id}`);

    // Check if log file exists
    if (!existsSync(logFile)) {
      printInfo(`No log file found for job: ${job.name || job.id}`);
      printInfo(`Log file would be at: ${logFile}`);
      return 0;
    }

    // Parse time filters
    const sinceDate = options.since ? parseTimeOption(options.since) : null;
    const untilDate = options.until ? parseTimeOption(options.until) : null;

    // Handle follow mode
    if (options.follow) {
      await followLogFile(logFile, {
        since: sinceDate,
        until: untilDate,
        timestamps: options.timestamps,
      });
      return 0;
    }

    // Handle regular log viewing (tail)
    await showLogFile(logFile, {
      lines: options.lines,
      since: sinceDate,
      until: untilDate,
      timestamps: options.timestamps,
    });

    return 0;
  } catch (error) {
    printError(`Failed to get logs: ${error.message}`);
    return 1;
  }
}

/**
 * Parse time option (relative like "1h" or absolute date)
 * @param {string} value - Time option value
 * @returns {Date} Parsed date
 */
function parseTimeOption(value) {
  if (!value) return null;

  // Check if it's a relative time (e.g., "1h", "30m", "2d")
  const relativeMatch = value.match(/^(\d+)([smhd])$/i);
  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2].toLowerCase();
    const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    const ms = amount * multipliers[unit];
    return new Date(Date.now() - ms);
  }

  // Try parsing as absolute date
  const date = new Date(value);
  if (!isNaN(date.getTime())) {
    return date;
  }

  throw new Error(`Invalid time format: "${value}". Use relative (e.g., "1h", "30m") or absolute date.`);
}

/**
 * Show log file content with tail and time filtering
 * @param {string} logFile - Path to log file
 * @param {object} options - Options
 */
async function showLogFile(logFile, options) {
  const { lines = 50, since, until, timestamps = true } = options;

  try {
    // Read file stats
    const stats = statSync(logFile);
    
    if (stats.size === 0) {
      printInfo('Log file is empty');
      return;
    }

    // If we need to filter by time or show all lines, read entire file
    // Otherwise use efficient tail
    let logLines;
    if (since || until) {
      // Read entire file for time filtering
      const content = await readFile(logFile, 'utf8');
      logLines = content.split('\n').filter(line => line.trim() !== '');
    } else {
      // Use efficient tail
      logLines = await tailFile(logFile, lines);
    }

    // Filter by time if specified
    if (since || until) {
      logLines = filterLinesByTime(logLines, since, until);
      // Apply line limit after filtering
      if (lines && logLines.length > lines) {
        logLines = logLines.slice(-lines);
      }
    }

    // Print the lines
    if (logLines.length === 0) {
      printInfo('No log entries match the specified criteria');
      return;
    }

    for (const line of logLines) {
      printLogLine(line, timestamps);
    }
  } catch (error) {
    printError(`Error reading log file: ${error.message}`);
  }
}

/**
 * Efficiently read the last N lines from a file
 * @param {string} filePath - Path to file
 * @param {number} lineCount - Number of lines to read
 * @returns {Promise<string[]>} Array of lines
 */
async function tailFile(filePath, lineCount) {
  const lines = [];
  const fileStream = createReadStream(filePath);
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    lines.push(line);
    if (lines.length > lineCount) {
      lines.shift();
    }
  }

  return lines;
}

/**
 * Filter log lines by time range
 * @param {string[]} lines - Log lines
 * @param {Date} since - Start date
 * @param {Date} until - End date
 * @returns {string[]} Filtered lines
 */
function filterLinesByTime(lines, since, until) {
  return lines.filter(line => {
    const timestamp = extractTimestamp(line);
    if (!timestamp) return true; // Include lines without timestamps

    if (since && timestamp < since) return false;
    if (until && timestamp > until) return false;
    return true;
  });
}

/**
 * Extract timestamp from log line
 * Assumes ISO 8601 format at start of line
 * @param {string} line - Log line
 * @returns {Date|null} Extracted date or null
 */
function extractTimestamp(line) {
  // Match ISO 8601 timestamp at start of line (e.g., 2026-01-31T10:00:00.000Z)
  const match = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)/);
  if (match) {
    const date = new Date(match[1]);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  return null;
}

/**
 * Print a log line with optional timestamp formatting
 * @param {string} line - Log line
 * @param {boolean} showTimestamps - Whether to show timestamps
 */
function printLogLine(line, showTimestamps = true) {
  if (!showTimestamps) {
    // Remove timestamp prefix if present
    const cleaned = line.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z\s*/, '');
    console.log(cleaned);
  } else {
    // Highlight timestamp if present
    const match = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)(\s*)(.*)/);
    if (match) {
      const [, timestamp, space, rest] = match;
      console.log(`${chalk.gray(timestamp)}${space}${rest}`);
    } else {
      console.log(line);
    }
  }
}

/**
 * Follow log file in real-time
 * @param {string} logFile - Path to log file
 * @param {object} options - Options
 */
async function followLogFile(logFile, options) {
  const { since, until, timestamps = true } = options;

  printInfo(`Following log file: ${logFile}`);
  printInfo('Press Ctrl+C to stop');
  console.log();

  // Show existing content first
  await showLogFile(logFile, { lines: 50, since, until, timestamps });

  // Set up file watcher
  let lastSize = statSync(logFile).size;

  return new Promise((resolve, reject) => {
    const watcher = watch(logFile, (eventType) => {
      if (eventType === 'change') {
        try {
          const stats = statSync(logFile);
          if (stats.size > lastSize) {
            // Read new content
            const newContent = readFileSync(logFile, 'utf8', { start: lastSize });
            const lines = newContent.split('\n').filter(line => line.trim() !== '');
            
            for (const line of lines) {
              // Check until filter
              if (until) {
                const timestamp = extractTimestamp(line);
                if (timestamp && timestamp > until) {
                  watcher.close();
                  resolve();
                  return;
                }
              }
              printLogLine(line, timestamps);
            }
            
            lastSize = stats.size;
          }
        } catch (error) {
          printWarning(`Error reading log file: ${error.message}`);
        }
      }
    });

    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
      watcher.close();
      console.log();
      printInfo('Stopped following logs');
      resolve();
    });
  });
}

// Import readFileSync for follow mode
import { readFileSync } from 'node:fs';

export default { logsCommand };
