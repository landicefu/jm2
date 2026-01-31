/**
 * jm2 stop command
 * Stops the jm2 daemon process
 */

import { stopDaemon, isDaemonRunning, getDaemonStatus } from '../../daemon/index.js';
import { printSuccess, printError, printInfo, printWarning } from '../utils/output.js';

/**
 * Execute the stop command
 * @param {object} _options - Command options (none for stop)
 * @returns {Promise<number>} Exit code
 */
export async function stopCommand(_options = {}) {
  // Check if daemon is running
  if (!isDaemonRunning()) {
    printError('Daemon is not running');
    return 3; // Specific exit code for daemon not running
  }

  const { pid } = getDaemonStatus();
  printInfo(`Stopping daemon (PID: ${pid})...`);

  try {
    const stopped = stopDaemon();

    if (stopped) {
      // Wait a moment to confirm the daemon stopped
      await new Promise(resolve => setTimeout(resolve, 500));

      if (!isDaemonRunning()) {
        printSuccess('Daemon stopped');
        return 0;
      } else {
        printWarning('Daemon may not have stopped cleanly');
        return 1;
      }
    } else {
      printError('Failed to send stop signal to daemon');
      return 1;
    }
  } catch (error) {
    printError(`Failed to stop daemon: ${error.message}`);
    return 1;
  }
}

export default stopCommand;
