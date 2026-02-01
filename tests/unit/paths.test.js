/**
 * Unit tests for src/utils/paths.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

// We need to import the module dynamically to test with different env vars
let paths;

describe('paths', () => {
  const originalEnv = process.env.JM2_DATA_DIR;
  let testDataDir;

  beforeEach(async () => {
    // Create a unique test directory
    testDataDir = join(tmpdir(), `jm2-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    process.env.JM2_DATA_DIR = testDataDir;
    
    // Re-import the module to pick up the new env var
    // Clear the module cache first
    vi.resetModules();
    paths = await import('../../src/utils/paths.js');
  });

  afterEach(() => {
    // Restore original env
    if (originalEnv !== undefined) {
      process.env.JM2_DATA_DIR = originalEnv;
    } else {
      delete process.env.JM2_DATA_DIR;
    }

    // Clean up test directory
    if (testDataDir && existsSync(testDataDir)) {
      rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  describe('getDataDir', () => {
    it('should return JM2_DATA_DIR when set', () => {
      expect(paths.getDataDir()).toBe(testDataDir);
    });

    it('should return ~/.jm2 when JM2_DATA_DIR is not set', async () => {
      delete process.env.JM2_DATA_DIR;
      vi.resetModules();
      const freshPaths = await import('../../src/utils/paths.js');
      expect(freshPaths.getDataDir()).toBe(join(homedir(), '.jm2'));
    });
  });

  describe('getJobsFile', () => {
    it('should return jobs.json path in data directory', () => {
      expect(paths.getJobsFile()).toBe(join(testDataDir, 'jobs.json'));
    });
  });

  describe('getConfigFile', () => {
    it('should return config.json path in data directory', () => {
      expect(paths.getConfigFile()).toBe(join(testDataDir, 'config.json'));
    });
  });

  describe('getPidFile', () => {
    it('should return daemon.pid path in data directory', () => {
      expect(paths.getPidFile()).toBe(join(testDataDir, 'daemon.pid'));
    });
  });

  describe('getDaemonLogFile', () => {
    it('should return daemon.log path in data directory', () => {
      expect(paths.getDaemonLogFile()).toBe(join(testDataDir, 'daemon.log'));
    });
  });

  describe('getLogsDir', () => {
    it('should return logs directory path', () => {
      expect(paths.getLogsDir()).toBe(join(testDataDir, 'logs'));
    });
  });

  describe('getJobLogFile', () => {
    it('should return job-specific log file path', () => {
      expect(paths.getJobLogFile('my-job')).toBe(join(testDataDir, 'logs', 'my-job.log'));
    });

    it('should handle job names with special characters', () => {
      expect(paths.getJobLogFile('job-with-dashes')).toBe(join(testDataDir, 'logs', 'job-with-dashes.log'));
    });
  });

  describe('getSocketPath', () => {
    it('should return named pipe path on Windows', () => {
      if (process.platform === 'win32') {
        expect(paths.getSocketPath()).toBe('\\\\.\\pipe\\jm2-daemon');
      }
    });

    it('should use JM2_RUNTIME_DIR when set', async () => {
      if (process.platform !== 'win32') {
        const runtimeDir = join(tmpdir(), `jm2-runtime-test-${Date.now()}`);
        process.env.JM2_RUNTIME_DIR = runtimeDir;
        vi.resetModules();
        const freshPaths = await import('../../src/utils/paths.js');
        expect(freshPaths.getSocketPath()).toBe(join(runtimeDir, 'daemon.sock'));
        delete process.env.JM2_RUNTIME_DIR;
      }
    });
  });

  describe('ensureRuntimeDir', () => {
    it('should create runtime directory if it does not exist', () => {
      if (process.platform !== 'win32') {
        const runtimeDir = join(tmpdir(), `jm2-runtime-${Date.now()}`);
        process.env.JM2_RUNTIME_DIR = runtimeDir;
        expect(existsSync(runtimeDir)).toBe(false);
        const result = paths.ensureRuntimeDir();
        expect(result).toBe(runtimeDir);
        expect(existsSync(runtimeDir)).toBe(true);
        delete process.env.JM2_RUNTIME_DIR;
        if (existsSync(runtimeDir)) {
          rmSync(runtimeDir, { recursive: true, force: true });
        }
      }
    });
  });

  describe('getHistoryFile', () => {
    it('should return history.json path in data directory', () => {
      expect(paths.getHistoryFile()).toBe(join(testDataDir, 'history.json'));
    });
  });

  describe('ensureDataDir', () => {
    it('should create data directory if it does not exist', () => {
      expect(existsSync(testDataDir)).toBe(false);
      const result = paths.ensureDataDir();
      expect(result).toBe(testDataDir);
      expect(existsSync(testDataDir)).toBe(true);
    });

    it('should not fail if data directory already exists', () => {
      mkdirSync(testDataDir, { recursive: true });
      expect(existsSync(testDataDir)).toBe(true);
      const result = paths.ensureDataDir();
      expect(result).toBe(testDataDir);
      expect(existsSync(testDataDir)).toBe(true);
    });
  });

  describe('ensureLogsDir', () => {
    it('should create logs directory if it does not exist', () => {
      const logsDir = join(testDataDir, 'logs');
      expect(existsSync(logsDir)).toBe(false);
      const result = paths.ensureLogsDir();
      expect(result).toBe(logsDir);
      expect(existsSync(logsDir)).toBe(true);
    });

    it('should also create data directory if needed', () => {
      expect(existsSync(testDataDir)).toBe(false);
      paths.ensureLogsDir();
      expect(existsSync(testDataDir)).toBe(true);
      expect(existsSync(join(testDataDir, 'logs'))).toBe(true);
    });
  });

  describe('dataDirExists', () => {
    it('should return false when data directory does not exist', () => {
      expect(paths.dataDirExists()).toBe(false);
    });

    it('should return true when data directory exists', () => {
      mkdirSync(testDataDir, { recursive: true });
      expect(paths.dataDirExists()).toBe(true);
    });
  });

  describe('pidFileExists', () => {
    it('should return false when PID file does not exist', () => {
      expect(paths.pidFileExists()).toBe(false);
    });

    it('should return true when PID file exists', async () => {
      const { writeFileSync } = await import('node:fs');
      mkdirSync(testDataDir, { recursive: true });
      writeFileSync(join(testDataDir, 'daemon.pid'), '12345');
      expect(paths.pidFileExists()).toBe(true);
    });
  });

  describe('default export', () => {
    it('should export all functions', () => {
      expect(paths.default).toBeDefined();
      expect(typeof paths.default.getDataDir).toBe('function');
      expect(typeof paths.default.getJobsFile).toBe('function');
      expect(typeof paths.default.getConfigFile).toBe('function');
      expect(typeof paths.default.getPidFile).toBe('function');
      expect(typeof paths.default.getDaemonLogFile).toBe('function');
      expect(typeof paths.default.getLogsDir).toBe('function');
      expect(typeof paths.default.getJobLogFile).toBe('function');
      expect(typeof paths.default.getSocketPath).toBe('function');
      expect(typeof paths.default.getHistoryFile).toBe('function');
      expect(typeof paths.default.ensureDataDir).toBe('function');
      expect(typeof paths.default.ensureLogsDir).toBe('function');
      expect(typeof paths.default.ensureRuntimeDir).toBe('function');
      expect(typeof paths.default.dataDirExists).toBe('function');
      expect(typeof paths.default.pidFileExists).toBe('function');
    });
  });
});
