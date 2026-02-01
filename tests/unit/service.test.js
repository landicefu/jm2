/**
 * Service management tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import {
  isElevated,
  getServiceStatus,
  installService,
  uninstallService,
  ServiceType,
  getPlatform,
  isPlatformSupported
} from '../../src/core/service.js';

// Mock child_process
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    execSync: vi.fn(),
    spawn: vi.fn()
  };
});

// Mock fs
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(() => JSON.stringify({ bin: { jm2: 'bin/jm2.js' } })),
    existsSync: vi.fn(),
    unlinkSync: vi.fn(),
    mkdirSync: vi.fn(),
    constants: {}
  };
});

// Mock os
vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/home/user'),
  tmpdir: vi.fn(() => '/tmp')
}));

// Mock paths
vi.mock('../../src/utils/paths.js', () => ({
  getDataDir: vi.fn(() => '/home/user/.jm2'),
  getLogsDir: vi.fn(() => '/home/user/.jm2/logs')
}));

describe('Service Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isElevated', () => {
    const originalPlatform = process.platform;
    const originalGetuid = process.getuid;

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
      if (originalGetuid) {
        process.getuid = originalGetuid;
      }
    });

    it('should return false on Unix when not root', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      process.getuid = () => 1000;

      expect(isElevated()).toBe(false);
    });

    it('should return true on Unix when root', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      process.getuid = () => 0;

      expect(isElevated()).toBe(true);
    });

    it('should check Windows admin on win32', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });

      // Mock execSync for Windows admin check
      const { execSync } = childProcess;
      execSync.mockImplementation(() => {});

      expect(isElevated()).toBe(true);
    });
  });

  describe('getPlatform', () => {
    it('should return the current platform', () => {
      const platform = getPlatform();
      expect(['darwin', 'linux', 'win32']).toContain(platform);
    });
  });

  describe('isPlatformSupported', () => {
    it('should return true for supported platforms', () => {
      // All current platforms are supported
      expect(isPlatformSupported()).toBe(true);
    });
  });

  describe('ServiceType constants', () => {
    it('should have USER type', () => {
      expect(ServiceType.USER).toBe('user');
    });

    it('should have SYSTEM type', () => {
      expect(ServiceType.SYSTEM).toBe('system');
    });
  });
});
