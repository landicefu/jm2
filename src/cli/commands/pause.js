/**
 * jm2 pause command
 * Pauses one or more jobs (prevents them from running)
 */

import { send } from '../../ipc/client.js';
import { MessageType } from '../../ipc/protocol.js';
import { printSuccess, printError, printWarning } from '../utils/output.js';
import { isDaemonRunning } from '../../daemon/index.js';
import chalk from 'chalk';

/**
 * Execute the pause command
 * @param {string|string[]} jobRefs - Job ID(s) or name(s)
 * @param {object} options - Command options
 * @returns {Promise<number>} Exit code
 */
export async function pauseCommand(jobRefs, options = {}) {
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

  let successCount = 0;
  let failCount = 0;

  for (const jobRef of refs) {
    const result = await pauseSingleJob(jobRef);
    if (result) {
      successCount++;
    } else {
      failCount++;
    }
  }

  // Summary
  if (successCount > 0) {
    printSuccess(`Paused ${successCount} job(s)`);
  }

  if (failCount > 0) {
    printError(`Failed to pause ${failCount} job(s)`);
    return 1;
  }

  return 0;
}

/**
 * Pause a single job
 * @param {string} jobRef - Job ID or name
 * @returns {Promise<boolean>} True if successful
 */
async function pauseSingleJob(jobRef) {
  try {
    // Determine if jobRef is an ID (numeric) or name
    const jobId = parseInt(jobRef, 10);
    const message = isNaN(jobId)
      ? { type: MessageType.JOB_PAUSE, jobName: jobRef }
      : { type: MessageType.JOB_PAUSE, jobId };

    const response = await send(message);

    if (response.type === MessageType.ERROR) {
      printError(`${jobRef}: ${response.message}`);
      return false;
    }

    if (response.type === MessageType.JOB_PAUSED) {
      if (response.job) {
        const name = response.job.name || response.job.id;
        printSuccess(`Paused: ${name}`);
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

export default { pauseCommand };
