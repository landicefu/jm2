/**
 * Daemon entry point for jm2
 * Handles daemonization, PID management, and graceful shutdown
 */

import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getPidFile, ensureDataDir, getSocketPath } from '../utils/paths.js';
import { createDaemonLogger } from '../core/logger.js';
import { startIpcServer, stopIpcServer } from '../ipc/server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let logger = null;
let ipcServer = null;
let isShuttingDown = false;

/**
 * Write PID file
 * @returns {boolean} True if successful
 */
export function writePidFile() {
  try {
    ensureDataDir();
    writeFileSync(getPidFile(), process.pid.toString(), 'utf8');
    return true;
  } catch (error) {
    console.error(`Failed to write PID file: ${error.message}`);
    return false;
  }
}

/**
 * Remove PID file
 */
export function removePidFile() {
  try {
    if (existsSync(getPidFile())) {
      unlinkSync(getPidFile());
    }
  } catch (error) {
    logger?.error(`Failed to remove PID file: ${error.message}`);
  }
}

/**
 * Read PID from PID file
 * @returns {number|null} PID or null if not found
 */
export function readPidFile() {
  try {
    if (!existsSync(getPidFile())) {
      return null;
    }
    const pid = parseInt(readFileSync(getPidFile(), 'utf8'), 10);
    return isNaN(pid) ? null : pid;
  } catch (error) {
    return null;
  }
}

/**
 * Check if daemon is running
 * @returns {boolean} True if daemon is running
 */
export function isDaemonRunning() {
  const pid = readPidFile();
  if (!pid) {
    return false;
  }

  try {
    // Check if process exists (sends signal 0 - doesn't actually signal)
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // Process doesn't exist
    return false;
  }
}

/**
 * Get daemon status
 * @returns {{ running: boolean, pid: number|null }} Status object
 */
export function getDaemonStatus() {
  const pid = readPidFile();
  const running = pid !== null && isDaemonRunning();
  return { running, pid: running ? pid : null };
}

/**
 * Stop the daemon
 * @param {number} [signal=15] Signal to send (default: SIGTERM)
 * @returns {boolean} True if stop signal was sent
 */
export function stopDaemon(signal = 15) {
  const pid = readPidFile();
  if (!pid) {
    return false;
  }

  try {
    process.kill(pid, signal);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Handle shutdown signals
 */
function handleShutdown() {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  logger?.info('Shutting down daemon...');

  // Stop IPC server
  if (ipcServer) {
    stopIpcServer(ipcServer);
    ipcServer = null;
  }

  // Remove PID file
  removePidFile();

  logger?.info('Daemon stopped');
  process.exit(0);
}

/**
 * Start the daemon process
 * @param {object} options - Daemon options
 * @param {boolean} options.foreground - Run in foreground (don't daemonize)
 * @returns {Promise<void>}
 */
export async function startDaemon(options = {}) {
  const { foreground = false } = options;

  // Check if already running
  if (isDaemonRunning()) {
    const { pid } = getDaemonStatus();
    throw new Error(`Daemon is already running (PID: ${pid})`);
  }

  if (foreground) {
    // Run in foreground mode
    await runDaemon({ foreground: true });
  } else {
    // Daemonize - spawn detached process
    const scriptPath = join(__dirname, 'index.js');

    const child = spawn(process.execPath, [scriptPath, '--foreground'], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, JM2_DAEMONIZED: '1' },
    });

    child.unref();

    // Wait a moment to check if process started
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check if daemon started successfully
    if (!isDaemonRunning()) {
      throw new Error('Failed to start daemon');
    }

    console.log(`Daemon started (PID: ${readPidFile()})`);
  }
}

/**
 * Run the daemon (internal - called by startDaemon)
 * @param {object} options - Run options
 * @param {boolean} options.foreground - Run in foreground
 */
async function runDaemon(options = {}) {
  const { foreground = false } = options;

  // Write PID file
  if (!writePidFile()) {
    process.exit(1);
  }

  // Initialize logger
  logger = createDaemonLogger({ foreground });
  logger.info('Daemon starting...');

  // Setup shutdown handlers
  process.on('SIGTERM', handleShutdown);
  process.on('SIGINT', handleShutdown);
  process.on('exit', () => {
    removePidFile();
  });

  // Handle uncaught errors
  process.on('uncaughtException', error => {
    logger.error(`Uncaught exception: ${error.message}`);
    logger.error(error.stack);
    handleShutdown();
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error(`Unhandled rejection at: ${promise}, reason: ${reason}`);
  });

  // Start IPC server
  try {
    ipcServer = startIpcServer({
      onMessage: handleIpcMessage,
    });
    logger.info('IPC server started');
  } catch (error) {
    logger.error(`Failed to start IPC server: ${error.message}`);
    handleShutdown();
    return;
  }

  logger.info('Daemon ready');

  // Keep process alive
  if (foreground) {
    // In foreground mode, we can keep the event loop alive
    setInterval(() => {}, 1000);
  }
}

/**
 * Handle IPC messages
 * @param {object} message - Incoming message
 * @returns {Promise<object|null>} Response message
 */
async function handleIpcMessage(message) {
  logger?.debug(`Received message: ${JSON.stringify(message)}`);

  switch (message.type) {
    case 'status':
      return {
        type: 'status',
        running: true,
        pid: process.pid,
      };

    case 'stop':
      logger?.info('Stop requested via IPC');
      setTimeout(handleShutdown, 100);
      return {
        type: 'stopped',
        message: 'Daemon is stopping',
      };

    default:
      return {
        type: 'error',
        message: `Unknown message type: ${message.type}`,
      };
  }
}

// If this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  // Check for foreground flag
  const foreground = process.argv.includes('--foreground');

  runDaemon({ foreground }).catch(error => {
    console.error(`Daemon error: ${error.message}`);
    process.exit(1);
  });
}

export default {
  startDaemon,
  stopDaemon,
  isDaemonRunning,
  getDaemonStatus,
  writePidFile,
  removePidFile,
  readPidFile,
};
