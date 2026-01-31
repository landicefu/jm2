/**
 * IPC server for jm2 daemon
 */

import { createServer } from 'node:net';
import { unlinkSync, existsSync } from 'node:fs';
import { getSocketPath, ensureDataDir } from '../utils/paths.js';
import { MessageType, createErrorResponse, createPongResponse } from './protocol.js';

/**
 * Start IPC server
 * @param {object} options - Server options
 * @param {function} options.onMessage - Handler for incoming messages
 * @returns {import('node:net').Server}
 */
export function startIpcServer(options = {}) {
  const { onMessage } = options;
  const socketPath = getSocketPath();

  if (process.platform !== 'win32' && existsSync(socketPath)) {
    unlinkSync(socketPath);
  }

  ensureDataDir();

  const server = createServer(socket => {
    let buffer = '';

    socket.on('data', data => {
      buffer += data.toString();
      let index;
      while ((index = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line) {
          continue;
        }

        let message;
        try {
          message = JSON.parse(line);
        } catch (error) {
          socket.write(JSON.stringify(createErrorResponse('Invalid JSON')) + '\n');
          continue;
        }

        if (!message?.type) {
          socket.write(JSON.stringify(createErrorResponse('Missing message type')) + '\n');
          continue;
        }

        if (message.type === MessageType.PING) {
          socket.write(JSON.stringify(createPongResponse()) + '\n');
          continue;
        }

        if (onMessage) {
          Promise.resolve(onMessage(message))
            .then(response => {
              if (response) {
                socket.write(JSON.stringify(response) + '\n');
              }
            })
            .catch(err => {
              socket.write(JSON.stringify(createErrorResponse(err.message)) + '\n');
            });
        } else {
          socket.write(JSON.stringify(createErrorResponse('No handler configured')) + '\n');
        }
      }
    });
  });

  server.listen(socketPath);
  return server;
}

/**
 * Stop IPC server
 * @param {import('node:net').Server} server - IPC server instance
 */
export function stopIpcServer(server) {
  if (!server) {
    return;
  }
  server.close();
}

export default {
  startIpcServer,
  stopIpcServer,
};
