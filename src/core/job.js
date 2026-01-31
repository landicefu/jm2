/**
 * Job model and validation for jm2
 * Defines job structure and provides validation utilities
 */

import { parseDuration } from '../utils/duration.js';
import { validateCronExpression } from '../utils/cron.js';

/**
 * Job status constants
 */
export const JobStatus = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

/**
 * Job type constants
 */
export const JobType = {
  CRON: 'cron',      // Periodic job with cron expression
  ONCE: 'once',      // One-time job (--at or --in)
};

/**
 * Default job values
 */
export const JOB_DEFAULTS = {
  status: JobStatus.ACTIVE,
  tags: [],
  env: {},
  cwd: null,
  shell: null,
  timeout: null,
  retry: 0,
  retryCount: 0,
  lastRun: null,
  lastResult: null,
  nextRun: null,
  runCount: 0,
};

/**
 * Create a new job object with defaults
 * @param {object} data - Job data
 * @returns {object} Job object with defaults applied
 */
export function createJob(data) {
  const now = new Date().toISOString();
  
  return {
    ...JOB_DEFAULTS,
    ...data,
    createdAt: data.createdAt || now,
    updatedAt: now,
  };
}

/**
 * Validate a job object
 * @param {object} job - Job object to validate
 * @returns {object} Validation result { valid: boolean, errors: string[] }
 */
export function validateJob(job) {
  const errors = [];
  
  // Required fields
  if (!job.command || typeof job.command !== 'string' || job.command.trim() === '') {
    errors.push('command is required and must be a non-empty string');
  }
  
  // Must have either cron or runAt
  if (!job.cron && !job.runAt) {
    errors.push('Either cron expression or runAt datetime is required');
  }
  
  if (job.cron && job.runAt) {
    errors.push('Cannot specify both cron and runAt');
  }
  
  // Validate job type
  if (job.type && !Object.values(JobType).includes(job.type)) {
    errors.push(`Invalid job type: ${job.type}. Must be one of: ${Object.values(JobType).join(', ')}`);
  }
  
  // Validate status
  if (job.status && !Object.values(JobStatus).includes(job.status)) {
    errors.push(`Invalid job status: ${job.status}. Must be one of: ${Object.values(JobStatus).join(', ')}`);
  }
  
  // Validate name if provided
  if (job.name !== undefined && job.name !== null) {
    if (typeof job.name !== 'string') {
      errors.push('name must be a string');
    } else if (job.name.trim() === '') {
      errors.push('name cannot be empty');
    } else if (!/^[a-zA-Z0-9_-]+$/.test(job.name)) {
      errors.push('name can only contain letters, numbers, underscores, and hyphens');
    }
  }
  
  // Validate tags
  if (job.tags !== undefined) {
    if (!Array.isArray(job.tags)) {
      errors.push('tags must be an array');
    } else {
      for (const tag of job.tags) {
        if (typeof tag !== 'string' || tag.trim() === '') {
          errors.push('Each tag must be a non-empty string');
          break;
        }
      }
    }
  }
  
  // Validate env
  if (job.env !== undefined && job.env !== null) {
    if (typeof job.env !== 'object' || Array.isArray(job.env)) {
      errors.push('env must be an object');
    }
  }
  
  // Validate timeout
  if (job.timeout !== undefined && job.timeout !== null) {
    if (typeof job.timeout === 'string') {
      try {
        parseDuration(job.timeout);
      } catch {
        errors.push(`Invalid timeout format: ${job.timeout}`);
      }
    } else if (typeof job.timeout !== 'number' || job.timeout <= 0) {
      errors.push('timeout must be a positive number (milliseconds) or duration string');
    }
  }
  
  // Validate retry
  if (job.retry !== undefined && job.retry !== null) {
    if (typeof job.retry !== 'number' || job.retry < 0 || !Number.isInteger(job.retry)) {
      errors.push('retry must be a non-negative integer');
    }
  }
  
  // Validate cron expression using cron-parser
  if (job.cron) {
    if (typeof job.cron !== 'string') {
      errors.push('cron must be a string');
    } else {
      const validation = validateCronExpression(job.cron);
      if (!validation.valid) {
        errors.push(`Invalid cron expression: ${validation.error}`);
      }
    }
  }
  
  // Validate runAt
  if (job.runAt) {
    if (typeof job.runAt !== 'string') {
      errors.push('runAt must be a string (ISO 8601 datetime)');
    } else {
      const date = new Date(job.runAt);
      if (isNaN(date.getTime())) {
        errors.push('runAt must be a valid datetime');
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Normalize a job object (apply defaults and transformations)
 * @param {object} job - Job object to normalize
 * @returns {object} Normalized job object
 */
export function normalizeJob(job) {
  const normalized = { ...job };
  
  // Determine job type
  if (job.cron) {
    normalized.type = JobType.CRON;
  } else if (job.runAt) {
    normalized.type = JobType.ONCE;
  }
  
  // Normalize tags
  if (normalized.tags) {
    normalized.tags = normalized.tags.map(tag => tag.trim().toLowerCase());
    normalized.tags = [...new Set(normalized.tags)]; // Remove duplicates
  }
  
  // Normalize timeout to milliseconds
  if (normalized.timeout && typeof normalized.timeout === 'string') {
    normalized.timeout = parseDuration(normalized.timeout);
  }
  
  // Trim command
  if (normalized.command) {
    normalized.command = normalized.command.trim();
  }
  
  // Trim name
  if (normalized.name) {
    normalized.name = normalized.name.trim();
  }
  
  return normalized;
}

/**
 * Check if a job is a one-time job
 * @param {object} job - Job object
 * @returns {boolean} True if one-time job
 */
export function isOneTimeJob(job) {
  return job.type === JobType.ONCE || !!job.runAt;
}

/**
 * Check if a job is a periodic job
 * @param {object} job - Job object
 * @returns {boolean} True if periodic job
 */
export function isPeriodicJob(job) {
  return job.type === JobType.CRON || !!job.cron;
}

/**
 * Check if a job is active
 * @param {object} job - Job object
 * @returns {boolean} True if active
 */
export function isJobActive(job) {
  return job.status === JobStatus.ACTIVE;
}

/**
 * Check if a job is paused
 * @param {object} job - Job object
 * @returns {boolean} True if paused
 */
export function isJobPaused(job) {
  return job.status === JobStatus.PAUSED;
}

/**
 * Check if a job is completed
 * @param {object} job - Job object
 * @returns {boolean} True if completed
 */
export function isJobCompleted(job) {
  return job.status === JobStatus.COMPLETED;
}

/**
 * Check if a one-time job has expired (runAt is in the past)
 * @param {object} job - Job object
 * @returns {boolean} True if expired
 */
export function isJobExpired(job) {
  if (!isOneTimeJob(job) || !job.runAt) {
    return false;
  }
  return new Date(job.runAt) < new Date();
}

/**
 * Format job for display
 * @param {object} job - Job object
 * @returns {object} Formatted job object for display
 */
export function formatJobForDisplay(job) {
  return {
    id: job.id,
    name: job.name,
    command: job.command,
    type: job.type,
    schedule: job.cron || `at ${job.runAt}`,
    status: job.status,
    tags: job.tags?.join(', ') || '',
    nextRun: job.nextRun,
    lastRun: job.lastRun,
    runCount: job.runCount,
    createdAt: job.createdAt,
  };
}

/**
 * Create a job execution result object
 * @param {object} data - Result data
 * @returns {object} Execution result object
 */
export function createExecutionResult(data) {
  return {
    jobId: data.jobId,
    jobName: data.jobName,
    startTime: data.startTime || new Date().toISOString(),
    endTime: data.endTime,
    duration: data.duration,
    exitCode: data.exitCode,
    success: data.exitCode === 0,
    stdout: data.stdout || '',
    stderr: data.stderr || '',
    error: data.error || null,
    triggeredBy: data.triggeredBy || 'scheduled',
    attempt: data.attempt || 1,
  };
}

export default {
  JobStatus,
  JobType,
  JOB_DEFAULTS,
  createJob,
  validateJob,
  normalizeJob,
  isOneTimeJob,
  isPeriodicJob,
  isJobActive,
  isJobPaused,
  isJobCompleted,
  isJobExpired,
  formatJobForDisplay,
  createExecutionResult,
};
