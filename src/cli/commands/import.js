/**
 * jm2 import command
 * Imports job configurations from a JSON file
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { getJobs, saveJobs, jobNameExists } from '../../core/storage.js';
import { validateJob, createJob } from '../../core/job.js';
import { printSuccess, printError, printInfo, printWarning } from '../utils/output.js';
import { confirmDestructive } from '../utils/prompts.js';

/**
 * Generate a unique name by appending a number suffix
 * @param {string} baseName - Base name to start with
 * @param {Set<string>} existingNames - Set of existing names
 * @returns {string} Unique name
 */
function makeUniqueName(baseName, existingNames) {
  if (!existingNames.has(baseName)) {
    return baseName;
  }
  let suffix = 2;
  let newName;
  do {
    newName = `${baseName}-${suffix}`;
    suffix++;
  } while (existingNames.has(newName));
  return newName;
}

/**
 * Execute the import command
 * @param {string} file - Path to the import file
 * @param {object} options - Command options
 * @returns {Promise<number>} Exit code
 */
export async function importCommand(file, options = {}) {
  try {
    // Resolve file path
    const filePath = resolve(file);

    // Check if file exists
    if (!existsSync(filePath)) {
      printError(`Import file not found: ${filePath}`);
      return 1;
    }

    // Read and parse the import file
    let importData;
    try {
      const content = readFileSync(filePath, 'utf8');
      importData = JSON.parse(content);
    } catch (error) {
      printError(`Failed to parse import file: ${error.message}`);
      return 1;
    }

    // Validate import data structure
    if (!importData.jobs || !Array.isArray(importData.jobs)) {
      printError('Invalid import file format: missing or invalid "jobs" array');
      return 1;
    }

    if (importData.jobs.length === 0) {
      printInfo('No jobs found in import file');
      return 0;
    }

    // Get existing jobs
    const existingJobs = getJobs();
    const existingNames = new Set(existingJobs.map(j => j.name).filter(Boolean));

    // Prepare jobs for import - track original name to final name mapping
    const jobsToImport = [];
    const nameMapping = []; // { original, final, renamed }
    const skippedJobs = [];
    const invalidJobs = [];

    for (const jobData of importData.jobs) {
      // Validate job structure
      const validation = validateJob(jobData);
      if (!validation.valid) {
        invalidJobs.push({ name: jobData.name || 'unnamed', errors: validation.errors });
        continue;
      }

      // Determine the final name
      const originalName = jobData.name || 'unnamed';
      let finalName = jobData.name;

      if (existingNames.has(finalName)) {
        if (options.skip) {
          skippedJobs.push(finalName);
          continue;
        }
        // Generate a unique name
        finalName = makeUniqueName(finalName, existingNames);
      }

      // Create the job object
      const job = createJob({
        ...jobData,
        name: finalName,
        // Reset runtime state
        status: jobData.status === 'paused' ? 'paused' : 'active',
        runCount: 0,
        lastRun: null,
        lastResult: null,
        nextRun: null,
        retryCount: 0,
      });

      jobsToImport.push(job);
      existingNames.add(finalName);
      nameMapping.push({
        original: originalName,
        final: finalName,
        renamed: originalName !== finalName
      });
    }

    // Report issues
    if (invalidJobs.length > 0) {
      printWarning(`Skipping ${invalidJobs.length} invalid job(s):`);
      for (const { name, errors } of invalidJobs) {
        printWarning(`  - ${name}: ${errors.join(', ')}`);
      }
    }

    if (skippedJobs.length > 0) {
      printWarning(`Skipping ${skippedJobs.length} existing job(s): ${skippedJobs.join(', ')}`);
    }

    if (jobsToImport.length === 0) {
      printInfo('No jobs to import');
      return 0;
    }

    // Confirm import unless --force is used
    const action = `import ${jobsToImport.length} job(s)`;
    const confirmed = await confirmDestructive(action, options.force);
    if (!confirmed) {
      printInfo('Import cancelled');
      return 0;
    }

    // Import the jobs
    const allJobs = [...existingJobs, ...jobsToImport];
    saveJobs(allJobs);

    // Report results
    printSuccess(`Successfully imported ${jobsToImport.length} job(s)`);
    for (const mapping of nameMapping) {
      if (mapping.renamed) {
        printInfo(`  - ${mapping.original} → ${mapping.final} (renamed)`);
      } else {
        printInfo(`  - ${mapping.final}`);
      }
    }

    return 0;
  } catch (error) {
    printError(`Failed to import jobs: ${error.message}`);
    return 1;
  }
}
