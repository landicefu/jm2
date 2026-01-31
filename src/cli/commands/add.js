/**
 * jm2 add command
 * Adds a new job to the scheduler
 */

import { send } from '../../ipc/client.js';
import { MessageType } from '../../ipc/protocol.js';
import { printSuccess, printError, printInfo } from '../utils/output.js';
import { isDaemonRunning } from '../../daemon/index.js';
import { parseDateTime, parseRunIn } from '../../utils/datetime.js';

/**
 * Execute the add command
 * @param {string} command - Command to execute
 * @param {object} options - Command options
 * @returns {Promise<number>} Exit code
 */
export async function addCommand(command, options = {}) {
  // Check if daemon is running
  if (!isDaemonRunning()) {
    printError('Daemon is not running. Start it with: jm2 start');
    return 1;
  }

  if (!command || command.trim() === '') {
    printError('Command is required');
    return 1;
  }

  try {
    // Build job data
    const jobData = {
      command: command.trim(),
    };

    // Handle scheduling options
    const { cron, at, delay } = options;
    
    if (cron && at) {
      printError('Cannot specify both --cron and --at');
      return 1;
    }
    
    if (cron && delay) {
      printError('Cannot specify both --cron and --delay');
      return 1;
    }
    
    if (at && delay) {
      printError('Cannot specify both --at and --delay');
      return 1;
    }

    // Parse scheduling
    if (cron) {
      jobData.cron = cron;
    } else if (at) {
      try {
        const date = parseDateTime(at);
        jobData.runAt = date.toISOString();
      } catch (error) {
        printError(`Invalid datetime: ${error.message}`);
        return 1;
      }
    } else if (delay) {
      try {
        const date = parseRunIn(delay);
        jobData.runAt = date.toISOString();
      } catch (error) {
        printError(`Invalid duration: ${error.message}`);
        return 1;
      }
    } else {
      printError('Scheduling option required: --cron, --at, or --delay');
      return 1;
    }

    // Optional fields
    if (options.name) {
      jobData.name = options.name;
    }

    if (options.tag) {
      // Handle multiple tags
      const tags = Array.isArray(options.tag) 
        ? options.tag 
        : [options.tag];
      jobData.tags = tags;
    }

    if (options.cwd) {
      jobData.cwd = options.cwd;
    }

    if (options.env) {
      // Parse env options (format: KEY=value)
      const envVars = Array.isArray(options.env) 
        ? options.env 
        : [options.env];
      jobData.env = {};
      for (const envVar of envVars) {
        const [key, ...valueParts] = envVar.split('=');
        if (key && valueParts.length > 0) {
          jobData.env[key] = valueParts.join('=');
        }
      }
    }

    if (options.timeout) {
      jobData.timeout = options.timeout;
    }

    if (options.retry !== undefined) {
      jobData.retry = parseInt(options.retry, 10);
      if (isNaN(jobData.retry) || jobData.retry < 0) {
        printError('Retry must be a non-negative integer');
        return 1;
      }
    }

    // Send to daemon
    printInfo('Adding job...');
    
    const response = await send({
      type: MessageType.JOB_ADD,
      jobData,
    });

    if (response.type === MessageType.ERROR) {
      printError(response.message);
      return 1;
    }

    if (response.type === MessageType.JOB_ADDED && response.job) {
      const job = response.job;
      printSuccess(`Job added: ${job.name || job.id}`);
      
      if (job.cron) {
        printInfo(`Schedule: ${job.cron}`);
      } else if (job.runAt) {
        const runDate = new Date(job.runAt);
        printInfo(`Scheduled for: ${runDate.toLocaleString()}`);
      }
      
      return 0;
    }

    printError('Unexpected response from daemon');
    return 1;
  } catch (error) {
    printError(`Failed to add job: ${error.message}`);
    return 1;
  }
}

export default addCommand;
