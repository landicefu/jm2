/**
 * JM2 export command
 * Exports job configurations to a JSON file
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getJobs } from '../../core/storage.js';
import { printSuccess, printError, printInfo } from '../utils/output.js';

/**
 * Execute the export command
 * @param {object} options - Command options
 * @returns {Promise<number>} Exit code
 */
export async function exportCommand(options = {}) {
  try {
    // Get all jobs from storage
    const jobs = getJobs();

    if (jobs.length === 0) {
      printInfo('No jobs to export');
      return 0;
    }

    // Prepare export data
    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      jobs: jobs.map(job => ({
        // Export all job fields except runtime state
        // Generate a name for unnamed jobs using job ID
        name: job.name || `job-${job.id}`,
        command: job.command,
        type: job.type,
        cron: job.cron,
        runAt: job.runAt,
        status: job.status,
        tags: job.tags,
        env: job.env,
        cwd: job.cwd,
        timeout: job.timeout,
        retry: job.retry,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      })),
    };

    // Determine output path
    const outputPath = resolve(options.output || 'jm2-export.json');

    // Write to file
    writeFileSync(outputPath, JSON.stringify(exportData, null, 2), 'utf8');

    printSuccess(`Exported ${jobs.length} job(s) to ${outputPath}`);
    return 0;
  } catch (error) {
    printError(`Failed to export jobs: ${error.message}`);
    return 1;
  }
}
