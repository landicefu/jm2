/**
 * Daemon entry point for JM2
 * Handles daemonization, PID management, and graceful shutdown
 */

import { writeFileSync, unlinkSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getPidFile, ensureDataDir, getSocketPath, getLogsDir, getJobLogFile } from '../utils/paths.js';
import { getJobs, saveJobs, getHistory, saveHistory } from '../core/storage.js';
import { getConfig } from '../core/config.js';
import { createDaemonLogger } from '../core/logger.js';
import { startIpcServer, stopIpcServer } from '../ipc/server.js';
import { createScheduler } from './scheduler.js';
import { createExecutor } from './executor.js';
import { createJob, validateJob, normalizeJob, JobStatus } from '../core/job.js';
import {
  MessageType,
  createJobAddedResponse,
  createJobListResponse,
  createJobGetResponse,
  createJobRemovedResponse,
  createJobUpdatedResponse,
  createJobPausedResponse,
  createJobResumedResponse,
  createJobRunResponse,
  createJobStreamOutput,
  createFlushResultResponse,
  createTagListResponse,
  createTagAddResponse,
  createTagRemoveResponse,
  createTagClearResponse,
  createTagRenameResponse,
} from '../ipc/protocol.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let logger = null;
let ipcServer = null;
let scheduler = null;
let isShuttingDown = false;

/**
 * Write PID file
 * @returns {boolean} True if successful
 */
export function writePidFile() {
  try {
    ensureDataDir();
    writeFileSync(getPidFile(), process.pid.toString(), 'utf8');
    return true;
  } catch (error) {
    console.error(`Failed to write PID file: ${error.message}`);
    return false;
  }
}

/**
 * Remove PID file
 */
export function removePidFile() {
  try {
    if (existsSync(getPidFile())) {
      unlinkSync(getPidFile());
    }
  } catch (error) {
    logger?.error(`Failed to remove PID file: ${error.message}`);
  }
}

/**
 * Read PID from PID file
 * @returns {number|null} PID or null if not found
 */
export function readPidFile() {
  try {
    if (!existsSync(getPidFile())) {
      return null;
    }
    const pid = parseInt(readFileSync(getPidFile(), 'utf8'), 10);
    return isNaN(pid) ? null : pid;
  } catch (error) {
    return null;
  }
}

/**
 * Check if daemon is running
 * @returns {boolean} True if daemon is running
 */
export function isDaemonRunning() {
  const pid = readPidFile();
  if (!pid) {
    return false;
  }

  try {
    // Check if process exists (sends signal 0 - doesn't actually signal)
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // Process doesn't exist
    return false;
  }
}

/**
 * Get daemon status
 * @returns {{ running: boolean, pid: number|null }} Status object
 */
export function getDaemonStatus() {
  const pid = readPidFile();
  const running = pid !== null && isDaemonRunning();
  return { running, pid: running ? pid : null };
}

/**
 * Stop the daemon
 * @param {number} [signal=15] Signal to send (default: SIGTERM)
 * @returns {boolean} True if stop signal was sent
 */
export function stopDaemon(signal = 15) {
  const pid = readPidFile();
  if (!pid) {
    return false;
  }

  try {
    process.kill(pid, signal);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Handle shutdown signals
 */
function handleShutdown() {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  logger?.info('Shutting down daemon...');

  // Stop scheduler
  if (scheduler) {
    scheduler.stop();
    scheduler = null;
  }

  // Stop IPC server
  if (ipcServer) {
    stopIpcServer(ipcServer);
    ipcServer = null;
  }

  // Remove PID file
  removePidFile();

  logger?.info('Daemon stopped');
  process.exit(0);
}

/**
 * Start the daemon process
 * @param {object} options - Daemon options
 * @param {boolean} options.foreground - Run in foreground (don't daemonize)
 * @returns {Promise<void>}
 */
export async function startDaemon(options = {}) {
  const { foreground = false } = options;

  // Check if already running
  if (isDaemonRunning()) {
    const { pid } = getDaemonStatus();
    throw new Error(`Daemon is already running (PID: ${pid})`);
  }

  if (foreground) {
    // Run in foreground mode
    await runDaemon({ foreground: true });
  } else {
    // Daemonize - spawn detached process
    const scriptPath = join(__dirname, 'index.js');

    const child = spawn(process.execPath, [scriptPath, '--foreground'], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, JM2_DAEMONIZED: '1' },
    });

    child.unref();

    // Wait a moment to check if process started
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check if daemon started successfully
    if (!isDaemonRunning()) {
      throw new Error('Failed to start daemon');
    }

    console.log(`Daemon started (PID: ${readPidFile()})`);
  }
}

/**
 * Run the daemon (internal - called by startDaemon)
 * @param {object} options - Run options
 * @param {boolean} options.foreground - Run in foreground
 */
async function runDaemon(options = {}) {
  const { foreground = false } = options;

  // Write PID file
  if (!writePidFile()) {
    process.exit(1);
  }

  // Initialize logger
  logger = createDaemonLogger({ foreground });
  logger.info('Daemon starting...');

  // Setup shutdown handlers
  process.on('SIGTERM', handleShutdown);
  process.on('SIGINT', handleShutdown);
  process.on('exit', () => {
    removePidFile();
  });

  // Handle uncaught errors
  process.on('uncaughtException', error => {
    logger.error(`Uncaught exception: ${error.message}`);
    logger.error(error.stack);
    handleShutdown();
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error(`Unhandled rejection at: ${promise}, reason: ${reason}`);
  });

  // Create executor
  const executor = createExecutor({ logger });
  logger.info('Executor created');

  // Start scheduler
  try {
    const config = getConfig();
    scheduler = createScheduler({
      logger,
      executor,
      maxConcurrent: config.daemon?.maxConcurrent || 10,
    });
    scheduler.start();
    logger.info('Scheduler started');
  } catch (error) {
    logger.error(`Failed to start scheduler: ${error.message}`);
    handleShutdown();
    return;
  }

  // Start IPC server
  try {
    ipcServer = startIpcServer({
      onMessage: handleIpcMessage,
    });
    logger.info('IPC server started');
  } catch (error) {
    logger.error(`Failed to start IPC server: ${error.message}`);
    handleShutdown();
    return;
  }

  logger.info('Daemon ready');

  // Keep process alive
  if (foreground) {
    // In foreground mode, we can keep the event loop alive
    setInterval(() => {}, 1000);
  }
}

/**
 * Handle IPC messages
 * @param {object} message - Incoming message
 * @param {import('node:net').Socket} socket - Socket for streaming responses
 * @returns {Promise<object|null>} Response message
 */
async function handleIpcMessage(message, socket) {
  logger?.debug(`Received message: ${JSON.stringify(message)}`);

  switch (message.type) {
    case 'status':
      return {
        type: 'status',
        running: true,
        pid: process.pid,
        stats: scheduler ? scheduler.getStats() : null,
      };

    case 'stop':
      logger?.info('Stop requested via IPC');
      setTimeout(handleShutdown, 100);
      return {
        type: 'stopped',
        message: 'Daemon is stopping',
      };

    case MessageType.JOB_ADD:
      return handleJobAdd(message);

    case MessageType.JOB_LIST:
      return handleJobList(message);

    case MessageType.JOB_GET:
      return handleJobGet(message);

    case MessageType.JOB_REMOVE:
      return handleJobRemove(message);

    case MessageType.JOB_UPDATE:
      return handleJobUpdate(message);

    case MessageType.JOB_PAUSE:
      return handleJobPause(message);

    case MessageType.JOB_RESUME:
      return handleJobResume(message);

    case MessageType.JOB_RUN:
      return handleJobRun(message, socket);

    case MessageType.FLUSH:
      return handleFlush(message);

    case MessageType.RELOAD_JOBS:
      return handleReloadJobs(message);

    case MessageType.TAG_LIST:
      return handleTagList(message);

    case MessageType.TAG_ADD:
      return handleTagAdd(message);

    case MessageType.TAG_REMOVE:
      return handleTagRemove(message);

    case MessageType.TAG_CLEAR:
      return handleTagClear(message);

    case MessageType.TAG_RENAME:
      return handleTagRename(message);

    default:
      return {
        type: 'error',
        message: `Unknown message type: ${message.type}`,
      };
  }
}

/**
 * Handle job add message
 * @param {object} message - Message with jobData
 * @returns {object} Response
 */
function handleJobAdd(message) {
  try {
    const jobData = message.jobData;
    
    // Create job with defaults
    let job = createJob(jobData);
    
    // Validate job
    const validation = validateJob(job);
    if (!validation.valid) {
      return {
        type: MessageType.ERROR,
        message: `Invalid job: ${validation.errors.join(', ')}`,
      };
    }
    
    // Normalize job
    job = normalizeJob(job);
    
    // Add to scheduler
    const addedJob = scheduler.addJob(job);
    
    logger?.info(`Job added via IPC: ${addedJob.id} (${addedJob.name || 'unnamed'})`);
    return createJobAddedResponse(addedJob);
  } catch (error) {
    logger?.error(`Failed to add job: ${error.message}`);
    return {
      type: MessageType.ERROR,
      message: `Failed to add job: ${error.message}`,
    };
  }
}

/**
 * Handle job list message
 * @param {object} message - Message with optional filters
 * @returns {object} Response
 */
function handleJobList(message) {
  try {
    let jobs = scheduler.getAllJobs();
    
    // Apply filters if provided
    if (message.filters) {
      const { status, tag, type } = message.filters;
      
      if (status) {
        jobs = jobs.filter(j => j.status === status);
      }
      
      if (tag) {
        jobs = jobs.filter(j => j.tags && j.tags.includes(tag.toLowerCase()));
      }
      
      if (type) {
        jobs = jobs.filter(j => j.type === type);
      }
    }
    
    return createJobListResponse(jobs);
  } catch (error) {
    logger?.error(`Failed to list jobs: ${error.message}`);
    return {
      type: MessageType.ERROR,
      message: `Failed to list jobs: ${error.message}`,
    };
  }
}

/**
 * Handle job get message
 * @param {object} message - Message with jobId or jobName
 * @returns {object} Response
 */
function handleJobGet(message) {
  try {
    let job = null;
    
    if (message.jobId) {
      job = scheduler.getJob(message.jobId);
    } else if (message.jobName) {
      // Find by name
      const jobs = scheduler.getAllJobs();
      job = jobs.find(j => j.name === message.jobName) || null;
    }
    
    return createJobGetResponse(job);
  } catch (error) {
    logger?.error(`Failed to get job: ${error.message}`);
    return {
      type: MessageType.ERROR,
      message: `Failed to get job: ${error.message}`,
    };
  }
}

/**
 * Handle job remove message
 * @param {object} message - Message with jobId
 * @returns {object} Response
 */
function handleJobRemove(message) {
  try {
    let jobId = message.jobId;
    let jobName = null;
    
    // If name is provided instead of ID, look it up
    if (!jobId && message.jobName) {
      const jobs = scheduler.getAllJobs();
      const job = jobs.find(j => j.name === message.jobName);
      if (job) {
        jobId = job.id;
        jobName = job.name;
      }
    } else if (jobId) {
      // Get job name for log file deletion
      const job = scheduler.getJob(jobId);
      if (job) {
        jobName = job.name;
      }
    }
    
    if (!jobId) {
      return {
        type: MessageType.ERROR,
        message: 'Job ID or name is required',
      };
    }
    
    const success = scheduler.removeJob(jobId);
    
    if (success) {
      logger?.info(`Job removed via IPC: ${jobId}`);
      
      // Delete the job's log file
      const logFile = getJobLogFile(jobName || `job-${jobId}`);
      if (existsSync(logFile)) {
        try {
          unlinkSync(logFile);
          logger?.info(`Deleted log file: ${logFile}`);
        } catch (err) {
          logger?.warn(`Failed to delete log file: ${logFile} - ${err.message}`);
        }
      }
    }
    
    return createJobRemovedResponse(success);
  } catch (error) {
    logger?.error(`Failed to remove job: ${error.message}`);
    return {
      type: MessageType.ERROR,
      message: `Failed to remove job: ${error.message}`,
    };
  }
}

/**
 * Handle job update message
 * @param {object} message - Message with jobId and updates
 * @returns {object} Response
 */
function handleJobUpdate(message) {
  try {
    let jobId = message.jobId;
    
    // If name is provided instead of ID, look it up
    if (!jobId && message.jobName) {
      const jobs = scheduler.getAllJobs();
      const job = jobs.find(j => j.name === message.jobName);
      if (job) {
        jobId = job.id;
      }
    }
    
    if (!jobId) {
      return {
        type: MessageType.ERROR,
        message: 'Job not found',
      };
    }
    
    const updatedJob = scheduler.updateJob(jobId, message.updates);
    
    if (updatedJob) {
      logger?.info(`Job updated via IPC: ${jobId}`);
    }
    
    return createJobUpdatedResponse(updatedJob);
  } catch (error) {
    logger?.error(`Failed to update job: ${error.message}`);
    return {
      type: MessageType.ERROR,
      message: `Failed to update job: ${error.message}`,
    };
  }
}

/**
 * Handle job pause message
 * @param {object} message - Message with jobId
 * @returns {object} Response
 */
function handleJobPause(message) {
  try {
    let jobId = message.jobId;
    
    // If name is provided instead of ID, look it up
    if (!jobId && message.jobName) {
      const jobs = scheduler.getAllJobs();
      const job = jobs.find(j => j.name === message.jobName);
      if (job) {
        jobId = job.id;
      }
    }
    
    if (!jobId) {
      return {
        type: MessageType.ERROR,
        message: 'Job not found',
      };
    }
    
    const pausedJob = scheduler.updateJobStatus(jobId, JobStatus.PAUSED);
    
    if (pausedJob) {
      logger?.info(`Job paused via IPC: ${jobId}`);
    }
    
    return createJobPausedResponse(pausedJob);
  } catch (error) {
    logger?.error(`Failed to pause job: ${error.message}`);
    return {
      type: MessageType.ERROR,
      message: `Failed to pause job: ${error.message}`,
    };
  }
}

/**
 * Handle job resume message
 * @param {object} message - Message with jobId
 * @returns {object} Response
 */
function handleJobResume(message) {
  try {
    let jobId = message.jobId;
    
    // If name is provided instead of ID, look it up
    if (!jobId && message.jobName) {
      const jobs = scheduler.getAllJobs();
      const job = jobs.find(j => j.name === message.jobName);
      if (job) {
        jobId = job.id;
      }
    }
    
    if (!jobId) {
      return {
        type: MessageType.ERROR,
        message: 'Job not found',
      };
    }
    
    const resumedJob = scheduler.updateJobStatus(jobId, JobStatus.ACTIVE);
    
    if (resumedJob) {
      logger?.info(`Job resumed via IPC: ${jobId}`);
    }
    
    return createJobResumedResponse(resumedJob);
  } catch (error) {
    logger?.error(`Failed to resume job: ${error.message}`);
    return {
      type: MessageType.ERROR,
      message: `Failed to resume job: ${error.message}`,
    };
  }
}

/**
 * Handle job run message (manual execution)
 * @param {object} message - Message with jobId
 * @param {import('node:net').Socket} socket - Socket for streaming output
 * @returns {object} Response
 */
async function handleJobRun(message, socket) {
  try {
    let jobId = message.jobId;

    // If name is provided instead of ID, look it up
    if (!jobId && message.jobName) {
      const jobs = scheduler.getAllJobs();
      const job = jobs.find(j => j.name === message.jobName);
      if (job) {
        jobId = job.id;
      }
    }

    if (!jobId) {
      return {
        type: MessageType.ERROR,
        message: 'Job not found',
      };
    }

    const job = scheduler.getJob(jobId);
    if (!job) {
      return {
        type: MessageType.ERROR,
        message: 'Job not found',
      };
    }

    logger?.info(`Manual job run requested via IPC: ${jobId}`);

    // Execute the job
    if (message.wait) {
      // Stream function to send output chunks
      const streamOutput = (stream, data) => {
        if (socket && !socket.destroyed) {
          try {
            socket.write(JSON.stringify(createJobStreamOutput(stream, data)) + '\n');
          } catch (err) {
            // Ignore socket write errors
          }
        }
      };

      // Wait for execution with streaming and return results
      const result = await executeJobAndReturnResult(job, streamOutput);
      return createJobRunResponse({
        jobId,
        status: result.status,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        duration: result.duration,
        error: result.error,
      });
    } else {
      // Execute asynchronously (don't wait)
      scheduler.executeJob(job);
      return createJobRunResponse({
        jobId,
        status: 'queued',
        message: 'Job queued for execution',
      });
    }
  } catch (error) {
    logger?.error(`Failed to run job: ${error.message}`);
    return {
      type: MessageType.ERROR,
      message: `Failed to run job: ${error.message}`,
    };
  }
}

/**
 * Execute a job and return the result
 * @param {object} job - Job to execute
 * @param {Function} onStream - Callback for streaming output (stream, data) => void
 * @returns {Promise<object>} Execution result
 */
async function executeJobAndReturnResult(job, onStream) {
  if (!scheduler.executor) {
    return {
      status: 'failed',
      error: 'No executor configured',
    };
  }

  try {
    const result = await scheduler.executor.executeJobWithRetry(job, { onStream });

    // Update job stats
    const updatedJob = scheduler.getJob(job.id);
    if (updatedJob) {
      updatedJob.runCount = (updatedJob.runCount || 0) + 1;
      updatedJob.lastRun = new Date().toISOString();
      updatedJob.lastResult = result.status === 'success' ? 'success' : 'failed';
      scheduler.persistJobs();
    }

    logger?.info(`Job ${job.id} completed: ${result.status}`);
    return result;
  } catch (error) {
    logger?.error(`Job ${job.id} failed: ${error.message}`);

    // Update job stats
    const updatedJob = scheduler.getJob(job.id);
    if (updatedJob) {
      updatedJob.runCount = (updatedJob.runCount || 0) + 1;
      updatedJob.lastRun = new Date().toISOString();
      updatedJob.lastResult = 'failed';
      scheduler.persistJobs();
    }

    return {
      status: 'failed',
      error: error.message,
    };
  }
}

/**
 * Handle flush message
 * @param {object} message - Flush request with options
 * @returns {object} Response with flush results
 */
function handleFlush(message) {
  try {
    const result = {
      jobsRemoved: 0,
      logsRemoved: 0,
      historyRemoved: 0,
    };

    // Flush completed one-time jobs
    if (message.jobs !== false) {
      const jobs = getJobs();
      const initialCount = jobs.length;
      const filteredJobs = jobs.filter(job => {
        // Keep non-completed jobs, keep cron jobs even if completed
        if (job.type !== 'once') {
          return true;
        }
        return job.status !== 'completed';
      });
      result.jobsRemoved = initialCount - filteredJobs.length;
      if (result.jobsRemoved > 0) {
        saveJobs(filteredJobs);
        // Reload jobs into scheduler to sync in-memory state with storage
        scheduler.loadJobs();
        logger?.info(`Flushed ${result.jobsRemoved} completed one-time jobs`);
      }
    }

    // Flush old logs
    if (message.logs) {
      const logsDir = getLogsDir();
      if (existsSync(logsDir)) {
        const files = readdirSync(logsDir);
        const now = Date.now();
        const ageMs = message.logsAgeMs || 0; // 0 means all logs

        for (const file of files) {
          if (file.endsWith('.log')) {
            const filePath = `${logsDir}/${file}`;
            const stats = statSync(filePath);
            const fileAge = now - stats.mtime.getTime();

            if (ageMs === 0 || fileAge > ageMs) {
              unlinkSync(filePath);
              result.logsRemoved++;
            }
          }
        }
        if (result.logsRemoved > 0) {
          logger?.info(`Flushed ${result.logsRemoved} log files`);
        }
      }
    }

    // Flush old history
    if (message.history) {
      const history = getHistory();
      const initialCount = history.length;

      if (message.historyAgeMs && message.historyAgeMs > 0) {
        // Remove entries older than specified age
        const cutoff = new Date(Date.now() - message.historyAgeMs).toISOString();
        const filtered = history.filter(entry => entry.timestamp >= cutoff);
        result.historyRemoved = initialCount - filtered.length;
        if (result.historyRemoved > 0) {
          saveHistory(filtered);
        }
      } else {
        // Remove all history
        result.historyRemoved = initialCount;
        if (result.historyRemoved > 0) {
          saveHistory([]);
        }
      }
      if (result.historyRemoved > 0) {
        logger?.info(`Flushed ${result.historyRemoved} history entries`);
      }
    }

    return createFlushResultResponse(result);
  } catch (error) {
    logger?.error(`Failed to flush: ${error.message}`);
    return {
      type: MessageType.ERROR,
      message: `Failed to flush: ${error.message}`,
    };
  }
}

/**
 * Handle tag list message
 * Returns all tags grouped with their jobs
 * @returns {object} Response
 */
function handleTagList() {
  try {
    const jobs = scheduler.getAllJobs();
    const tags = {};

    // Group jobs by tag
    for (const job of jobs) {
      const jobTags = job.tags || [];
      
      if (jobTags.length === 0) {
        // Jobs with no tags
        if (!tags['(no tag)']) {
          tags['(no tag)'] = { jobs: [] };
        }
        tags['(no tag)'].jobs.push(job);
      } else {
        // Jobs with tags (can be in multiple groups)
        for (const tag of jobTags) {
          if (!tags[tag]) {
            tags[tag] = { jobs: [] };
          }
          tags[tag].jobs.push(job);
        }
      }
    }

    return createTagListResponse(tags);
  } catch (error) {
    logger?.error(`Failed to list tags: ${error.message}`);
    return {
      type: MessageType.ERROR,
      message: `Failed to list tags: ${error.message}`,
    };
  }
}

/**
 * Handle tag add message
 * Adds a tag to specified jobs
 * @param {object} message - Message with tag and jobRefs
 * @returns {object} Response
 */
function handleTagAdd(message) {
  try {
    const { tag, jobRefs } = message;
    const normalizedTag = tag.trim().toLowerCase();
    
    const jobs = scheduler.getAllJobs();
    const updatedJobIds = [];

    for (const jobRef of jobRefs) {
      // Find job by ID or name
      let job = null;
      const jobId = parseInt(jobRef, 10);
      
      if (!isNaN(jobId)) {
        job = jobs.find(j => j.id === jobId);
      }
      if (!job) {
        job = jobs.find(j => j.name === jobRef);
      }

      if (job) {
        const currentTags = job.tags || [];
        if (!currentTags.includes(normalizedTag)) {
          const newTags = [...currentTags, normalizedTag];
          scheduler.updateJob(job.id, { tags: newTags });
          updatedJobIds.push(job.id);
        }
      }
    }

    if (updatedJobIds.length > 0) {
      logger?.info(`Added tag "${normalizedTag}" to ${updatedJobIds.length} jobs`);
    }

    return createTagAddResponse(updatedJobIds.length, updatedJobIds);
  } catch (error) {
    logger?.error(`Failed to add tag: ${error.message}`);
    return {
      type: MessageType.ERROR,
      message: `Failed to add tag: ${error.message}`,
    };
  }
}

/**
 * Handle tag remove message
 * Removes a tag from specified jobs or all jobs
 * @param {object} message - Message with tag, jobRefs, and all flag
 * @returns {object} Response
 */
function handleTagRemove(message) {
  try {
    const { tag, jobRefs, all } = message;
    const normalizedTag = tag.trim().toLowerCase();
    
    const jobs = scheduler.getAllJobs();
    const updatedJobIds = [];

    // Determine which jobs to process
    const jobsToProcess = all
      ? jobs
      : jobRefs.map(ref => {
          const jobId = parseInt(ref, 10);
          if (!isNaN(jobId)) {
            return jobs.find(j => j.id === jobId) || jobs.find(j => j.name === ref);
          }
          return jobs.find(j => j.name === ref);
        }).filter(Boolean);

    for (const job of jobsToProcess) {
      const currentTags = job.tags || [];
      if (currentTags.includes(normalizedTag)) {
        const newTags = currentTags.filter(t => t !== normalizedTag);
        scheduler.updateJob(job.id, { tags: newTags });
        updatedJobIds.push(job.id);
      }
    }

    if (updatedJobIds.length > 0) {
      logger?.info(`Removed tag "${normalizedTag}" from ${updatedJobIds.length} jobs`);
    }

    return createTagRemoveResponse(updatedJobIds.length, updatedJobIds);
  } catch (error) {
    logger?.error(`Failed to remove tag: ${error.message}`);
    return {
      type: MessageType.ERROR,
      message: `Failed to remove tag: ${error.message}`,
    };
  }
}

/**
 * Handle tag clear message
 * Clears all tags from specified jobs or all jobs
 * @param {object} message - Message with jobRefs and all flag
 * @returns {object} Response
 */
function handleTagClear(message) {
  try {
    const { jobRefs, all } = message;
    
    const jobs = scheduler.getAllJobs();
    const updatedJobIds = [];

    // Determine which jobs to process
    const jobsToProcess = all
      ? jobs
      : (jobRefs || []).map(ref => {
          const jobId = parseInt(ref, 10);
          if (!isNaN(jobId)) {
            return jobs.find(j => j.id === jobId) || jobs.find(j => j.name === ref);
          }
          return jobs.find(j => j.name === ref);
        }).filter(Boolean);

    for (const job of jobsToProcess) {
      const currentTags = job.tags || [];
      if (currentTags.length > 0) {
        scheduler.updateJob(job.id, { tags: [] });
        updatedJobIds.push(job.id);
      }
    }

    if (updatedJobIds.length > 0) {
      logger?.info(`Cleared all tags from ${updatedJobIds.length} jobs`);
    }

    return createTagClearResponse(updatedJobIds.length, updatedJobIds);
  } catch (error) {
    logger?.error(`Failed to clear tags: ${error.message}`);
    return {
      type: MessageType.ERROR,
      message: `Failed to clear tags: ${error.message}`,
    };
  }
}

/**
 * Handle tag rename message
 * Renames a tag across all jobs
 * @param {object} message - Message with oldTag and newTag
 * @returns {object} Response
 */
function handleTagRename(message) {
  try {
    const { oldTag, newTag } = message;
    const normalizedOldTag = oldTag.trim().toLowerCase();
    const normalizedNewTag = newTag.trim().toLowerCase();
    
    const jobs = scheduler.getAllJobs();
    let updatedCount = 0;

    for (const job of jobs) {
      const currentTags = job.tags || [];
      if (currentTags.includes(normalizedOldTag)) {
        const newTags = currentTags.map(t => t === normalizedOldTag ? normalizedNewTag : t);
        // Remove duplicates that might result from rename
        const uniqueTags = [...new Set(newTags)];
        scheduler.updateJob(job.id, { tags: uniqueTags });
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      logger?.info(`Renamed tag "${normalizedOldTag}" to "${normalizedNewTag}" in ${updatedCount} jobs`);
    }

    return createTagRenameResponse(updatedCount);
  } catch (error) {
    logger?.error(`Failed to rename tag: ${error.message}`);
    return {
      type: MessageType.ERROR,
      message: `Failed to rename tag: ${error.message}`,
    };
  }
}

/**
 * Handle reload jobs message
 * Reloads jobs from storage into scheduler
 * @returns {object} Response
 */
function handleReloadJobs() {
  try {
    scheduler.loadJobs();
    const jobCount = scheduler.getAllJobs().length;
    logger?.info(`Reloaded ${jobCount} jobs from storage`);
    return {
      type: MessageType.RELOAD_JOBS_RESULT,
      count: jobCount,
    };
  } catch (error) {
    logger?.error(`Failed to reload jobs: ${error.message}`);
    return {
      type: MessageType.ERROR,
      message: `Failed to reload jobs: ${error.message}`,
    };
  }
}

// If this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  // Check for foreground flag
  const foreground = process.argv.includes('--foreground');

  runDaemon({ foreground }).catch(error => {
    console.error(`Daemon error: ${error.message}`);
    process.exit(1);
  });
}

export default {
  startDaemon,
  stopDaemon,
  isDaemonRunning,
  getDaemonStatus,
  writePidFile,
  removePidFile,
  readPidFile,
};
