/**
 * JM2 start command
 * Starts the JM2 daemon process
 */

import { startDaemon, isDaemonRunning, getDaemonStatus } from '../../daemon/index.js';
import { printSuccess, printError, printInfo } from '../utils/output.js';

/**
 * Execute the start command
 * @param {object} options - Command options
 * @param {boolean} options.foreground - Run in foreground mode
 * @returns {Promise<number>} Exit code
 */
export async function startCommand(options = {}) {
  const { foreground = false } = options;

  // Check if daemon is already running
  if (isDaemonRunning()) {
    const { pid } = getDaemonStatus();
    printInfo(`Daemon is already running (PID: ${pid})`);
    return 0;
  }

  try {
    if (foreground) {
      printInfo('Starting daemon in foreground mode...');
    } else {
      printInfo('Starting daemon...');
    }

    await startDaemon({ foreground });

    if (!foreground) {
      const { pid } = getDaemonStatus();
      printSuccess(`Daemon started (PID: ${pid})`);
    }

    return 0;
  } catch (error) {
    printError(`Failed to start daemon: ${error.message}`);
    return 1;
  }
}

export default startCommand;
