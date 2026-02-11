/**
 * JM2 restore command
 * Restores JM2 data from a backup file
 */

import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { join, basename } from 'node:path';
import { getDataDir, getJobsFile, getConfigFile, getHistoryDbFile, getLogsDir, ensureDataDir, ensureLogsDir } from '../../utils/paths.js';
import { printSuccess, printError, printInfo, printWarning } from '../utils/output.js';
import { isDaemonRunning } from '../../daemon/index.js';

/**
 * Execute the restore command
 * @param {string} backupPath - Path to backup file
 * @param {object} options - Command options
 * @returns {Promise<number>} Exit code
 */
export async function restoreCommand(backupPath, options = {}) {
  if (!backupPath) {
    printError('Backup file path is required');
    printInfo('Usage: jm2 restore <backup-file>');
    return 1;
  }

  // Resolve full path
  const fullPath = backupPath.startsWith('/') 
    ? backupPath 
    : join(process.cwd(), backupPath);

  if (!existsSync(fullPath)) {
    printError(`Backup file not found: ${backupPath}`);
    return 1;
  }

  try {
    printInfo(`Reading backup: ${basename(fullPath)}`);

    // Read backup data
    let jsonData;
    
    if (fullPath.endsWith('.gz')) {
      // Decompress gzip file
      const chunks = [];
      const source = createReadStream(fullPath);
      const gunzip = createGunzip();
      
      for await (const chunk of source.pipe(gunzip)) {
        chunks.push(chunk);
      }
      
      jsonData = Buffer.concat(chunks).toString('utf8');
    } else {
      // Read uncompressed
      const { readFileSync } = await import('node:fs');
      jsonData = readFileSync(fullPath, 'utf8');
    }

    // Parse backup data
    const backupData = JSON.parse(jsonData);

    // Validate backup format
    if (!backupData.version) {
      printError('Invalid backup file format');
      return 1;
    }

    printInfo(`Backup created: ${backupData.createdAt || 'unknown date'}`);
    printInfo(`Platform: ${backupData.platform || 'unknown'}`);

    // Warn if daemon is running
    if (isDaemonRunning() && !options.force) {
      printWarning('Daemon is currently running. Stop it first or use --force');
      printInfo('Tip: jm2 stop && jm2 restore <backup-file> && jm2 start');
      return 1;
    }

    // Confirm restore unless --yes flag
    if (!options.yes) {
      printWarning('This will overwrite existing JM2 data');
      printInfo('Use --yes to skip this confirmation');
      
      // For now, require --yes flag (interactive prompts would need additional deps)
      printError('Use --yes flag to confirm restore');
      return 1;
    }

    // Ensure data directory exists
    ensureDataDir();
    ensureLogsDir();

    let restoredCount = 0;

    // Restore jobs
    if (backupData.jobs) {
      writeFileSync(getJobsFile(), JSON.stringify(backupData.jobs, null, 2));
      const jobCount = Array.isArray(backupData.jobs) ? backupData.jobs.length : 1;
      printInfo(`Restored: ${jobCount} job(s)`);
      restoredCount++;
    }

    // Restore config
    if (backupData.config) {
      writeFileSync(getConfigFile(), JSON.stringify(backupData.config, null, 2));
      printInfo('Restored: config.json');
      restoredCount++;
    }

    // Restore history
    if (backupData.history) {
      const historyBuffer = Buffer.from(backupData.history, 'base64');
      writeFileSync(getHistoryDbFile(), historyBuffer);
      printInfo('Restored: history.db');
      restoredCount++;
    }

    // Restore logs
    if (backupData.logs && typeof backupData.logs === 'object') {
      const logsDir = getLogsDir();
      let logCount = 0;
      
      for (const [filename, content] of Object.entries(backupData.logs)) {
        const logPath = join(logsDir, filename);
        writeFileSync(logPath, content);
        logCount++;
      }
      
      if (logCount > 0) {
        printInfo(`Restored: ${logCount} log file(s)`);
        restoredCount++;
      }
    }

    if (restoredCount === 0) {
      printWarning('No data found in backup file');
      return 0;
    }

    printSuccess(`Restore completed successfully`);
    printInfo(`Restored ${restoredCount} data type(s)`);
    
    if (isDaemonRunning()) {
      printInfo('Note: You may need to restart the daemon to load restored jobs');
      printInfo('Run: jm2 restart');
    }

    return 0;
  } catch (error) {
    printError(`Failed to restore backup: ${error.message}`);
    return 1;
  }
}

export default restoreCommand;
