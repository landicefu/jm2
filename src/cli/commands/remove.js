/**
 * jm2 remove command
 * Removes one or more jobs from the scheduler
 */

import { send } from '../../ipc/client.js';
import { MessageType } from '../../ipc/protocol.js';
import { printSuccess, printError, printInfo, printWarning } from '../utils/output.js';
import { isDaemonRunning } from '../../daemon/index.js';
import { confirmDestructive } from '../utils/prompts.js';

/**
 * Execute the remove command
 * @param {string|string[]} jobRefs - Job ID(s) or name(s)
 * @param {object} options - Command options
 * @returns {Promise<number>} Exit code
 */
export async function removeCommand(jobRefs, options = {}) {
  // Check if daemon is running
  if (!isDaemonRunning()) {
    printError('Daemon is not running. Start it with: jm2 start');
    return 1;
  }

  // Normalize jobRefs to array
  const refs = Array.isArray(jobRefs) ? jobRefs : [jobRefs];

  if (refs.length === 0 || (refs.length === 1 && !refs[0])) {
    printError('Job ID or name is required');
    return 1;
  }

  // Confirm destructive action unless --force is used
  const action = refs.length === 1
    ? `remove job "${refs[0]}"`
    : `remove ${refs.length} jobs`;

  const confirmed = await confirmDestructive(action, options.force);
  if (!confirmed) {
    printInfo('Operation cancelled');
    return 0;
  }

  let successCount = 0;
  let failCount = 0;

  for (const jobRef of refs) {
    const result = await removeSingleJob(jobRef);
    if (result) {
      successCount++;
    } else {
      failCount++;
    }
  }

  // Summary
  if (successCount > 0) {
    printSuccess(`Removed ${successCount} job(s)`);
  }

  if (failCount > 0) {
    printError(`Failed to remove ${failCount} job(s)`);
    return 1;
  }

  return 0;
}

/**
 * Remove a single job
 * @param {string} jobRef - Job ID or name
 * @returns {Promise<boolean>} True if successful
 */
async function removeSingleJob(jobRef) {
  try {
    // Determine if jobRef is an ID (numeric) or name
    const jobId = parseInt(jobRef, 10);
    const message = isNaN(jobId)
      ? { type: MessageType.JOB_REMOVE, jobName: jobRef }
      : { type: MessageType.JOB_REMOVE, jobId };

    const response = await send(message);

    if (response.type === MessageType.ERROR) {
      printError(`${jobRef}: ${response.message}`);
      return false;
    }

    if (response.type === MessageType.JOB_REMOVED) {
      if (response.success) {
        printSuccess(`Removed: ${jobRef}`);
        return true;
      } else {
        printWarning(`Job not found: ${jobRef}`);
        return false;
      }
    }

    printError(`${jobRef}: Unexpected response from daemon`);
    return false;
  } catch (error) {
    printError(`${jobRef}: ${error.message}`);
    return false;
  }
}

export default { removeCommand };
