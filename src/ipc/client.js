/**
 * IPC client for JM2 CLI
 */

import { createConnection } from 'node:net';
import { getSocketPath } from '../utils/paths.js';

/**
 * Custom error class for daemon-related errors
 */
export class DaemonError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'DaemonError';
    this.code = code;
  }
}

/**
 * Check if error is a connection refused error (daemon not running)
 * @param {Error} error - Error object
 * @returns {boolean} True if connection refused
 */
function isConnectionRefusedError(error) {
  return error.code === 'ECONNREFUSED' ||
         error.code === 'ENOENT' ||
         error.message?.includes('connect') ||
         error.message?.includes('No such file or directory');
}

/**
 * Send a message to the daemon
 * @param {object} message - Message to send
 * @param {object} options - Client options
 * @param {number} options.timeoutMs - Timeout in milliseconds
 * @returns {Promise<object>} Response message
 */
export function send(message, options = {}) {
  const { timeoutMs = 2000 } = options;
  const socketPath = getSocketPath();

  return new Promise((resolve, reject) => {
    const client = createConnection(socketPath);
    let buffer = '';
    let finished = false;

    const timeout = timeoutMs !== null && timeoutMs !== undefined
      ? setTimeout(() => {
          if (!finished) {
            finished = true;
            client.destroy();
            reject(new DaemonError('IPC request timed out', 'ETIMEOUT'));
          }
        }, timeoutMs)
      : null;

    client.on('error', err => {
      if (!finished) {
        finished = true;
        clearTimeout(timeout);
        
        // Provide user-friendly error for daemon not running
        if (isConnectionRefusedError(err)) {
          reject(new DaemonError(
            'Daemon is not running. Start it with: jm2 start',
            'EDAEMON_NOT_RUNNING'
          ));
        } else {
          reject(new DaemonError(
            `IPC communication failed: ${err.message}`,
            err.code || 'EIPC_ERROR'
          ));
        }
      }
    });

    client.on('data', data => {
      buffer += data.toString();
      let index;
      while ((index = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line) {
          continue;
        }
        try {
          const response = JSON.parse(line);
          if (!finished) {
            finished = true;
            clearTimeout(timeout);
            client.end();
            resolve(response);
          }
        } catch (error) {
          if (!finished) {
            finished = true;
            clearTimeout(timeout);
            client.end();
            reject(new DaemonError('Invalid JSON response from daemon', 'EINVALID_JSON'));
          }
        }
      }
    });

    client.on('connect', () => {
      client.write(`${JSON.stringify(message)}\n`);
    });
  });
}

/**
 * Send a message to the daemon with streaming support
 * @param {object} message - Message to send
 * @param {object} options - Client options
 * @param {number|null} options.timeoutMs - Timeout in milliseconds (null for no timeout)
 * @param {Function} options.onStream - Callback for stream messages (chunk) => void
 * @returns {Promise<object>} Final response message
 */
export function sendWithStream(message, options = {}) {
  const { timeoutMs = null, onStream } = options;
  const socketPath = getSocketPath();

  return new Promise((resolve, reject) => {
    const client = createConnection(socketPath);
    let buffer = '';
    let finished = false;

    const timeout = timeoutMs !== null && timeoutMs !== undefined
      ? setTimeout(() => {
          if (!finished) {
            finished = true;
            client.destroy();
            reject(new DaemonError('IPC request timed out', 'ETIMEOUT'));
          }
        }, timeoutMs)
      : null;

    client.on('error', err => {
      if (!finished) {
        finished = true;
        clearTimeout(timeout);
        
        if (isConnectionRefusedError(err)) {
          reject(new DaemonError(
            'Daemon is not running. Start it with: jm2 start',
            'EDAEMON_NOT_RUNNING'
          ));
        } else {
          reject(new DaemonError(
            `IPC communication failed: ${err.message}`,
            err.code || 'EIPC_ERROR'
          ));
        }
      }
    });

    client.on('data', data => {
      buffer += data.toString();
      let index;
      while ((index = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line) {
          continue;
        }
        try {
          const response = JSON.parse(line);
          
          // Handle streaming output
          if (response.type === 'job:stream:output' && onStream) {
            onStream(response);
            continue;
          }
          
          // Final result
          if (!finished) {
            finished = true;
            clearTimeout(timeout);
            client.end();
            resolve(response);
          }
        } catch (error) {
          if (!finished) {
            finished = true;
            clearTimeout(timeout);
            client.end();
            reject(new DaemonError('Invalid JSON response from daemon', 'EINVALID_JSON'));
          }
        }
      }
    });

    client.on('connect', () => {
      client.write(`${JSON.stringify(message)}\n`);
    });
  });
}

export default {
  send,
  sendWithStream,
  DaemonError,
};
