/**
 * Daemon entry point for jm2
 * Handles daemonization, PID management, and graceful shutdown
 */

import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getPidFile, ensureDataDir, getSocketPath } from '../utils/paths.js';
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
    scheduler = createScheduler({ logger, executor });
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
 * @returns {Promise<object|null>} Response message
 */
async function handleIpcMessage(message) {
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
      return handleJobRun(message);

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
        message: 'Job ID or name is required',
      };
    }
    
    const success = scheduler.removeJob(jobId);
    
    if (success) {
      logger?.info(`Job removed via IPC: ${jobId}`);
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
 * @returns {object} Response
 */
async function handleJobRun(message) {
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
    
    // For now, just return job info - actual execution will be implemented later
    logger?.info(`Manual job run requested via IPC: ${jobId}`);
    return createJobRunResponse({
      jobId,
      status: 'queued',
      message: 'Job queued for execution',
    });
  } catch (error) {
    logger?.error(`Failed to run job: ${error.message}`);
    return {
      type: MessageType.ERROR,
      message: `Failed to run job: ${error.message}`,
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
