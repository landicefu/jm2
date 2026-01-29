/**
 * Unit tests for src/core/config.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

let config;
let testDataDir;

describe('config', () => {
  const originalEnv = process.env.JM2_DATA_DIR;

  beforeEach(async () => {
    // Create a unique test directory
    testDataDir = join(tmpdir(), `jm2-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    process.env.JM2_DATA_DIR = testDataDir;
    mkdirSync(testDataDir, { recursive: true });
    
    // Re-import the module to pick up the new env var
    vi.resetModules();
    config = await import('../../src/core/config.js');
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

  describe('DEFAULT_CONFIG', () => {
    it('should have daemon settings', () => {
      expect(config.DEFAULT_CONFIG.daemon).toBeDefined();
      expect(config.DEFAULT_CONFIG.daemon.maxConcurrent).toBe(10);
      expect(config.DEFAULT_CONFIG.daemon.shell).toBeDefined();
    });

    it('should have job defaults', () => {
      expect(config.DEFAULT_CONFIG.jobs).toBeDefined();
      expect(config.DEFAULT_CONFIG.jobs.defaultRetry).toBe(0);
    });

    it('should have logging settings', () => {
      expect(config.DEFAULT_CONFIG.logging).toBeDefined();
      expect(config.DEFAULT_CONFIG.logging.level).toBe('INFO');
    });

    it('should have history settings', () => {
      expect(config.DEFAULT_CONFIG.history).toBeDefined();
      expect(config.DEFAULT_CONFIG.history.maxEntriesPerJob).toBe(100);
    });

    it('should have cleanup settings', () => {
      expect(config.DEFAULT_CONFIG.cleanup).toBeDefined();
      expect(config.DEFAULT_CONFIG.cleanup.completedJobRetentionDays).toBe(7);
    });
  });

  describe('getConfig', () => {
    it('should return default config when no config file exists', () => {
      const cfg = config.getConfig();
      
      expect(cfg.daemon.maxConcurrent).toBe(10);
      expect(cfg.logging.level).toBe('INFO');
    });

    it('should merge stored config with defaults', () => {
      const configFile = join(testDataDir, 'config.json');
      writeFileSync(configFile, JSON.stringify({
        daemon: { maxConcurrent: 5 },
      }));
      
      const cfg = config.getConfig();
      
      expect(cfg.daemon.maxConcurrent).toBe(5);
      expect(cfg.daemon.shell).toBeDefined(); // From defaults
      expect(cfg.logging.level).toBe('INFO'); // From defaults
    });

    it('should deep merge nested objects', () => {
      const configFile = join(testDataDir, 'config.json');
      writeFileSync(configFile, JSON.stringify({
        logging: { level: 'DEBUG' },
      }));
      
      const cfg = config.getConfig();
      
      expect(cfg.logging.level).toBe('DEBUG');
      expect(cfg.logging.maxFileSize).toBe(10 * 1024 * 1024); // From defaults
    });
  });

  describe('saveConfig', () => {
    it('should save config to file', () => {
      config.saveConfig({ daemon: { maxConcurrent: 20 } });
      
      const configFile = join(testDataDir, 'config.json');
      const content = JSON.parse(readFileSync(configFile, 'utf8'));
      
      expect(content.daemon.maxConcurrent).toBe(20);
    });
  });

  describe('getConfigValue', () => {
    beforeEach(() => {
      const configFile = join(testDataDir, 'config.json');
      writeFileSync(configFile, JSON.stringify({
        daemon: { maxConcurrent: 15 },
        custom: { nested: { value: 'test' } },
      }));
    });

    it('should get value by dot-separated path', () => {
      expect(config.getConfigValue('daemon.maxConcurrent')).toBe(15);
    });

    it('should get nested value', () => {
      expect(config.getConfigValue('custom.nested.value')).toBe('test');
    });

    it('should return default value for non-existent path', () => {
      expect(config.getConfigValue('nonexistent.path', 'default')).toBe('default');
    });

    it('should return undefined for non-existent path without default', () => {
      expect(config.getConfigValue('nonexistent.path')).toBeUndefined();
    });

    it('should get top-level value', () => {
      const daemon = config.getConfigValue('daemon');
      expect(daemon.maxConcurrent).toBe(15);
    });
  });

  describe('setConfigValue', () => {
    it('should set value by dot-separated path', () => {
      config.setConfigValue('daemon.maxConcurrent', 25);
      
      expect(config.getConfigValue('daemon.maxConcurrent')).toBe(25);
    });

    it('should create nested path if not exists', () => {
      config.setConfigValue('custom.new.path', 'value');
      
      expect(config.getConfigValue('custom.new.path')).toBe('value');
    });

    it('should preserve other values when setting', () => {
      config.setConfigValue('daemon.maxConcurrent', 30);
      
      // Other daemon values should still exist from defaults
      const cfg = config.getConfig();
      expect(cfg.daemon.shell).toBeDefined();
    });
  });

  describe('resetConfig', () => {
    it('should reset config to defaults', async () => {
      config.setConfigValue('daemon.maxConcurrent', 50);
      config.resetConfig();
      
      // Re-import to get fresh config after reset
      vi.resetModules();
      const freshConfig = await import('../../src/core/config.js');
      
      const cfg = freshConfig.getConfig();
      expect(cfg.daemon.maxConcurrent).toBe(10); // Default value
    });
  });

  describe('validateConfig', () => {
    it('should validate valid config', () => {
      const result = config.validateConfig({
        daemon: { maxConcurrent: 5 },
        logging: { level: 'DEBUG' },
      });
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid maxConcurrent', () => {
      const result = config.validateConfig({
        daemon: { maxConcurrent: -1 },
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('daemon.maxConcurrent must be a positive number');
    });

    it('should reject invalid shell', () => {
      const result = config.validateConfig({
        daemon: { shell: '' },
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('daemon.shell must be a non-empty string');
    });

    it('should reject invalid log level', () => {
      const result = config.validateConfig({
        logging: { level: 'INVALID' },
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('logging.level'))).toBe(true);
    });

    it('should reject invalid maxFileSize', () => {
      const result = config.validateConfig({
        logging: { maxFileSize: 100 },
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('logging.maxFileSize must be at least 1024 bytes');
    });

    it('should reject invalid defaultRetry', () => {
      const result = config.validateConfig({
        jobs: { defaultRetry: -1 },
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('jobs.defaultRetry must be a non-negative number');
    });

    it('should reject invalid maxEntriesPerJob', () => {
      const result = config.validateConfig({
        history: { maxEntriesPerJob: 0 },
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('history.maxEntriesPerJob must be a positive number');
    });

    it('should reject invalid retentionDays', () => {
      const result = config.validateConfig({
        history: { retentionDays: 0 },
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('history.retentionDays must be a positive number');
    });

    it('should collect multiple errors', () => {
      const result = config.validateConfig({
        daemon: { maxConcurrent: -1, shell: '' },
        logging: { level: 'INVALID' },
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  describe('default export', () => {
    it('should export all functions', () => {
      expect(config.default).toBeDefined();
      expect(config.default.DEFAULT_CONFIG).toBeDefined();
      expect(typeof config.default.getConfig).toBe('function');
      expect(typeof config.default.saveConfig).toBe('function');
      expect(typeof config.default.getConfigValue).toBe('function');
      expect(typeof config.default.setConfigValue).toBe('function');
      expect(typeof config.default.resetConfig).toBe('function');
      expect(typeof config.default.validateConfig).toBe('function');
    });
  });
});
