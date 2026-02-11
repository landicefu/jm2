/**
 * JM2 backup command
 * Creates a backup of all JM2 data including jobs, history, and logs
 */

import { createWriteStream, existsSync, mkdirSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { join, basename } from 'node:path';
import { getDataDir, getJobsFile, getConfigFile, getHistoryDbFile, getLogsDir } from '../../utils/paths.js';
import { printSuccess, printError, printInfo, printWarning } from '../utils/output.js';
import dayjs from 'dayjs';

/**
 * Execute the backup command
 * @param {string} outputPath - Output file path (optional)
 * @param {object} options - Command options
 * @returns {Promise<number>} Exit code
 */
export async function backupCommand(outputPath, options = {}) {
  try {
    const dataDir = getDataDir();
    
    if (!existsSync(dataDir)) {
      printError('JM2 data directory not found. Nothing to backup.');
      return 1;
    }

    // Generate default filename if not provided
    if (!outputPath) {
      const timestamp = dayjs().format('YYYYMMDD_HHmmss');
      outputPath = `jm2-backup-${timestamp}.json.gz`;
    }

    // Ensure .json.gz extension
    if (!outputPath.endsWith('.json.gz') && !outputPath.endsWith('.json')) {
      outputPath += '.json.gz';
    }

    // Resolve full path
    const backupPath = outputPath.startsWith('/') 
      ? outputPath 
      : join(process.cwd(), outputPath);

    printInfo(`Creating backup: ${basename(backupPath)}`);

    // Gather backup data
    const backupData = {
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      platform: process.platform,
      jobs: null,
      config: null,
      history: null,
      logs: {},
    };

    // Backup jobs
    if (existsSync(getJobsFile())) {
      const jobsContent = readFileSync(getJobsFile(), 'utf8');
      backupData.jobs = JSON.parse(jobsContent);
      printInfo(`Included: ${backupData.jobs.length || 1} job(s)`);
    }

    // Backup config
    if (existsSync(getConfigFile())) {
      const configContent = readFileSync(getConfigFile(), 'utf8');
      backupData.config = JSON.parse(configContent);
      printInfo('Included: config.json');
    }

    // Backup history database (as base64)
    if (existsSync(getHistoryDbFile())) {
      const historyBuffer = readFileSync(getHistoryDbFile());
      backupData.history = historyBuffer.toString('base64');
      printInfo('Included: history.db');
    }

    // Backup logs
    const logsDir = getLogsDir();
    if (existsSync(logsDir)) {
      const logFiles = readdirSync(logsDir).filter(f => f.endsWith('.log'));
      for (const logFile of logFiles) {
        const logPath = join(logsDir, logFile);
        const logContent = readFileSync(logPath, 'utf8');
        backupData.logs[logFile] = logContent;
      }
      if (logFiles.length > 0) {
        printInfo(`Included: ${logFiles.length} log file(s)`);
      }
    }

    // Convert to JSON
    const jsonData = JSON.stringify(backupData, null, 2);

    // Write compressed file
    if (backupPath.endsWith('.gz')) {
      const source = new ReadableStream({
        start(controller) {
          controller.enqueue(Buffer.from(jsonData));
          controller.close();
        }
      });
      
      const gzip = createGzip();
      const output = createWriteStream(backupPath);
      
      await pipeline(source, gzip, output);
    } else {
      // Write uncompressed
      const { writeFileSync } = await import('node:fs');
      writeFileSync(backupPath, jsonData);
    }

    // Get file size
    const stats = statSync(backupPath);
    const sizeKB = (stats.size / 1024).toFixed(2);

    printSuccess(`Backup created successfully: ${basename(backupPath)}`);
    printInfo(`Size: ${sizeKB} KB`);
    printInfo(`Location: ${backupPath}`);

    return 0;
  } catch (error) {
    printError(`Failed to create backup: ${error.message}`);
    return 1;
  }
}

export default backupCommand;
