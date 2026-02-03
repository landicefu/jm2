/**
 * JM2 tags command
 * Manage job tags - list, add, remove, rename, and more
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
  formatRelativeTime,
} from '../utils/output.js';
import { isDaemonRunning } from '../../daemon/index.js';
import chalk from 'chalk';

/**
 * Execute the tags command
 * @param {string} subcommand - Subcommand to run (list, add, rm, clear, rename, jobs)
 * @param {string[]} args - Arguments for the subcommand
 * @param {object} options - Command options
 * @returns {Promise<number>} Exit code
 */
export async function tagsCommand(subcommand, args, options = {}) {
  // Check if daemon is running
  if (!isDaemonRunning()) {
    printError('Daemon is not running. Start it with: jm2 start');
    return 1;
  }

  switch (subcommand) {
    case 'list':
      return await listTags(options);
    case 'add':
      return await addTags(args, options);
    case 'rm':
    case 'remove':
      return await removeTags(args, options);
    case 'clear':
      return await clearTags(args, options);
    case 'rename':
      return await renameTag(args, options);
    case 'jobs':
      return await listJobsByTag(args, options);
    default:
      printError(`Unknown subcommand: ${subcommand}`);
      printInfo('Available subcommands: list, add, rm, clear, rename, jobs');
      return 1;
  }
}

/**
 * List all tags with job counts
 * @param {object} options - Command options
 * @returns {Promise<number>} Exit code
 */
async function listTags(options) {
  try {
    const response = await send({
      type: MessageType.TAG_LIST,
    });

    if (response.type === MessageType.ERROR) {
      printError(response.message);
      return 1;
    }

    if (response.type === MessageType.TAG_LIST_RESULT) {
      const tags = response.tags || {};
      const tagNames = Object.keys(tags).sort();

      if (tagNames.length === 0) {
        printInfo('No tags found');
        return 0;
      }

      printHeader('Tags');

      // Group by tag
      for (const tagName of tagNames) {
        const tagData = tags[tagName];
        const jobCount = tagData.jobs?.length || 0;
        console.log(`  ${chalk.cyan(tagName)} ${chalk.gray(`(${jobCount} job${jobCount === 1 ? '' : 's'})`)}`);
        
        if (options.verbose && tagData.jobs) {
          for (const job of tagData.jobs) {
            console.log(`    - ${job.name || job.id} ${chalk.gray(`[${job.id}]`)}`);
          }
        }
      }

      console.log();
      printInfo(`${tagNames.length} tag${tagNames.length === 1 ? '' : 's'} found`);
      
      return 0;
    }

    printError('Unexpected response from daemon');
    return 1;
  } catch (error) {
    printError(`Failed to list tags: ${error.message}`);
    return 1;
  }
}

/**
 * Add tags to jobs
 * @param {string[]} args - [tagName, ...jobIds]
 * @param {object} options - Command options
 * @returns {Promise<number>} Exit code
 */
async function addTags(args, options) {
  if (args.length < 2) {
    printError('Usage: jm2 tags add <tag> <job-id-or-name> [...job-ids-or-names]');
    return 1;
  }

  const tagName = args[0];
  const jobRefs = args.slice(1);

  try {
    const response = await send({
      type: MessageType.TAG_ADD,
      tag: tagName,
      jobRefs,
    });

    if (response.type === MessageType.ERROR) {
      printError(response.message);
      return 1;
    }

    if (response.type === MessageType.TAG_ADD_RESULT) {
      printSuccess(`Tag "${tagName}" added to ${response.count} job${response.count === 1 ? '' : 's'}`);
      
      if (response.count > 0 && options.verbose) {
        printInfo(`Updated job IDs: ${response.jobIds.join(', ')}`);
      }
      
      return 0;
    }

    printError('Unexpected response from daemon');
    return 1;
  } catch (error) {
    printError(`Failed to add tag: ${error.message}`);
    return 1;
  }
}

/**
 * Remove tags from jobs
 * @param {string[]} args - [tagName, ...jobIds] or just [tagName] to remove from all
 * @param {object} options - Command options
 * @returns {Promise<number>} Exit code
 */
async function removeTags(args, options) {
  if (args.length < 1) {
    printError('Usage: jm2 tags rm <tag> [job-id-or-name ...]');
    printInfo('Or: jm2 tags rm <tag> --all  (to remove tag from all jobs)');
    return 1;
  }

  const tagName = args[0];
  const jobRefs = args.length > 1 ? args.slice(1) : [];

  // If --all flag is set or no specific jobs, remove from all
  const removeFromAll = options.all || jobRefs.length === 0;

  try {
    const response = await send({
      type: MessageType.TAG_REMOVE,
      tag: tagName,
      jobRefs: removeFromAll ? null : jobRefs,
      all: removeFromAll,
    });

    if (response.type === MessageType.ERROR) {
      printError(response.message);
      return 1;
    }

    if (response.type === MessageType.TAG_REMOVE_RESULT) {
      printSuccess(`Tag "${tagName}" removed from ${response.count} job${response.count === 1 ? '' : 's'}`);
      
      if (response.count > 0 && options.verbose) {
        printInfo(`Updated job IDs: ${response.jobIds.join(', ')}`);
      }
      
      return 0;
    }

    printError('Unexpected response from daemon');
    return 1;
  } catch (error) {
    printError(`Failed to remove tag: ${error.message}`);
    return 1;
  }
}

/**
 * Clear all tags from jobs
 * @param {string[]} args - [...jobIds] or empty for all jobs
 * @param {object} options - Command options
 * @returns {Promise<number>} Exit code
 */
async function clearTags(args, options) {
  const jobRefs = args.length > 0 ? args : null;
  const clearAll = options.all || !jobRefs;

  if (clearAll && !options.force) {
    printError('This will clear all tags from all jobs. Use --force to confirm.');
    return 1;
  }

  try {
    const response = await send({
      type: MessageType.TAG_CLEAR,
      jobRefs,
      all: clearAll,
    });

    if (response.type === MessageType.ERROR) {
      printError(response.message);
      return 1;
    }

    if (response.type === MessageType.TAG_CLEAR_RESULT) {
      printSuccess(`Tags cleared from ${response.count} job${response.count === 1 ? '' : 's'}`);
      
      if (response.count > 0 && options.verbose) {
        printInfo(`Updated job IDs: ${response.jobIds.join(', ')}`);
      }
      
      return 0;
    }

    printError('Unexpected response from daemon');
    return 1;
  } catch (error) {
    printError(`Failed to clear tags: ${error.message}`);
    return 1;
  }
}

/**
 * Rename a tag across all jobs
 * @param {string[]} args - [oldTagName, newTagName]
 * @param {object} options - Command options
 * @returns {Promise<number>} Exit code
 */
async function renameTag(args, options) {
  if (args.length !== 2) {
    printError('Usage: jm2 tags rename <old-tag> <new-tag>');
    return 1;
  }

  const [oldTag, newTag] = args;

  try {
    const response = await send({
      type: MessageType.TAG_RENAME,
      oldTag,
      newTag,
    });

    if (response.type === MessageType.ERROR) {
      printError(response.message);
      return 1;
    }

    if (response.type === MessageType.TAG_RENAME_RESULT) {
      printSuccess(`Tag "${oldTag}" renamed to "${newTag}" in ${response.count} job${response.count === 1 ? '' : 's'}`);
      return 0;
    }

    printError('Unexpected response from daemon');
    return 1;
  } catch (error) {
    printError(`Failed to rename tag: ${error.message}`);
    return 1;
  }
}

/**
 * List jobs grouped by tag (including jobs with no tags)
 * @param {string[]} args - Optional tag name to filter
 * @param {object} options - Command options
 * @returns {Promise<number>} Exit code
 */
async function listJobsByTag(args, options) {
  const filterTag = args[0];

  try {
    const response = await send({
      type: MessageType.TAG_LIST,
    });

    if (response.type === MessageType.ERROR) {
      printError(response.message);
      return 1;
    }

    if (response.type === MessageType.TAG_LIST_RESULT) {
      const tags = response.tags || {};

      // If filtering by specific tag
      if (filterTag) {
        const tagData = tags[filterTag];
        if (!tagData || !tagData.jobs || tagData.jobs.length === 0) {
          printInfo(`No jobs found with tag "${filterTag}"`);
          return 0;
        }

        printHeader(`Jobs with tag "${filterTag}"`);
        printJobsTable(tagData.jobs);
        console.log();
        printInfo(`${tagData.jobs.length} job${tagData.jobs.length === 1 ? '' : 's'} found`);
        return 0;
      }

      // Show all jobs grouped by tag
      printHeader('Jobs by Tag');

      const tagNames = Object.keys(tags).sort();
      const noTagJobs = tags['(no tag)']?.jobs || [];

      // First show tagged jobs
      for (const tagName of tagNames) {
        if (tagName === '(no tag)') continue;
        
        const tagData = tags[tagName];
        if (!tagData.jobs || tagData.jobs.length === 0) continue;

        console.log(`\n${chalk.bold.cyan(tagName)} ${chalk.gray(`(${tagData.jobs.length} job${tagData.jobs.length === 1 ? '' : 's'})`)}`);
        printJobsTable(tagData.jobs, true);
      }

      // Then show jobs with no tags
      if (noTagJobs.length > 0) {
        console.log(`\n${chalk.bold.gray('(no tag)')} ${chalk.gray(`(${noTagJobs.length} job${noTagJobs.length === 1 ? '' : 's'})`)}`);
        printJobsTable(noTagJobs, true);
      }

      console.log();
      const totalJobs = Object.values(tags).reduce((sum, t) => sum + (t.jobs?.length || 0), 0);
      const uniqueJobs = new Set();
      Object.values(tags).forEach(t => t.jobs?.forEach(j => uniqueJobs.add(j.id)));
      printInfo(`${uniqueJobs.size} job${uniqueJobs.size === 1 ? '' : 's'} found (${tagNames.length - (noTagJobs.length > 0 ? 1 : 0)} tag${tagNames.length === 1 ? '' : 's'})`);
      
      return 0;
    }

    printError('Unexpected response from daemon');
    return 1;
  } catch (error) {
    printError(`Failed to list jobs by tag: ${error.message}`);
    return 1;
  }
}

/**
 * Print jobs in a compact table format
 * @param {Array} jobs - Array of job objects
 * @param {boolean} compact - Whether to use compact format
 */
function printJobsTable(jobs, compact = false) {
  const table = createJobTable();
  
  for (const job of jobs) {
    const schedule = job.cron 
      ? chalk.gray(job.cron) 
      : job.runAt 
        ? formatRelativeTime(job.runAt)
        : chalk.gray('Manual');
    
    if (compact) {
      console.log(`  ${job.id}  ${job.name || chalk.gray('-')}  ${colorizeStatus(job.status)}  ${schedule}`);
    } else {
      table.push([
        job.id,
        job.name || chalk.gray('-'),
        colorizeStatus(job.status),
        schedule,
        formatRelativeTime(job.nextRun),
        formatRelativeTime(job.lastRun),
      ]);
    }
  }
  
  if (!compact && jobs.length > 0) {
    console.log(table.toString());
  }
}

export default { tagsCommand };
