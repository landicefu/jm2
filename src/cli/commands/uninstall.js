/**
 * JM2 uninstall command
 * Unregisters JM2 daemon from system startup
 */

import {
  uninstallService,
  getServiceStatus,
  isElevated,
  ServiceType,
  getPlatform,
  isPlatformSupported
} from '../../core/service.js';
import { printSuccess, printError, printInfo, printWarning } from '../utils/output.js';
import { confirm } from '../utils/prompts.js';

/**
 * Execute the uninstall command
 * @param {object} options - Command options
 * @param {boolean} options.user - Uninstall user-level registration
 * @param {boolean} options.system - Uninstall system-wide registration
 * @param {boolean} options.force - Skip confirmation prompt
 * @returns {Promise<number>} Exit code
 */
export async function uninstallCommand(options = {}) {
  // Validate platform support
  if (!isPlatformSupported()) {
    printError(`Service uninstallation is not supported on platform: ${getPlatform()}`);
    return 1;
  }

  // Determine installation type
  const type = options.system ? ServiceType.SYSTEM : ServiceType.USER;

  // Check current status
  const status = getServiceStatus(type);
  if (!status.installed) {
    // Check if installed at the other level
    const otherType = type === ServiceType.USER ? ServiceType.SYSTEM : ServiceType.USER;
    const otherStatus = getServiceStatus(otherType);

    if (otherStatus.installed) {
      printWarning(`JM2 service is not installed at ${type} level, but is installed at ${otherType} level.`);
      printInfo(`Use "jm2 uninstall --${otherType}" to remove it.`);
      return 1;
    }

    printInfo(`JM2 service is not installed (${type} level).`);
    return 0;
  }

  // Show what we're doing
  if (type === ServiceType.SYSTEM) {
    printInfo('Uninstalling JM2 service system-wide...');
    if (!isElevated()) {
      printWarning('Administrator/root privileges required for system-wide uninstallation.');
    }
  } else {
    printInfo('Uninstalling JM2 service for current user...');
  }

  // Confirm if not forced
  if (!options.force) {
    const confirmed = await confirm(
      `Are you sure you want to uninstall the JM2 service (${type} level)?`
    );
    if (!confirmed) {
      printInfo('Uninstall cancelled.');
      return 0;
    }
  }

  // Perform uninstallation
  const result = await uninstallService(type);

  if (result.success) {
    printSuccess(result.message);
    printInfo('JM2 will no longer start automatically on boot.');
    return 0;
  } else {
    printError(result.message);

    // Provide helpful guidance for common errors
    if (result.message.includes('administrator') || result.message.includes('root') || result.message.includes('privileges')) {
      if (type === ServiceType.SYSTEM) {
        printInfo('Tip: If you want to uninstall the user-level service instead:');
        printInfo('  jm2 uninstall');
      }
    }

    return 1;
  }
}

export default uninstallCommand;
