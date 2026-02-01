/**
 * JM2 edit command
 * Edit an existing job's properties
 */

import { send } from '../../ipc/client.js';
import { MessageType } from '../../ipc/protocol.js';
import { printSuccess, printError, printInfo } from '../utils/output.js';
import { isDaemonRunning } from '../../daemon/index.js';
import { parseDateTime, parseRunIn } from '../../utils/datetime.js';

/**
 * Execute the edit command
 * @param {string} jobRef - Job ID or name
 * @param {object} options - Command options
 * @returns {Promise<number>} Exit code
 */
export async function editCommand(jobRef, options = {}) {
  // Check if daemon is running
  if (!isDaemonRunning()) {
    printError('Daemon is not running. Start it with: jm2 start');
    return 1;
  }

  if (!jobRef || jobRef.trim() === '') {
    printError('Job ID or name is required');
    return 1;
  }

  // Build updates object from options
  const updates = {};

  // Validate that at least one option is provided
  const hasUpdates =
    options.command !== undefined ||
    options.name !== undefined ||
    options.cron !== undefined ||
    options.at !== undefined ||
    options.delay !== undefined ||
    options.cwd !== undefined ||
    options.env !== undefined ||
    options.env !== undefined ||
    options.timeout !== undefined ||
    options.retry !== undefined ||
    options.tag !== undefined;

  if (!hasUpdates) {
    printError('No changes specified. Use options like --command, --cron, --name, etc.');
    return 1;
  }

  // Handle mutually exclusive scheduling options
  const hasCron = options.cron !== undefined;
  const hasAt = options.at !== undefined;
  const hasDelay = options.delay !== undefined;

  if (hasCron && hasAt) {
    printError('Cannot specify both --cron and --at');
    return 1;
  }
  if (hasCron && hasDelay) {
    printError('Cannot specify both --cron and --delay');
    return 1;
  }
  if (hasAt && hasDelay) {
    printError('Cannot specify both --at and --delay');
    return 1;
  }

  // Apply updates
  if (options.command !== undefined) {
    if (!options.command.trim()) {
      printError('Command cannot be empty');
      return 1;
    }
    updates.command = options.command.trim();
  }

  if (options.name !== undefined) {
    if (!options.name.trim()) {
      printError('Name cannot be empty');
      return 1;
    }
    updates.name = options.name.trim();
  }

  // Handle scheduling updates
  if (hasCron) {
    updates.cron = options.cron;
    updates.runAt = null; // Clear runAt when switching to cron
  } else if (hasAt) {
    try {
      const date = parseDateTime(options.at);
      updates.runAt = date.toISOString();
      updates.cron = null; // Clear cron when switching to runAt
    } catch (error) {
      printError(`Invalid datetime: ${error.message}`);
      return 1;
    }
  } else if (hasDelay) {
    try {
      const date = parseRunIn(options.delay);
      updates.runAt = date.toISOString();
      updates.cron = null; // Clear cron when switching to runAt
    } catch (error) {
      printError(`Invalid duration: ${error.message}`);
      return 1;
    }
  }

  if (options.cwd !== undefined) {
    updates.cwd = options.cwd || null;
  }

  if (options.env !== undefined) {
    // Parse env options (format: KEY=value)
    const envVars = Array.isArray(options.env)
      ? options.env
      : options.env ? [options.env] : [];
    
    if (envVars.length > 0) {
      updates.env = {};
      for (const envVar of envVars) {
        const [key, ...valueParts] = envVar.split('=');
        if (key && valueParts.length > 0) {
          updates.env[key] = valueParts.join('=');
        }
      }
    }
  }

  if (options.timeout !== undefined) {
    updates.timeout = options.timeout || null;
  }

  if (options.retry !== undefined) {
    const retry = parseInt(options.retry, 10);
    if (isNaN(retry) || retry < 0) {
      printError('Retry must be a non-negative integer');
      return 1;
    }
    updates.retry = retry;
  }

  if (options.tag !== undefined) {
    // Handle multiple tags
    const tags = Array.isArray(options.tag)
      ? options.tag
      : options.tag ? [options.tag] : [];
    if (tags.length > 0) {
      updates.tags = tags;
    }
  }

  try {
    // Determine if jobRef is an ID (numeric) or name
    const jobId = parseInt(jobRef, 10);
    const message = isNaN(jobId)
      ? { type: MessageType.JOB_UPDATE, jobName: jobRef, updates }
      : { type: MessageType.JOB_UPDATE, jobId, updates };

    printInfo(`Updating job: ${jobRef}...`);

    const response = await send(message);

    if (response.type === MessageType.ERROR) {
      printError(response.message);
      return 1;
    }

    if (response.type === MessageType.JOB_UPDATED) {
      const job = response.job;

      if (!job) {
        printError(`Job not found: ${jobRef}`);
        return 1;
      }

      printSuccess(`Job updated: ${job.name || job.id}`);

      // Show what was updated
      const updatedFields = Object.keys(updates);
      if (updatedFields.length > 0) {
        printInfo(`Updated fields: ${updatedFields.join(', ')}`);
      }

      return 0;
    }

    printError('Unexpected response from daemon');
    return 1;
  } catch (error) {
    printError(`Failed to update job: ${error.message}`);
    return 1;
  }
}

export default { editCommand };
