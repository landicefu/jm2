/**
 * JM2 show command
 * Shows detailed information about a job
 */

import { send } from '../../ipc/client.js';
import { MessageType } from '../../ipc/protocol.js';
import {
  printSuccess,
  printError,
  printInfo,
  printHeader,
  colorizeStatus,
  formatDate,
  formatRelativeTime,
  formatJobSchedule,
} from '../utils/output.js';
import { isDaemonRunning } from '../../daemon/index.js';
import { getJobLogFile } from '../../utils/paths.js';
import chalk from 'chalk';

/**
 * Execute the show command
 * @param {string} jobRef - Job ID or name
 * @param {object} options - Command options
 * @returns {Promise<number>} Exit code
 */
export async function showCommand(jobRef, options = {}) {
  // Check if daemon is running
  if (!isDaemonRunning()) {
    printError('Daemon is not running. Start it with: jm2 start');
    return 1;
  }

  if (!jobRef || jobRef.trim() === '') {
    printError('Job ID or name is required');
    return 1;
  }

  try {
    // Determine if jobRef is an ID (numeric) or name
    const jobId = parseInt(jobRef, 10);
    const message = isNaN(jobId)
      ? { type: MessageType.JOB_GET, jobName: jobRef }
      : { type: MessageType.JOB_GET, jobId };

    const response = await send(message);

    if (response.type === MessageType.ERROR) {
      printError(response.message);
      return 1;
    }

    if (response.type === MessageType.JOB_GET_RESULT) {
      const job = response.job;

      if (!job) {
        printError(`Job not found: ${jobRef}`);
        return 1;
      }

      if (options.recreateCommandOnly) {
        console.log(generateRecreateCommand(job));
      } else {
        printJobDetails(job);
      }
      return 0;
    }

    printError('Unexpected response from daemon');
    return 1;
  } catch (error) {
    printError(`Failed to get job: ${error.message}`);
    return 1;
  }
}

/**
 * Print detailed job information
 * @param {object} job - Job object
 */
function printJobDetails(job) {
  printHeader(`Job: ${job.name || job.id}`);

  // Basic info
  console.log(`${chalk.bold('ID:')}           ${job.id}`);
  console.log(`${chalk.bold('Name:')}         ${job.name || chalk.gray('-')}`);
  console.log(`${chalk.bold('Status:')}       ${colorizeStatus(job.status)}`);
  console.log(`${chalk.bold('Type:')}         ${job.type || 'manual'}`);

  // Schedule
  console.log(`${chalk.bold('Schedule:')}     ${formatJobSchedule(job)}`);

  if (job.nextRun) {
    console.log(`${chalk.bold('Next Run:')}     ${formatDate(job.nextRun)} (${formatRelativeTime(job.nextRun)})`);
  }

  if (job.lastRun) {
    console.log(`${chalk.bold('Last Run:')}     ${formatDate(job.lastRun)} (${formatRelativeTime(job.lastRun)})`);
  }

  // Command
  console.log();
  console.log(`${chalk.bold('Command:')}`);
  console.log(`  ${job.command}`);

  // Working directory
  if (job.cwd) {
    console.log();
    console.log(`${chalk.bold('Working Directory:')}`);
    console.log(`  ${job.cwd}`);
  }

  // Environment variables
  if (job.env && Object.keys(job.env).length > 0) {
    console.log();
    console.log(`${chalk.bold('Environment Variables:')}`);
    for (const [key, value] of Object.entries(job.env)) {
      console.log(`  ${key}=${value}`);
    }
  }

  // Tags
  if (job.tags && job.tags.length > 0) {
    console.log();
    console.log(`${chalk.bold('Tags:')}         ${job.tags.join(', ')}`);
  }

  // Timeout and retry
  if (job.timeout) {
    console.log();
    console.log(`${chalk.bold('Timeout:')}      ${job.timeout}ms`);
  }

  if (job.retry > 0) {
    console.log(`${chalk.bold('Retries:')}      ${job.retry}`);
  }

  // Metadata
  console.log();
  console.log(`${chalk.bold('Created:')}      ${formatDate(job.createdAt)}`);
  console.log(`${chalk.bold('Updated:')}      ${formatDate(job.updatedAt)}`);

  // Recreate command
  console.log();
  console.log(`${chalk.bold('Recreate Command:')}`);
  console.log(`  ${generateRecreateCommand(job)}`);

  // Log file path
  console.log();
  const logFile = getJobLogFile(job.name || `job-${job.id}`);
  console.log(`${chalk.bold('Log File:')}     ${logFile}`);

  // Execution info
  if (job.lastExitCode !== undefined && job.lastExitCode !== null) {
    const exitColor = job.lastExitCode === 0 ? chalk.green : chalk.red;
    console.log();
    console.log(`${chalk.bold('Last Exit Code:')} ${exitColor(job.lastExitCode)}`);
  }

  if (job.retryCount > 0) {
    console.log(`${chalk.bold('Retry Count:')}  ${job.retryCount}`);
  }

  console.log();
}

/**
 * Generate the jm2 add command to recreate this job
 * @param {object} job - Job object
 * @returns {string} Command string
 */
function generateRecreateCommand(job) {
  const parts = ['jm2 add'];
  
  // Add the command itself (quoted if it contains spaces)
  const command = job.command.includes(' ') ? `"${job.command}"` : job.command;
  parts.push(command);
  
  // Add name
  if (job.name) {
    parts.push(`--name ${job.name}`);
  }
  
  // Add scheduling option
  if (job.cron) {
    parts.push(`--cron "${job.cron}"`);
  } else if (job.runAt) {
    // For runAt, we need to format it nicely
    const runDate = new Date(job.runAt);
    const dateStr = runDate.toISOString().slice(0, 16).replace('T', ' ');
    parts.push(`--at "${dateStr}"`);
  }
  
  // Add working directory
  if (job.cwd) {
    parts.push(`--cwd "${job.cwd}"`);
  }
  
  // Add tags
  if (job.tags && job.tags.length > 0) {
    for (const tag of job.tags) {
      parts.push(`--tag ${tag}`);
    }
  }
  
  // Add environment variables
  if (job.env && Object.keys(job.env).length > 0) {
    for (const [key, value] of Object.entries(job.env)) {
      parts.push(`--env "${key}=${value}"`);
    }
  }
  
  // Add timeout
  if (job.timeout) {
    parts.push(`--timeout ${job.timeout}`);
  }
  
  // Add retry
  if (job.retry > 0) {
    parts.push(`--retry ${job.retry}`);
  }
  
  return parts.join(' ');
}

export default { showCommand };
