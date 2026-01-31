/**
 * jm2 history command
 * Show execution history for jobs
 */

import { send } from '../../ipc/client.js';
import { MessageType } from '../../ipc/protocol.js';
import {
  printSuccess,
  printError,
  printInfo,
  printHeader,
  formatDate,
  formatDuration,
} from '../utils/output.js';
import { isDaemonRunning } from '../../daemon/index.js';
import { getHistory } from '../../core/storage.js';
import chalk from 'chalk';
import Table from 'cli-table3';

/**
 * Execute the history command
 * @param {string} jobRef - Job ID or name (optional)
 * @param {object} options - Command options
 * @returns {Promise<number>} Exit code
 */
export async function historyCommand(jobRef, options = {}) {
  // Check if daemon is running
  if (!isDaemonRunning()) {
    printError('Daemon is not running. Start it with: jm2 start');
    return 1;
  }

  try {
    let history;
    let jobName = null;

    if (jobRef) {
      // Get specific job's history
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
      jobName = job.name || String(job.id);

      // Get history and filter by job ID
      const allHistory = getHistory();
      history = allHistory.filter(entry => entry.jobId === job.id);
    } else {
      // Get all history
      history = getHistory();
    }

    // Apply filters
    if (options.failed) {
      history = history.filter(entry => entry.exitCode !== 0 || entry.status === 'failed');
    }

    if (options.success) {
      history = history.filter(entry => entry.exitCode === 0 || entry.status === 'success');
    }

    // Sort by timestamp (newest first)
    history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Apply limit
    const limit = options.limit || 20;
    if (limit > 0) {
      history = history.slice(0, limit);
    }

    // Display results
    if (history.length === 0) {
      if (jobName) {
        printInfo(`No execution history found for job: ${jobName}`);
      } else {
        printInfo('No execution history found');
      }
      return 0;
    }

    if (jobName) {
      printHeader(`Execution History for: ${jobName}`);
    } else {
      printHeader('Execution History');
    }

    printHistoryTable(history, !jobName);

    // Print summary
    console.log();
    console.log(`Showing ${chalk.bold(history.length)} entries`);

    return 0;
  } catch (error) {
    printError(`Failed to get history: ${error.message}`);
    return 1;
  }
}

/**
 * Print history as a formatted table
 * @param {Array} history - Array of history entries
 * @param {boolean} showJobName - Whether to show job name column
 */
function printHistoryTable(history, showJobName = false) {
  const headers = [
    chalk.bold('Time'),
    chalk.bold('Status'),
    chalk.bold('Duration'),
    chalk.bold('Exit'),
  ];

  if (showJobName) {
    headers.splice(1, 0, chalk.bold('Job'));
  }

  const colWidths = showJobName 
    ? [20, 15, 10, 12, 8]
    : [20, 10, 12, 8];

  const table = new Table({
    head: headers,
    colWidths,
    wordWrap: true,
  });

  for (const entry of history) {
    const row = [
      formatDate(entry.timestamp),
      formatStatus(entry.status, entry.exitCode),
      entry.duration ? formatDuration(entry.duration) : '-',
      entry.exitCode !== undefined ? entry.exitCode : '-',
    ];

    if (showJobName) {
      row.splice(1, 0, entry.jobName || `Job ${entry.jobId}`);
    }

    table.push(row);
  }

  console.log(table.toString());
}

/**
 * Format status with color
 * @param {string} status - Status string
 * @param {number} exitCode - Exit code
 * @returns {string} Colorized status
 */
function formatStatus(status, exitCode) {
  if (status === 'timeout') {
    return chalk.yellow('timeout');
  }
  if (exitCode === 0 || status === 'success') {
    return chalk.green('success');
  }
  if (status === 'failed' || (exitCode !== undefined && exitCode !== 0)) {
    return chalk.red('failed');
  }
  return chalk.gray(status || 'unknown');
}

export default { historyCommand };
