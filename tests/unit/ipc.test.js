/**
 * Unit tests for IPC protocol, server, and client
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

let protocol;
let serverModule;
let clientModule;
let testDataDir;
let server;

describe('ipc', () => {
  const originalEnv = process.env.JM2_DATA_DIR;

  beforeEach(async () => {
    testDataDir = join(tmpdir(), `jm2-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    process.env.JM2_DATA_DIR = testDataDir;
    mkdirSync(testDataDir, { recursive: true });

    vi.resetModules();
    protocol = await import('../../src/ipc/protocol.js');
    serverModule = await import('../../src/ipc/server.js');
    clientModule = await import('../../src/ipc/client.js');
  });

  afterEach(() => {
    if (server) {
      serverModule.stopIpcServer(server);
      server = null;
    }
    if (originalEnv !== undefined) {
      process.env.JM2_DATA_DIR = originalEnv;
    } else {
      delete process.env.JM2_DATA_DIR;
    }
    if (testDataDir && existsSync(testDataDir)) {
      rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  describe('protocol helpers', () => {
    it('should create pong response', () => {
      expect(protocol.createPongResponse()).toEqual({ type: protocol.MessageType.PONG });
    });

    it('should create error response', () => {
      const response = protocol.createErrorResponse('boom');
      expect(response.type).toBe(protocol.MessageType.ERROR);
      expect(response.message).toBe('boom');
    });
  });

  describe('server/client', () => {
    it('should respond to ping with pong', async () => {
      server = serverModule.startIpcServer();
      const response = await clientModule.send({ type: protocol.MessageType.PING });
      expect(response).toEqual({ type: protocol.MessageType.PONG });
    });

    it('should route messages to handler', async () => {
      server = serverModule.startIpcServer({
        onMessage: async message => ({ type: 'echo', payload: message.payload }),
      });

      const response = await clientModule.send({ type: 'custom', payload: { ok: true } });
      expect(response).toEqual({ type: 'echo', payload: { ok: true } });
    });
  });
});
