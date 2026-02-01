/**
 * JM2 install command
 * Registers JM2 daemon to start on system boot
 */

import {
  installService,
  getServiceStatus,
  isElevated,
  ServiceType,
  getPlatform,
  isPlatformSupported
} from '../../core/service.js';
import { printSuccess, printError, printInfo, printWarning } from '../utils/output.js';

/**
 * Execute the install command
 * @param {object} options - Command options
 * @param {boolean} options.user - Install for current user only
 * @param {boolean} options.system - Install system-wide
 * @returns {Promise<number>} Exit code
 */
export async function installCommand(options = {}) {
  // Validate platform support
  if (!isPlatformSupported()) {
    printError(`Service installation is not supported on platform: ${getPlatform()}`);
    return 1;
  }

  // Determine installation type
  const type = options.system ? ServiceType.SYSTEM : ServiceType.USER;

  // Check current status
  const status = getServiceStatus(type);
  if (status.installed) {
    printWarning(`JM2 service is already installed (${type} level).`);
    printInfo(`Service status: ${status.running ? 'running' : 'stopped'}`);
    printInfo('Use "jm2 uninstall" first if you want to reinstall.');
    return 1;
  }

  // Show what we're doing
  if (type === ServiceType.SYSTEM) {
    printInfo('Installing JM2 service system-wide...');
    if (!isElevated()) {
      printWarning('Administrator/root privileges required for system-wide installation.');
      printInfo('You will be prompted for elevation if needed.');
    }
  } else {
    printInfo('Installing JM2 service for current user...');
  }

  // Perform installation
  const result = await installService(type);

  if (result.success) {
    printSuccess(result.message);

    // Show additional info
    const newStatus = getServiceStatus(type);
    if (newStatus.running) {
      printInfo('Service is now running and will start automatically on boot.');
    } else {
      printWarning('Service installed but not running. You may need to start it manually.');
    }

    // Platform-specific notes
    const platform = getPlatform();
    if (platform === 'darwin') {
      printInfo('macOS: Service configured via launchd');
    } else if (platform === 'linux') {
      printInfo('Linux: Service configured via systemd');
    } else if (platform === 'win32') {
      printInfo('Windows: Service configured via Service Control Manager');
    }

    return 0;
  } else {
    printError(result.message);

    // Provide helpful guidance for common errors
    if (result.message.includes('administrator') || result.message.includes('root') || result.message.includes('privileges')) {
      if (type === ServiceType.SYSTEM) {
        printInfo('Tip: Try installing without --system flag for user-level installation:');
        printInfo('  jm2 install');
      }
    }

    return 1;
  }
}

export default installCommand;
