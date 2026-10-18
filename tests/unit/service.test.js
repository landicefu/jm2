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
  isPlatformSupported,
  getNodePath,
  checkService,
  repairService
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
    realpathSync: vi.fn((p) => p),
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
  getLogsDir: vi.fn(() => '/home/user/.jm2/logs'),
  getPidFile: vi.fn(() => '/home/user/.jm2/daemon.pid')
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

  describe('getNodePath', () => {
    const originalPlatform = process.platform;

    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
    });

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should prefer a stable PATH symlink over a versioned Homebrew path', () => {
      const cellar = '/opt/homebrew/Cellar/node/25.5.0/bin/node';
      fs.realpathSync.mockImplementation((p) => {
        if (p === '/opt/homebrew/bin/node') return cellar;
        if (p === cellar) return cellar;
        throw new Error('ENOENT');
      });

      expect(getNodePath(cellar, '/usr/bin:/opt/homebrew/bin')).toBe('/opt/homebrew/bin/node');
    });

    it('should ignore PATH entries that resolve to a different node', () => {
      const execPath = '/home/user/.nvm/versions/node/v20.0.0/bin/node';
      fs.realpathSync.mockImplementation((p) => {
        if (p === '/usr/local/bin/node') return '/usr/local/Cellar/node/18/bin/node';
        return p;
      });

      expect(getNodePath(execPath, '/usr/local/bin')).toBe(execPath);
    });

    it('should skip relative PATH entries', () => {
      const execPath = '/opt/node/bin/node';
      fs.realpathSync.mockImplementation(() => execPath);

      expect(getNodePath(execPath, '~/bin:relative')).toBe(execPath);
    });

    it('should return execPath on Windows', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      expect(getNodePath('C:\\node\\node.exe', 'C:\\bin')).toBe('C:\\node\\node.exe');
    });
  });

  describe('macOS service health', () => {
    const originalPlatform = process.platform;
    const originalExecPath = process.execPath;
    const originalPath = process.env.PATH;
    const plistPath = '/home/user/Library/LaunchAgents/com.jm2.daemon.plist';

    const plistWith = (nodePath, jm2Path) => `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
    <key>ProgramArguments</key>
    <array>
        <string>${nodePath}</string>
        <string>${jm2Path}</string>
        <string>start</string>
    </array>
</dict>
</plist>`;

    let files;
    let jm2Path;

    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      Object.defineProperty(process, 'execPath', { value: '/usr/local/bin/node' });
      process.env.PATH = '';
      fs.realpathSync.mockImplementation((p) => p);
      files = {};
      fs.readFileSync.mockImplementation((p) => {
        if (p.endsWith('package.json')) return JSON.stringify({ bin: { jm2: 'bin/jm2.js' } });
        if (p in files) return files[p];
        throw new Error('ENOENT');
      });
      fs.writeFileSync.mockImplementation((p, content) => { files[p] = content; });
      fs.unlinkSync.mockImplementation((p) => { delete files[p]; });
      fs.existsSync.mockImplementation((p) => p in files || p === '/usr/local/bin/node' || p.endsWith('bin/jm2.js'));
      childProcess.execSync.mockReturnValue('');
    });

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
      Object.defineProperty(process, 'execPath', { value: originalExecPath });
      process.env.PATH = originalPath;
    });

    const currentJm2Path = () => {
      // Install once to learn the jm2 path the module resolves
      return installService(ServiceType.USER).then(() => {
        const match = files[plistPath].match(/<string>([^<]*jm2\.js)<\/string>/);
        return match[1];
      });
    };

    it('should report no problems for a current plist', async () => {
      jm2Path = await currentJm2Path();
      files[plistPath] = plistWith('/usr/local/bin/node', jm2Path);

      expect(checkService(ServiceType.USER)).toEqual([]);
    });

    it('should report no problems when not installed', () => {
      expect(checkService(ServiceType.USER)).toEqual([]);
    });

    it('should detect a node executable removed by an upgrade', async () => {
      jm2Path = await currentJm2Path();
      files[plistPath] = plistWith('/opt/homebrew/Cellar/node/25.5.0/bin/node', jm2Path);

      const problems = checkService(ServiceType.USER);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain('no longer exists');
    });

    it('should detect an unreadable plist', () => {
      files[plistPath] = '<plist></plist>';

      expect(checkService(ServiceType.USER)).toHaveLength(1);
    });

    it('should rewrite the plist with current paths when repairing', async () => {
      jm2Path = await currentJm2Path();
      files[plistPath] = plistWith('/opt/homebrew/Cellar/node/25.5.0/bin/node', jm2Path);

      const result = await repairService(ServiceType.USER);

      expect(result.success).toBe(true);
      expect(files[plistPath]).toContain('<string>/usr/local/bin/node</string>');
      expect(checkService(ServiceType.USER)).toEqual([]);
    });

    it('should report running only when the daemon process is alive', () => {
      files[plistPath] = plistWith('/usr/local/bin/node', '/x/bin/jm2.js');
      files['/home/user/.jm2/daemon.pid'] = String(process.pid);
      expect(getServiceStatus(ServiceType.USER)).toEqual({ installed: true, running: true });

      delete files['/home/user/.jm2/daemon.pid'];
      expect(getServiceStatus(ServiceType.USER)).toEqual({ installed: true, running: false });
    });
  });
});
