/**
 * Command executor for jm2 daemon
 * Handles job execution with process management, timeout, and logging
 */

import { spawn, exec } from 'node:child_process';
import { addHistoryEntry } from '../core/storage.js';
import { getJobLogFile, ensureLogsDir } from '../utils/paths.js';
import { createLogger } from '../core/logger.js';
import { parseDuration } from '../utils/duration.js';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/**
 * Execution result status
 */
export const ExecutionStatus = {
  SUCCESS: 'success',
  FAILED: 'failed',
  TIMEOUT: 'timeout',
  KILLED: 'killed',
};

/**
 * Default execution options
 */
const DEFAULT_OPTIONS = {
  shell: '/bin/sh',
  timeout: null, // No timeout by default
  cwd: null,
  env: null,
  captureOutput: true,
};

/**
 * Execute a job command
 * @param {object} job - Job object to execute
 * @param {object} options - Execution options
 * @returns {Promise<object>} Execution result
 */
export function executeJob(job, options = {}) {
  const execOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  return new Promise((resolve) => {
    const startTime = new Date();
    const startTimeISO = startTime.toISOString();
    const jobId = job.id;
    const jobName = job.name || `job-${jobId}`;

    // Setup logging
    const logFile = getJobLogFile(jobName);
    ensureLogsDir();
    const jobLogger = createLogger({ name: `job-${jobName}`, file: logFile });

    // Log execution start
    jobLogger.info(`Starting execution: ${job.command}`);
    jobLogger.info(`Working directory: ${job.cwd || process.cwd()}`);
    
    // Prepare spawn options
    const spawnOptions = {
      shell: job.shell || execOptions.shell,
      cwd: job.cwd || execOptions.cwd || process.cwd(),
      env: { ...process.env, ...(job.env || execOptions.env || {}) },
    };

    // Parse timeout
    let timeoutMs = null;
    if (job.timeout) {
      try {
        timeoutMs = parseDuration(job.timeout);
        jobLogger.info(`Timeout set: ${job.timeout} (${timeoutMs}ms)`);
      } catch (error) {
        jobLogger.warn(`Invalid timeout format: ${job.timeout}`);
      }
    } else if (execOptions.timeout) {
      timeoutMs = execOptions.timeout;
    }

    // Spawn the process with detached mode to create a new process group
    let childProcess;
    try {
      childProcess = spawn(job.command, [], { ...spawnOptions, detached: true });
    } catch (error) {
      const result = {
        status: ExecutionStatus.FAILED,
        exitCode: null,
        startTime: startTimeISO,
        endTime: new Date().toISOString(),
        duration: 0,
        error: error.message,
        stdout: '',
        stderr: '',
      };
      
      jobLogger.error(`Failed to spawn process: ${error.message}`);
      recordHistory(job, result);
      resolve(result);
      return;
    }

    let stdout = '';
    let stderr = '';
    let timeoutId = null;
    let timedOut = false;

    // Handle timeout
    if (timeoutMs && timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        jobLogger.warn(`Job timed out after ${timeoutMs}ms, killing process...`);
        
        // Kill the entire process group (negative PID)
        // This ensures child processes spawned by the shell are also killed
        try {
          process.kill(-childProcess.pid, 'SIGTERM');
        } catch (err) {
          // Fallback to single process kill if process group kill fails
          childProcess.kill('SIGTERM');
        }
        
        // Force kill after grace period
        setTimeout(() => {
          try {
            process.kill(-childProcess.pid, 'SIGKILL');
          } catch (err) {
            if (!childProcess.killed) {
              jobLogger.warn('Process did not terminate gracefully, forcing kill...');
              childProcess.kill('SIGKILL');
            }
          }
        }, 1000);
      }, timeoutMs);
    }

    // Capture stdout
    if (childProcess.stdout) {
      childProcess.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        jobLogger.info(`[stdout] ${chunk.trim()}`);
      });
    }

    // Capture stderr
    if (childProcess.stderr) {
      childProcess.stderr.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
        jobLogger.warn(`[stderr] ${chunk.trim()}`);
      });
    }

    // Handle process completion
    childProcess.on('close', (exitCode, signal) => {
      // Clear timeout if set
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      const endTime = new Date();
      const duration = endTime - startTime;

      // Determine execution status
      let status = ExecutionStatus.SUCCESS;
      let error = null;

      if (timedOut) {
        status = ExecutionStatus.TIMEOUT;
        error = `Job timed out after ${timeoutMs}ms`;
      } else if (signal) {
        status = ExecutionStatus.KILLED;
        error = `Job killed with signal ${signal}`;
      } else if (exitCode !== 0) {
        status = ExecutionStatus.FAILED;
        error = `Process exited with code ${exitCode}`;
      }

      const result = {
        status,
        exitCode: exitCode ?? null,
        signal: signal || null,
        startTime: startTimeISO,
        endTime: endTime.toISOString(),
        duration,
        stdout,
        stderr,
        error,
      };

      // Log completion
      if (status === ExecutionStatus.SUCCESS) {
        jobLogger.info(`Execution completed successfully in ${duration}ms`);
      } else {
        jobLogger.error(`Execution ${status}: ${error}`);
      }

      // Record history
      recordHistory(job, result);

      resolve(result);
    });

    // Handle spawn errors
    childProcess.on('error', (error) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      const endTime = new Date();
      const duration = endTime - startTime;

      const result = {
        status: ExecutionStatus.FAILED,
        exitCode: null,
        signal: null,
        startTime: startTimeISO,
        endTime: endTime.toISOString(),
        duration,
        stdout,
        stderr,
        error: error.message,
      };

      jobLogger.error(`Process error: ${error.message}`);
      recordHistory(job, result);

      resolve(result);
    });
  });
}

/**
 * Record execution history
 * @param {object} job - Job object
 * @param {object} result - Execution result
 */
function recordHistory(job, result) {
  try {
    addHistoryEntry({
      jobId: job.id,
      jobName: job.name,
      command: job.command,
      status: result.status,
      exitCode: result.exitCode,
      startTime: result.startTime,
      endTime: result.endTime,
      duration: result.duration,
      error: result.error,
    });
  } catch (error) {
    // Don't let history recording failures break execution
    console.error('Failed to record history:', error.message);
  }
}

/**
 * Execute a job with retry logic
 * @param {object} job - Job object to execute
 * @param {object} options - Execution options
 * @returns {Promise<object>} Final execution result
 */
export async function executeJobWithRetry(job, options = {}) {
  const maxRetries = job.retry || 0;
  const retryDelay = options.retryDelay || 1000; // Default 1 second delay between retries
  
  let lastResult = null;
  let attempt = 0;

  while (attempt <= maxRetries) {
    attempt++;
    
    // Update job retry count for tracking
    if (attempt > 1) {
      const logger = createLogger({ name: 'executor' });
      logger.info(`Retry attempt ${attempt - 1} of ${maxRetries} for job ${job.id}`);
    }

    lastResult = await executeJob(job, options);

    // If successful, return immediately
    if (lastResult.status === ExecutionStatus.SUCCESS) {
      return {
        ...lastResult,
        attempts: attempt,
      };
    }

    // If not the last attempt, wait before retrying
    if (attempt <= maxRetries) {
      await delay(retryDelay);
    }
  }

  // All retries exhausted
  return {
    ...lastResult,
    attempts: attempt,
  };
}

/**
 * Delay for a specified time
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Kill a running job process
 * @param {object} childProcess - Child process to kill
 * @param {number} gracePeriodMs - Grace period before force kill (default 5000ms)
 * @returns {Promise<boolean>} True if killed successfully
 */
export function killJob(childProcess, gracePeriodMs = 5000) {
  return new Promise((resolve) => {
    if (!childProcess || childProcess.killed) {
      resolve(true);
      return;
    }

    // Try graceful termination of the entire process group first
    try {
      process.kill(-childProcess.pid, 'SIGTERM');
    } catch (err) {
      childProcess.kill('SIGTERM');
    }

    // Force kill after grace period
    const forceKillTimeout = setTimeout(() => {
      try {
        process.kill(-childProcess.pid, 'SIGKILL');
      } catch (err) {
        if (!childProcess.killed) {
          childProcess.kill('SIGKILL');
        }
      }
    }, gracePeriodMs);

    childProcess.on('close', () => {
      clearTimeout(forceKillTimeout);
      resolve(true);
    });

    // Timeout if process doesn't close
    setTimeout(() => {
      try {
        process.kill(-childProcess.pid, 'SIGKILL');
      } catch (err) {
        if (!childProcess.killed) {
          childProcess.kill('SIGKILL');
        }
      }
      resolve(false);
    }, gracePeriodMs + 1000);
  });
}

/**
 * Format duration in human-readable format
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
export function formatDuration(ms) {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  if (ms < 3600000) {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m${seconds}s`;
  }
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return `${hours}h${minutes}m`;
}

/**
 * Create an executor instance
 * @param {object} options - Executor options
 * @param {object} options.logger - Logger instance
 * @returns {object} Executor instance with executeJob and executeJobWithRetry methods
 */
export function createExecutor(options = {}) {
  const { logger } = options;
  
  return {
    executeJob: (job, execOptions = {}) => executeJob(job, execOptions),
    executeJobWithRetry: (job, execOptions = {}) => executeJobWithRetry(job, execOptions),
  };
}

export default {
  executeJob,
  executeJobWithRetry,
  killJob,
  formatDuration,
  ExecutionStatus,
  createExecutor,
};