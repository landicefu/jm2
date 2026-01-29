/**
 * Unit tests for src/core/logger.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

// We need to import the module dynamically to test with different env vars
let logger;
let paths;

describe('logger', () => {
  const originalEnv = process.env.JM2_DATA_DIR;
  const originalLogLevel = process.env.JM2_LOG_LEVEL;
  let testDataDir;

  beforeEach(async () => {
    // Create a unique test directory
    testDataDir = join(tmpdir(), `jm2-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    process.env.JM2_DATA_DIR = testDataDir;
    delete process.env.JM2_LOG_LEVEL;
    
    // Re-import the modules to pick up the new env var
    vi.resetModules();
    paths = await import('../../src/utils/paths.js');
    logger = await import('../../src/core/logger.js');
  });

  afterEach(() => {
    // Restore original env
    if (originalEnv !== undefined) {
      process.env.JM2_DATA_DIR = originalEnv;
    } else {
      delete process.env.JM2_DATA_DIR;
    }
    
    if (originalLogLevel !== undefined) {
      process.env.JM2_LOG_LEVEL = originalLogLevel;
    } else {
      delete process.env.JM2_LOG_LEVEL;
    }

    // Clean up test directory
    if (testDataDir && existsSync(testDataDir)) {
      rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  describe('LogLevel', () => {
    it('should export log levels', () => {
      expect(logger.LogLevel.DEBUG).toBe('DEBUG');
      expect(logger.LogLevel.INFO).toBe('INFO');
      expect(logger.LogLevel.WARN).toBe('WARN');
      expect(logger.LogLevel.ERROR).toBe('ERROR');
    });
  });

  describe('setLogLevel / getLogLevel', () => {
    it('should default to INFO level', () => {
      expect(logger.getLogLevel()).toBe('INFO');
    });

    it('should set log level', () => {
      logger.setLogLevel('DEBUG');
      expect(logger.getLogLevel()).toBe('DEBUG');
      
      logger.setLogLevel('ERROR');
      expect(logger.getLogLevel()).toBe('ERROR');
    });

    it('should be case insensitive', () => {
      logger.setLogLevel('debug');
      expect(logger.getLogLevel()).toBe('DEBUG');
    });

    it('should ignore invalid log levels', () => {
      logger.setLogLevel('INFO');
      logger.setLogLevel('INVALID');
      expect(logger.getLogLevel()).toBe('INFO');
    });
  });

  describe('createLogger', () => {
    it('should create a logger with all methods', () => {
      const log = logger.createLogger({ name: 'test' });
      expect(typeof log.debug).toBe('function');
      expect(typeof log.info).toBe('function');
      expect(typeof log.warn).toBe('function');
      expect(typeof log.error).toBe('function');
      expect(typeof log.log).toBe('function');
    });

    it('should write to file when file option is provided', () => {
      const logFile = join(testDataDir, 'test.log');
      const log = logger.createLogger({ name: 'test', file: logFile });
      
      log.info('Test message');
      
      expect(existsSync(logFile)).toBe(true);
      const content = readFileSync(logFile, 'utf8');
      expect(content).toContain('[INFO]');
      expect(content).toContain('[test]');
      expect(content).toContain('Test message');
    });

    it('should include metadata in log output', () => {
      const logFile = join(testDataDir, 'test.log');
      const log = logger.createLogger({ name: 'test', file: logFile });
      
      log.info('Test message', { key: 'value', num: 42 });
      
      const content = readFileSync(logFile, 'utf8');
      expect(content).toContain('"key":"value"');
      expect(content).toContain('"num":42');
    });

    it('should respect log level filtering', () => {
      const logFile = join(testDataDir, 'test.log');
      logger.setLogLevel('WARN');
      const log = logger.createLogger({ name: 'test', file: logFile });
      
      log.debug('Debug message');
      log.info('Info message');
      log.warn('Warn message');
      log.error('Error message');
      
      const content = readFileSync(logFile, 'utf8');
      expect(content).not.toContain('Debug message');
      expect(content).not.toContain('Info message');
      expect(content).toContain('Warn message');
      expect(content).toContain('Error message');
    });

    it('should create parent directories for log file', () => {
      const logFile = join(testDataDir, 'nested', 'dir', 'test.log');
      const log = logger.createLogger({ name: 'test', file: logFile });
      
      log.info('Test message');
      
      expect(existsSync(logFile)).toBe(true);
    });

    it('should log to console when console option is true', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const log = logger.createLogger({ name: 'test', console: true });
      
      log.info('Console test');
      
      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleSpy.mock.calls[0][0]).toContain('Console test');
      
      consoleSpy.mockRestore();
    });

    it('should use console.error for ERROR level', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const log = logger.createLogger({ name: 'test', console: true });
      
      log.error('Error test');
      
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    it('should use console.warn for WARN level', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const log = logger.createLogger({ name: 'test', console: true });
      
      log.warn('Warn test');
      
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });

  describe('createDaemonLogger', () => {
    it('should create a logger that writes to daemon.log', () => {
      const log = logger.createDaemonLogger();
      log.info('Daemon test');
      
      const daemonLogFile = paths.getDaemonLogFile();
      expect(existsSync(daemonLogFile)).toBe(true);
      const content = readFileSync(daemonLogFile, 'utf8');
      expect(content).toContain('Daemon test');
      expect(content).toContain('[daemon]');
    });

    it('should log to console when foreground option is true', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const log = logger.createDaemonLogger({ foreground: true });
      
      log.info('Foreground test');
      
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });

  describe('createJobLogger', () => {
    it('should create a logger that writes to job-specific log file', () => {
      const log = logger.createJobLogger('my-job');
      log.info('Job test');
      
      const jobLogFile = paths.getJobLogFile('my-job');
      expect(existsSync(jobLogFile)).toBe(true);
      const content = readFileSync(jobLogFile, 'utf8');
      expect(content).toContain('Job test');
      expect(content).toContain('[my-job]');
    });

    it('should create logs directory if it does not exist', () => {
      const logsDir = paths.getLogsDir();
      expect(existsSync(logsDir)).toBe(false);
      
      logger.createJobLogger('test-job');
      
      expect(existsSync(logsDir)).toBe(true);
    });
  });

  describe('logJobStart', () => {
    it('should log job start with details', () => {
      const logFile = join(testDataDir, 'job-start.log');
      const log = logger.createLogger({ name: 'test', file: logFile });
      
      const job = { id: 1, name: 'test-job', command: 'echo hello' };
      logger.logJobStart(log, job, 'manual');
      
      const content = readFileSync(logFile, 'utf8');
      expect(content).toContain('Job execution started');
      expect(content).toContain('"jobId":1');
      expect(content).toContain('"jobName":"test-job"');
      expect(content).toContain('"command":"echo hello"');
      expect(content).toContain('"triggeredBy":"manual"');
    });

    it('should default to scheduled trigger', () => {
      const logFile = join(testDataDir, 'job-start.log');
      const log = logger.createLogger({ name: 'test', file: logFile });
      
      const job = { id: 1, name: 'test-job', command: 'echo hello' };
      logger.logJobStart(log, job);
      
      const content = readFileSync(logFile, 'utf8');
      expect(content).toContain('"triggeredBy":"scheduled"');
    });
  });

  describe('logJobComplete', () => {
    it('should log successful job completion as INFO', () => {
      const logFile = join(testDataDir, 'job-complete.log');
      const log = logger.createLogger({ name: 'test', file: logFile });
      
      const job = { id: 1, name: 'test-job' };
      const result = { exitCode: 0, duration: 1500 };
      logger.logJobComplete(log, job, result);
      
      const content = readFileSync(logFile, 'utf8');
      expect(content).toContain('[INFO]');
      expect(content).toContain('Job execution completed');
      expect(content).toContain('"exitCode":0');
      expect(content).toContain('"success":true');
    });

    it('should log failed job completion as ERROR', () => {
      const logFile = join(testDataDir, 'job-complete.log');
      const log = logger.createLogger({ name: 'test', file: logFile });
      
      const job = { id: 1, name: 'test-job' };
      const result = { exitCode: 1, duration: 500 };
      logger.logJobComplete(log, job, result);
      
      const content = readFileSync(logFile, 'utf8');
      expect(content).toContain('[ERROR]');
      expect(content).toContain('"exitCode":1');
      expect(content).toContain('"success":false');
    });
  });

  describe('logJobOutput', () => {
    it('should log stdout as INFO', () => {
      const logFile = join(testDataDir, 'job-output.log');
      const log = logger.createLogger({ name: 'test', file: logFile });
      
      logger.logJobOutput(log, 'stdout', 'Hello World\nLine 2');
      
      const content = readFileSync(logFile, 'utf8');
      expect(content).toContain('[INFO]');
      expect(content).toContain('[stdout] Hello World');
      expect(content).toContain('[stdout] Line 2');
    });

    it('should log stderr as ERROR', () => {
      const logFile = join(testDataDir, 'job-output.log');
      const log = logger.createLogger({ name: 'test', file: logFile });
      
      logger.logJobOutput(log, 'stderr', 'Error occurred');
      
      const content = readFileSync(logFile, 'utf8');
      expect(content).toContain('[ERROR]');
      expect(content).toContain('[stderr] Error occurred');
    });

    it('should skip empty lines', () => {
      const logFile = join(testDataDir, 'job-output.log');
      const log = logger.createLogger({ name: 'test', file: logFile });
      
      logger.logJobOutput(log, 'stdout', 'Line 1\n\n\nLine 2\n');
      
      const content = readFileSync(logFile, 'utf8');
      const lines = content.trim().split('\n');
      expect(lines.length).toBe(2);
    });
  });

  describe('clearLogFile', () => {
    it('should clear an existing log file', () => {
      const logFile = join(testDataDir, 'clear-test.log');
      const log = logger.createLogger({ name: 'test', file: logFile });
      
      log.info('Some content');
      expect(readFileSync(logFile, 'utf8').length).toBeGreaterThan(0);
      
      logger.clearLogFile(logFile);
      expect(readFileSync(logFile, 'utf8')).toBe('');
    });

    it('should create file if it does not exist', () => {
      const logFile = join(testDataDir, 'new-file.log');
      expect(existsSync(logFile)).toBe(false);
      
      logger.clearLogFile(logFile);
      
      expect(existsSync(logFile)).toBe(true);
      expect(readFileSync(logFile, 'utf8')).toBe('');
    });
  });

  describe('default export', () => {
    it('should export all functions', () => {
      expect(logger.default).toBeDefined();
      expect(logger.default.LogLevel).toBeDefined();
      expect(typeof logger.default.setLogLevel).toBe('function');
      expect(typeof logger.default.getLogLevel).toBe('function');
      expect(typeof logger.default.createLogger).toBe('function');
      expect(typeof logger.default.createDaemonLogger).toBe('function');
      expect(typeof logger.default.createJobLogger).toBe('function');
      expect(typeof logger.default.logJobStart).toBe('function');
      expect(typeof logger.default.logJobComplete).toBe('function');
      expect(typeof logger.default.logJobOutput).toBe('function');
      expect(typeof logger.default.clearLogFile).toBe('function');
    });
  });
});
