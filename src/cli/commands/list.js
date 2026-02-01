/**
 * JM2 list command
 * Lists all jobs with optional filtering
 */

import { send } from '../../ipc/client.js';
import { MessageType } from '../../ipc/protocol.js';
import { 
  printSuccess, 
  printError, 
  printInfo,
  printHeader,
  createJobTable,
  colorizeStatus,
  formatDate,
  formatRelativeTime,
} from '../utils/output.js';
import { isDaemonRunning } from '../../daemon/index.js';
import chalk from 'chalk';

/**
 * Execute the list command
 * @param {object} options - Command options
 * @returns {Promise<number>} Exit code
 */
export async function listCommand(options = {}) {
  // Check if daemon is running
  if (!isDaemonRunning()) {
    printError('Daemon is not running. Start it with: jm2 start');
    return 1;
  }

  try {
    // Build filters
    const filters = {};
    
    if (options.tag) {
      filters.tag = options.tag;
    }
    
    if (options.status) {
      filters.status = options.status;
    }
    
    if (options.type) {
      filters.type = options.type;
    }

    // Request jobs from daemon
    const response = await send({
      type: MessageType.JOB_LIST,
      filters: Object.keys(filters).length > 0 ? filters : undefined,
    });

    if (response.type === MessageType.ERROR) {
      printError(response.message);
      return 1;
    }

    if (response.type === MessageType.JOB_LIST_RESULT) {
      const jobs = response.jobs || [];
      
      if (jobs.length === 0) {
        printInfo('No jobs found');
        return 0;
      }

      // Print header
      const filterDesc = [];
      if (options.tag) filterDesc.push(`tag: ${options.tag}`);
      if (options.status) filterDesc.push(`status: ${options.status}`);
      if (options.type) filterDesc.push(`type: ${options.type}`);
      
      if (filterDesc.length > 0) {
        printHeader(`Jobs (${filterDesc.join(', ')})`);
      } else {
        printHeader('Jobs');
      }

      if (options.verbose) {
        // Verbose output - detailed list
        for (const job of jobs) {
          printJobDetails(job);
        }
      } else {
        // Table output
        const table = createJobTable();
        
        for (const job of jobs) {
          const schedule = job.cron 
            ? chalk.gray(job.cron) 
            : job.runAt 
              ? formatRelativeTime(job.runAt)
              : chalk.gray('Manual');
          
          table.push([
            job.id,
            job.name || chalk.gray('-'),
            colorizeStatus(job.status),
            schedule,
            formatRelativeTime(job.nextRun),
            formatRelativeTime(job.lastRun),
          ]);
        }
        
        console.log(table.toString());
      }
      
      console.log();
      printInfo(`${jobs.length} job${jobs.length === 1 ? '' : 's'} found`);
      
      return 0;
    }

    printError('Unexpected response from daemon');
    return 1;
  } catch (error) {
    printError(`Failed to list jobs: ${error.message}`);
    return 1;
  }
}

/**
 * Print detailed job information
 * @param {object} job - Job object
 */
function printJobDetails(job) {
  console.log(chalk.bold(`\nJob: ${job.name || job.id}`));
  console.log(`  ID: ${job.id}`);
  console.log(`  Status: ${colorizeStatus(job.status)}`);
  console.log(`  Command: ${chalk.gray(job.command)}`);
  
  if (job.cron) {
    console.log(`  Schedule: ${chalk.gray(job.cron)} (cron)`);
  } else if (job.runAt) {
    console.log(`  Schedule: ${formatDate(job.runAt)} (one-time)`);
  }
  
  if (job.nextRun) {
    console.log(`  Next Run: ${formatRelativeTime(job.nextRun)}`);
  }
  
  if (job.lastRun) {
    console.log(`  Last Run: ${formatRelativeTime(job.lastRun)}`);
    if (job.lastResult) {
      const resultColor = job.lastResult === 'success' ? chalk.green : chalk.red;
      console.log(`  Last Result: ${resultColor(job.lastResult)}`);
    }
  }
  
  if (job.tags && job.tags.length > 0) {
    console.log(`  Tags: ${job.tags.map(t => chalk.cyan(t)).join(', ')}`);
  }
  
  if (job.cwd) {
    console.log(`  Working Dir: ${chalk.gray(job.cwd)}`);
  }
  
  if (job.timeout) {
    console.log(`  Timeout: ${chalk.gray(job.timeout)}ms`);
  }
  
  if (job.retry > 0) {
    console.log(`  Retry: ${chalk.gray(job.retry)} attempts`);
  }
  
  if (job.runCount > 0) {
    console.log(`  Run Count: ${chalk.gray(job.runCount)}`);
  }
  
  console.log(`  Created: ${formatDate(job.createdAt)}`);
}

export default listCommand;
