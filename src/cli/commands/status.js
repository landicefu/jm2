/**
 * JM2 status command
 * Shows the daemon status and statistics
 */

import { isDaemonRunning, getDaemonStatus } from '../../daemon/index.js';
import { getJobs } from '../../core/storage.js';
import { 
  colorizeDaemonStatus, 
  createStatusTable,
  printHeader,
} from '../utils/output.js';

/**
 * Execute the status command
 * @param {object} _options - Command options (none for status)
 * @returns {Promise<number>} Exit code
 */
export async function statusCommand(_options = {}) {
  const running = isDaemonRunning();
  const { pid } = getDaemonStatus();
  
  // Count jobs
  const jobs = getJobs();
  const totalJobs = jobs.length;
  const activeJobs = jobs.filter(j => j.status === 'active').length;
  const pausedJobs = jobs.filter(j => j.status === 'paused').length;

  // Print header
  printHeader('JM2 Daemon Status');

  // Create status table
  const table = createStatusTable();
  
  table.push(
    ['Status:', colorizeDaemonStatus(running)],
    ['PID:', pid ? pid.toString() : '-'],
    ['Jobs:', `${totalJobs} total (${activeJobs} active, ${pausedJobs} paused)`]
  );

  console.log(table.toString());
  console.log();

  return 0;
}

export default statusCommand;
