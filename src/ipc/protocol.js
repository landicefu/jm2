/**
 * IPC protocol definitions for jm2
 */

export const MessageType = {
  // Basic
  PING: 'ping',
  PONG: 'pong',
  ERROR: 'error',
  
  // Job management
  JOB_ADD: 'job:add',
  JOB_ADDED: 'job:added',
  JOB_LIST: 'job:list',
  JOB_LIST_RESULT: 'job:list:result',
  JOB_GET: 'job:get',
  JOB_GET_RESULT: 'job:get:result',
  JOB_REMOVE: 'job:remove',
  JOB_REMOVED: 'job:removed',
  JOB_UPDATE: 'job:update',
  JOB_UPDATED: 'job:updated',
  JOB_PAUSE: 'job:pause',
  JOB_PAUSED: 'job:paused',
  JOB_RESUME: 'job:resume',
  JOB_RESUMED: 'job:resumed',
  JOB_RUN: 'job:run',
  JOB_RUN_RESULT: 'job:run:result',
};

/**
 * Create a job add response
 * @param {object} job - Added job
 * @returns {{ type: string, job: object }}
 */
export function createJobAddedResponse(job) {
  return {
    type: MessageType.JOB_ADDED,
    job,
  };
}

/**
 * Create a job list response
 * @param {Array} jobs - List of jobs
 * @returns {{ type: string, jobs: Array }}
 */
export function createJobListResponse(jobs) {
  return {
    type: MessageType.JOB_LIST_RESULT,
    jobs,
  };
}

/**
 * Create a job get response
 * @param {object|null} job - Job or null if not found
 * @returns {{ type: string, job: object|null }}
 */
export function createJobGetResponse(job) {
  return {
    type: MessageType.JOB_GET_RESULT,
    job,
  };
}

/**
 * Create a job removed response
 * @param {boolean} success - Whether removal was successful
 * @returns {{ type: string, success: boolean }}
 */
export function createJobRemovedResponse(success) {
  return {
    type: MessageType.JOB_REMOVED,
    success,
  };
}

/**
 * Create a job updated response
 * @param {object|null} job - Updated job or null if not found
 * @returns {{ type: string, job: object|null }}
 */
export function createJobUpdatedResponse(job) {
  return {
    type: MessageType.JOB_UPDATED,
    job,
  };
}

/**
 * Create a job paused response
 * @param {object|null} job - Paused job or null if not found
 * @returns {{ type: string, job: object|null }}
 */
export function createJobPausedResponse(job) {
  return {
    type: MessageType.JOB_PAUSED,
    job,
  };
}

/**
 * Create a job resumed response
 * @param {object|null} job - Resumed job or null if not found
 * @returns {{ type: string, job: object|null }}
 */
export function createJobResumedResponse(job) {
  return {
    type: MessageType.JOB_RESUMED,
    job,
  };
}

/**
 * Create a job run response
 * @param {object} result - Run result
 * @returns {{ type: string, result: object }}
 */
export function createJobRunResponse(result) {
  return {
    type: MessageType.JOB_RUN_RESULT,
    result,
  };
}

/**
 * Create a standard error response
 * @param {string} message - Error message
 * @returns {{ type: string, message: string }}
 */
export function createErrorResponse(message) {
  return {
    type: MessageType.ERROR,
    message,
  };
}

/**
 * Create a pong response
 * @returns {{ type: string }}
 */
export function createPongResponse() {
  return {
    type: MessageType.PONG,
  };
}

export default {
  MessageType,
  createErrorResponse,
  createPongResponse,
  createJobAddedResponse,
  createJobListResponse,
  createJobGetResponse,
  createJobRemovedResponse,
  createJobUpdatedResponse,
  createJobPausedResponse,
  createJobResumedResponse,
  createJobRunResponse,
};
