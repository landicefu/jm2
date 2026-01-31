/**
 * IPC protocol definitions for jm2
 */

export const MessageType = {
  PING: 'ping',
  PONG: 'pong',
  ERROR: 'error',
};

/**
 * Create a standard error response
 * @param {string} message - Error message
 * @returns {{ type: string, message: string }}
 */
export function createErrorResponse(message) {
  return {
    type: MessageType.ERROR,
    message,
  };
}

/**
 * Create a pong response
 * @returns {{ type: string }}
 */
export function createPongResponse() {
  return {
    type: MessageType.PONG,
  };
}

export default {
  MessageType,
  createErrorResponse,
  createPongResponse,
};
