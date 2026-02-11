/**
 * Service management for JM2
 * Handles install/uninstall of system service for auto-start on boot
 * Supports macOS (launchd), Linux (systemd), and Windows (service)
 */

import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  writeFileSync,
  readFileSync,
  existsSync,
  unlinkSync,
  mkdirSync,
  constants
} from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { getDataDir, getLogsDir } from '../utils/paths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Service registration types
 */
export const ServiceType = {
  USER: 'user',
  SYSTEM: 'system'
};

/**
 * Supported platforms
 */
export const Platform = {
  DARWIN: 'darwin',
  LINUX: 'linux',
  WIN32: 'win32'
};

/**
 * Check if running with elevated privileges (root/admin)
 * @returns {boolean} True if running as admin/root
 */
export function isElevated() {
  if (process.platform === 'win32') {
    // On Windows, check if we have admin privileges
    try {
      // Try to access a protected resource
      execSync('net session', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  } else {
    // On Unix systems, check uid
    return process.getuid ? process.getuid() === 0 : false;
  }
}

/**
 * Get the platform-specific service manager
 * @returns {PlatformService} Platform service implementation
 */
function getPlatformService() {
  const platform = process.platform;

  switch (platform) {
    case Platform.DARWIN:
      return new DarwinService();
    case Platform.LINUX:
      return new LinuxService();
    case Platform.WIN32:
      return new WindowsService();
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Get path to the jm2 executable
 * @returns {string} Path to jm2 binary
 */
function getJm2Path() {
  // Use the bin/jm2.js entry point
  const pkgPath = join(__dirname, '../../package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

  if (pkg.bin && pkg.bin.jm2) {
    return join(__dirname, '../..', pkg.bin.jm2);
  }

  return join(__dirname, '../../bin/jm2.js');
}

/**
 * Get Node.js executable path
 * @returns {string} Path to node executable
 */
function getNodePath() {
  return process.execPath;
}

/**
 * Base class for platform-specific service management
 */
class PlatformService {
  /**
   * Install the service
   * @param {string} type - Service type (user or system)
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async install(type) {
    throw new Error('Not implemented');
  }

  /**
   * Uninstall the service
   * @param {string} type - Service type (user or system)
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async uninstall(type) {
    throw new Error('Not implemented');
  }

  /**
   * Check if service is installed
   * @param {string} type - Service type (user or system)
   * @returns {boolean}
   */
  isInstalled(type) {
    throw new Error('Not implemented');
  }

  /**
   * Get service status
   * @param {string} type - Service type (user or system)
   * @returns {{installed: boolean, running: boolean}}
   */
  getStatus(type) {
    throw new Error('Not implemented');
  }
}

/**
 * macOS launchd service implementation
 */
class DarwinService extends PlatformService {
  getPlistPath(type) {
    if (type === ServiceType.USER) {
      return join(homedir(), 'Library', 'LaunchAgents', 'com.jm2.daemon.plist');
    } else {
      return '/Library/LaunchDaemons/com.jm2.daemon.plist';
    }
  }

  generatePlist(type) {
    const jm2Path = getJm2Path();
    const nodePath = getNodePath();
    const dataDir = getDataDir();
    const logDir = getLogsDir();

    const label = 'com.jm2.daemon';
    const stdoutPath = join(logDir, 'service-out.log');
    const stderrPath = join(logDir, 'service-err.log');

    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${label}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${nodePath}</string>
        <string>${jm2Path}</string>
        <string>start</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${stdoutPath}</string>
    <key>StandardErrorPath</key>
    <string>${stderrPath}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>JM2_DATA_DIR</key>
        <string>${dataDir}</string>
        <key>PATH</key>
        <string>${process.env.PATH}</string>
    </dict>
</dict>
</plist>`;

    return plist;
  }

  async install(type) {
    const plistPath = this.getPlistPath(type);

    // Check if already installed
    if (existsSync(plistPath)) {
      return {
        success: false,
        message: `Service is already installed at ${plistPath}. Use uninstall first.`
      };
    }

    // Check permissions for system install
    if (type === ServiceType.SYSTEM && !isElevated()) {
      return {
        success: false,
        message: 'System-wide installation requires administrator privileges. Run with sudo.'
      };
    }

    try {
      // Ensure directory exists
      const dir = dirname(plistPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      // Write plist file
      const plist = this.generatePlist(type);
      writeFileSync(plistPath, plist, 'utf8');

      // Load the service
      if (type === ServiceType.USER) {
        execSync(`launchctl load ${plistPath}`, { stdio: 'inherit' });
        execSync('launchctl start com.jm2.daemon', { stdio: 'inherit' });
      } else {
        execSync(`sudo launchctl load ${plistPath}`, { stdio: 'inherit' });
        execSync('sudo launchctl start com.jm2.daemon', { stdio: 'inherit' });
      }

      return {
        success: true,
        message: `JM2 service installed successfully for ${type === ServiceType.USER ? 'current user' : 'system-wide'}.`
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to install service: ${error.message}`
      };
    }
  }

  async uninstall(type) {
    const plistPath = this.getPlistPath(type);

    // Check if installed
    if (!existsSync(plistPath)) {
      return {
        success: false,
        message: `Service is not installed (${type} level).`
      };
    }

    // Check permissions for system uninstall
    if (type === ServiceType.SYSTEM && !isElevated()) {
      return {
        success: false,
        message: 'System-wide uninstallation requires administrator privileges. Run with sudo.'
      };
    }

    try {
      // Unload the service
      if (type === ServiceType.USER) {
        execSync('launchctl stop com.jm2.daemon 2>/dev/null || true', { stdio: 'ignore' });
        execSync(`launchctl unload ${plistPath} 2>/dev/null || true`, { stdio: 'ignore' });
      } else {
        execSync('sudo launchctl stop com.jm2.daemon 2>/dev/null || true', { stdio: 'ignore' });
        execSync(`sudo launchctl unload ${plistPath} 2>/dev/null || true`, { stdio: 'ignore' });
      }

      // Remove plist file
      unlinkSync(plistPath);

      return {
        success: true,
        message: `JM2 service uninstalled successfully from ${type} level.`
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to uninstall service: ${error.message}`
      };
    }
  }

  isInstalled(type) {
    const plistPath = this.getPlistPath(type);
    return existsSync(plistPath);
  }

  getStatus(type) {
    const installed = this.isInstalled(type);
    let running = false;

    if (installed) {
      try {
        const result = execSync('launchctl list | grep com.jm2.daemon', {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'ignore']
        });
        running = result.includes('com.jm2.daemon');
      } catch {
        running = false;
      }
    }

    return { installed, running };
  }
}

/**
 * Linux systemd service implementation
 */
class LinuxService extends PlatformService {
  getServicePath(type) {
    if (type === ServiceType.USER) {
      return join(homedir(), '.config', 'systemd', 'user', 'jm2.service');
    } else {
      return '/etc/systemd/system/jm2.service';
    }
  }

  generateService(type) {
    const jm2Path = getJm2Path();
    const nodePath = getNodePath();
    const dataDir = getDataDir();
    const logDir = getLogsDir();

    const service = `[Unit]
Description=JM2 Job Manager Daemon
After=network.target

[Service]
Type=forking
ExecStart=${nodePath} ${jm2Path} start
ExecStop=${nodePath} ${jm2Path} stop
ExecReload=${nodePath} ${jm2Path} restart
Restart=always
RestartSec=10
Environment="JM2_DATA_DIR=${dataDir}"
StandardOutput=append:${join(logDir, 'service-out.log')}
StandardError=append:${join(logDir, 'service-err.log')}

[Install]
WantedBy=${type === ServiceType.USER ? 'default.target' : 'multi-user.target'}
`;

    return service;
  }

  async install(type) {
    const servicePath = this.getServicePath(type);

    // Check if already installed
    if (existsSync(servicePath)) {
      return {
        success: false,
        message: `Service is already installed at ${servicePath}. Use uninstall first.`
      };
    }

    // Check permissions for system install
    if (type === ServiceType.SYSTEM && !isElevated()) {
      return {
        success: false,
        message: 'System-wide installation requires root privileges. Run with sudo.'
      };
    }

    try {
      // Ensure directory exists
      const dir = dirname(servicePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      // Write service file
      const service = this.generateService(type);
      writeFileSync(servicePath, service, 'utf8');

      // Reload systemd
      if (type === ServiceType.USER) {
        execSync('systemctl --user daemon-reload', { stdio: 'inherit' });
        execSync('systemctl --user enable jm2', { stdio: 'inherit' });
        execSync('systemctl --user start jm2', { stdio: 'inherit' });
      } else {
        execSync('systemctl daemon-reload', { stdio: 'inherit' });
        execSync('systemctl enable jm2', { stdio: 'inherit' });
        execSync('systemctl start jm2', { stdio: 'inherit' });
      }

      return {
        success: true,
        message: `JM2 service installed successfully for ${type === ServiceType.USER ? 'current user' : 'system-wide'}.`
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to install service: ${error.message}`
      };
    }
  }

  async uninstall(type) {
    const servicePath = this.getServicePath(type);

    // Check if installed
    if (!existsSync(servicePath)) {
      return {
        success: false,
        message: `Service is not installed (${type} level).`
      };
    }

    // Check permissions for system uninstall
    if (type === ServiceType.SYSTEM && !isElevated()) {
      return {
        success: false,
        message: 'System-wide uninstallation requires root privileges. Run with sudo.'
      };
    }

    try {
      // Stop and disable the service
      if (type === ServiceType.USER) {
        execSync('systemctl --user stop jm2 2>/dev/null || true', { stdio: 'ignore' });
        execSync('systemctl --user disable jm2 2>/dev/null || true', { stdio: 'ignore' });
      } else {
        execSync('systemctl stop jm2 2>/dev/null || true', { stdio: 'ignore' });
        execSync('systemctl disable jm2 2>/dev/null || true', { stdio: 'ignore' });
      }

      // Remove service file
      unlinkSync(servicePath);

      // Reload systemd
      if (type === ServiceType.USER) {
        execSync('systemctl --user daemon-reload', { stdio: 'ignore' });
      } else {
        execSync('systemctl daemon-reload', { stdio: 'ignore' });
      }

      return {
        success: true,
        message: `JM2 service uninstalled successfully from ${type} level.`
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to uninstall service: ${error.message}`
      };
    }
  }

  isInstalled(type) {
    const servicePath = this.getServicePath(type);
    return existsSync(servicePath);
  }

  getStatus(type) {
    const installed = this.isInstalled(type);
    let running = false;

    if (installed) {
      try {
        const result = execSync(
          type === ServiceType.USER ? 'systemctl --user is-active jm2' : 'systemctl is-active jm2',
          { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
        );
        running = result.trim() === 'active';
      } catch {
        running = false;
      }
    }

    return { installed, running };
  }
}

/**
 * Windows service implementation
 * Uses a simple batch wrapper approach for now
 */
class WindowsService extends PlatformService {
  getServiceName() {
    return 'JM2Daemon';
  }

  getWrapperPath() {
    return join(getDataDir(), 'jm2-service.bat');
  }

  generateWrapper() {
    const jm2Path = getJm2Path();
    const nodePath = getNodePath();
    const dataDir = getDataDir();

    const wrapper = `@echo off
set JM2_DATA_DIR=${dataDir}
"${nodePath}" "${jm2Path}" start
`;

    return wrapper;
  }

  async install(type) {
    // Windows services require admin privileges
    if (!isElevated()) {
      return {
        success: false,
        message: 'Windows service installation requires administrator privileges. Run as Administrator.'
      };
    }

    try {
      // Create wrapper script
      const wrapperPath = this.getWrapperPath();
      const wrapper = this.generateWrapper();
      writeFileSync(wrapperPath, wrapper, 'utf8');

      // Install service using sc.exe
      const serviceName = this.getServiceName();
      const binPath = `cmd.exe /c "${wrapperPath}"`;

      execSync(`sc create "${serviceName}" binPath= "${binPath}" start= auto`, {
        stdio: 'inherit'
      });

      // Start the service
      execSync(`sc start "${serviceName}"`, { stdio: 'inherit' });

      return {
        success: true,
        message: 'JM2 service installed successfully.'
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to install service: ${error.message}`
      };
    }
  }

  async uninstall(type) {
    // Windows service removal requires admin privileges
    if (!isElevated()) {
      return {
        success: false,
        message: 'Windows service uninstallation requires administrator privileges. Run as Administrator.'
      };
    }

    try {
      const serviceName = this.getServiceName();

      // Stop the service first
      try {
        execSync(`sc stop "${serviceName}"`, { stdio: 'ignore' });
      } catch {
        // Service might not be running
      }

      // Delete the service
      execSync(`sc delete "${serviceName}"`, { stdio: 'inherit' });

      // Remove wrapper script
      const wrapperPath = this.getWrapperPath();
      if (existsSync(wrapperPath)) {
        unlinkSync(wrapperPath);
      }

      return {
        success: true,
        message: 'JM2 service uninstalled successfully.'
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to uninstall service: ${error.message}`
      };
    }
  }

  isInstalled(type) {
    try {
      const serviceName = this.getServiceName();
      execSync(`sc query "${serviceName}"`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  getStatus(type) {
    const installed = this.isInstalled(type);
    let running = false;

    if (installed) {
      try {
        const serviceName = this.getServiceName();
        const result = execSync(`sc query "${serviceName}"`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
        running = result.includes('RUNNING');
      } catch {
        running = false;
      }
    }

    return { installed, running };
  }
}

/**
 * Install JM2 as a system service
 * @param {string} type - Service type: 'user' or 'system'
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function installService(type = ServiceType.USER) {
  const service = getPlatformService();
  return service.install(type);
}

/**
 * Uninstall JM2 system service
 * @param {string} type - Service type: 'user' or 'system'
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function uninstallService(type = ServiceType.USER) {
  const service = getPlatformService();
  return service.uninstall(type);
}

/**
 * Check if service is installed
 * @param {string} type - Service type: 'user' or 'system'
 * @returns {{installed: boolean, running: boolean}}
 */
export function getServiceStatus(type = ServiceType.USER) {
  const service = getPlatformService();
  return service.getStatus(type);
}

/**
 * Get current platform
 * @returns {string} Platform identifier
 */
export function getPlatform() {
  return process.platform;
}

/**
 * Check if platform is supported for service installation
 * @returns {boolean}
 */
export function isPlatformSupported() {
  const platform = process.platform;
  return Object.values(Platform).includes(platform);
}