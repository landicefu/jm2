/**
 * Unit tests for daemon
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  writePidFile,
  removePidFile,
  readPidFile,
  isDaemonRunning,
  getDaemonStatus,
} from '../../src/daemon/index.js';

describe('daemon', () => {
  let tempDir;

  beforeEach(() => {
    // Create a temporary directory for testing
    tempDir = mkdtempSync(join(tmpdir(), 'jm2-daemon-test-'));
    process.env.JM2_DATA_DIR = tempDir;
  });

  afterEach(() => {
    // Clean up temporary directory
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    delete process.env.JM2_DATA_DIR;
  });

  describe('PID file management', () => {
    it('should write PID file', () => {
      const result = writePidFile();
      expect(result).toBe(true);
      expect(existsSync(join(tempDir, 'daemon.pid'))).toBe(true);
    });

    it('should read PID from file', () => {
      writePidFile();
      const pid = readPidFile();
      expect(pid).toBe(process.pid);
    });

    it('should return null when PID file does not exist', () => {
      const pid = readPidFile();
      expect(pid).toBeNull();
    });

    it('should remove PID file', () => {
      writePidFile();
      expect(existsSync(join(tempDir, 'daemon.pid'))).toBe(true);
      
      removePidFile();
      expect(existsSync(join(tempDir, 'daemon.pid'))).toBe(false);
    });

    it('should not throw when removing non-existent PID file', () => {
      expect(() => removePidFile()).not.toThrow();
    });
  });

  describe('daemon status', () => {
    it('should return not running when no PID file', () => {
      const status = getDaemonStatus();
      expect(status.running).toBe(false);
      expect(status.pid).toBeNull();
    });

    it('should detect current process as running', () => {
      writePidFile();
      const status = getDaemonStatus();
      expect(status.running).toBe(true);
      expect(status.pid).toBe(process.pid);
    });

    it('isDaemonRunning should return false when no PID file', () => {
      expect(isDaemonRunning()).toBe(false);
    });

    it('isDaemonRunning should return true for current process', () => {
      writePidFile();
      expect(isDaemonRunning()).toBe(true);
    });
  });
});
