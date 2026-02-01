/**
 * JM2 flush command
 * Cleans up completed one-time jobs, old logs, and old history entries
 */

import { send } from '../../ipc/client.js';
import { MessageType } from '../../ipc/protocol.js';
import { printSuccess, printError, printInfo, printWarning } from '../utils/output.js';
import { isDaemonRunning } from '../../daemon/index.js';
import { confirmDestructive } from '../utils/prompts.js';
import { parseDuration } from '../../utils/duration.js';

/**
 * Execute the flush command
 * @param {object} options - Command options
 * @returns {Promise<number>} Exit code
 */
export async function flushCommand(options = {}) {
  // Check if daemon is running
  if (!isDaemonRunning()) {
    printError('Daemon is not running. Start it with: jm2 start');
    return 1;
  }

  // Build a summary of what will be flushed
  const actions = [];
  if (options.jobs !== false) {
    actions.push('completed one-time jobs');
  }
  if (options.logs) {
    actions.push(`logs older than ${options.logs}`);
  }
  if (options.history) {
    actions.push(`history entries older than ${options.history}`);
  }
  if (options.all) {
    actions.length = 0;
    actions.push('completed one-time jobs, all logs, and all history');
  }

  if (actions.length === 0) {
    actions.push('completed one-time jobs (default)');
  }

  // Confirm destructive action unless --force is used
  const action = `flush ${actions.join(', ')}`;
  const confirmed = await confirmDestructive(action, options.force);
  if (!confirmed) {
    printInfo('Operation cancelled');
    return 0;
  }

  try {
    // Build flush request
    const flushRequest = {
      type: MessageType.FLUSH,
      jobs: options.jobs !== false && !options.all,
      logs: options.logs || options.all || false,
      logsAge: options.logs || null,
      history: options.history || options.all || false,
      historyAge: options.history || null,
    };

    // Parse duration options if provided
    if (flushRequest.logsAge && !options.all) {
      const duration = parseDuration(flushRequest.logsAge);
      if (duration === null) {
        printError(`Invalid duration for --logs: ${options.logs}`);
        return 1;
      }
      flushRequest.logsAgeMs = duration;
    }

    if (flushRequest.historyAge && !options.all) {
      const duration = parseDuration(flushRequest.historyAge);
      if (duration === null) {
        printError(`Invalid duration for --history: ${options.history}`);
        return 1;
      }
      flushRequest.historyAgeMs = duration;
    }

    const response = await send(flushRequest);

    if (response.type === MessageType.ERROR) {
      printError(response.message);
      return 1;
    }

    if (response.type === MessageType.FLUSH_RESULT) {
      // Report results
      let hasResults = false;

      if (response.jobsRemoved > 0) {
        printSuccess(`Removed ${response.jobsRemoved} completed one-time job(s)`);
        hasResults = true;
      } else if (options.jobs !== false && !options.all) {
        printInfo('No completed one-time jobs to remove');
      }

      if (options.logs || options.all) {
        if (response.logsRemoved > 0) {
          printSuccess(`Removed ${response.logsRemoved} log file(s)`);
          hasResults = true;
        } else {
          printInfo('No log files to remove');
        }
      }

      if (options.history || options.all) {
        if (response.historyRemoved > 0) {
          printSuccess(`Removed ${response.historyRemoved} history entries(s)`);
          hasResults = true;
        } else {
          printInfo('No history entries to remove');
        }
      }

      if (!hasResults && options.jobs === false) {
        printInfo('Nothing to flush');
      }

      return 0;
    }

    printError('Unexpected response from daemon');
    return 1;
  } catch (error) {
    printError(`Failed to flush: ${error.message}`);
    return 1;
  }
}
