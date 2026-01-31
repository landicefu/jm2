/**
 * jm2 restart command
 * Restarts the jm2 daemon process
 */

import { stopDaemon, isDaemonRunning, getDaemonStatus } from '../../daemon/index.js';
import { startDaemon } from '../../daemon/index.js';
import { printSuccess, printError, printInfo, printWarning } from '../utils/output.js';

/**
 * Execute the restart command
 * @param {object} options - Command options
 * @returns {Promise<number>} Exit code
 */
export async function restartCommand(options = {}) {
  const wasRunning = isDaemonRunning();
  const oldPid = wasRunning ? getDaemonStatus().pid : null;

  // Stop if running
  if (wasRunning) {
    printInfo(`Stopping daemon (PID: ${oldPid})...`);
    
    try {
      const stopped = stopDaemon();
      if (!stopped) {
        printError('Failed to stop daemon');
        return 1;
      }

      // Wait for daemon to stop
      let attempts = 0;
      const maxAttempts = 10;
      while (isDaemonRunning() && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 200));
        attempts++;
      }

      if (isDaemonRunning()) {
        printWarning('Daemon did not stop gracefully, forcing...');
        stopDaemon(9); // SIGKILL
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      printSuccess('Daemon stopped');
    } catch (error) {
      printError(`Failed to stop daemon: ${error.message}`);
      return 1;
    }
  } else {
    printInfo('Daemon was not running');
  }

  // Start daemon
  printInfo('Starting daemon...');

  try {
    await startDaemon({ foreground: false });

    const { pid } = getDaemonStatus();
    printSuccess(`Daemon restarted (PID: ${pid})`);
    return 0;
  } catch (error) {
    printError(`Failed to start daemon: ${error.message}`);
    return 1;
  }
}

export default restartCommand;
