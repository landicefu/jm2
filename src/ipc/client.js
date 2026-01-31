/**
 * IPC client for jm2 CLI
 */

import { createConnection } from 'node:net';
import { getSocketPath } from '../utils/paths.js';

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

    const timeout = setTimeout(() => {
      if (!finished) {
        finished = true;
        client.destroy();
        reject(new Error('IPC request timed out'));
      }
    }, timeoutMs);

    client.on('error', err => {
      if (!finished) {
        finished = true;
        clearTimeout(timeout);
        reject(err);
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
            reject(new Error('Invalid JSON response'));
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
};
