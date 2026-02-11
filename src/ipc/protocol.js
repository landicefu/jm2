/**
 * IPC protocol definitions for JM2
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
  JOB_STREAM_OUTPUT: 'job:stream:output',

  // Tag management
  TAG_LIST: 'tag:list',
  TAG_LIST_RESULT: 'tag:list:result',
  TAG_ADD: 'tag:add',
  TAG_ADD_RESULT: 'tag:add:result',
  TAG_REMOVE: 'tag:remove',
  TAG_REMOVE_RESULT: 'tag:remove:result',
  TAG_CLEAR: 'tag:clear',
  TAG_CLEAR_RESULT: 'tag:clear:result',
  TAG_RENAME: 'tag:rename',
  TAG_RENAME_RESULT: 'tag:rename:result',

  // Flush/cleanup
  FLUSH: 'flush',
  FLUSH_RESULT: 'flush:result',

  // Import/reload
  RELOAD_JOBS: 'jobs:reload',
  RELOAD_JOBS_RESULT: 'jobs:reload:result',
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
 * Create a job stream output message
 * @param {string} stream - 'stdout' or 'stderr'
 * @param {string} data - Output data
 * @returns {{ type: string, stream: string, data: string }}
 */
export function createJobStreamOutput(stream, data) {
  return {
    type: MessageType.JOB_STREAM_OUTPUT,
    stream,
    data,
  };
}

/**
 * Create a flush result response
 * @param {object} result - Flush result with jobsRemoved, logsRemoved, historyRemoved
 * @returns {{ type: string, jobsRemoved: number, logsRemoved: number, historyRemoved: number }}
 */
export function createFlushResultResponse(result) {
  return {
    type: MessageType.FLUSH_RESULT,
    jobsRemoved: result.jobsRemoved || 0,
    logsRemoved: result.logsRemoved || 0,
    historyRemoved: result.historyRemoved || 0,
  };
}

/**
 * Create a tag list response
 * @param {object} tags - Tags grouped by name with job counts
 * @returns {{ type: string, tags: object }}
 */
export function createTagListResponse(tags) {
  return {
    type: MessageType.TAG_LIST_RESULT,
    tags,
  };
}

/**
 * Create a tag add response
 * @param {number} count - Number of jobs updated
 * @param {string[]} jobIds - IDs of jobs that were updated
 * @returns {{ type: string, count: number, jobIds: string[] }}
 */
export function createTagAddResponse(count, jobIds) {
  return {
    type: MessageType.TAG_ADD_RESULT,
    count,
    jobIds,
  };
}

/**
 * Create a tag remove response
 * @param {number} count - Number of jobs updated
 * @param {string[]} jobIds - IDs of jobs that were updated
 * @returns {{ type: string, count: number, jobIds: string[] }}
 */
export function createTagRemoveResponse(count, jobIds) {
  return {
    type: MessageType.TAG_REMOVE_RESULT,
    count,
    jobIds,
  };
}

/**
 * Create a tag clear response
 * @param {number} count - Number of jobs updated
 * @param {string[]} jobIds - IDs of jobs that were updated
 * @returns {{ type: string, count: number, jobIds: string[] }}
 */
export function createTagClearResponse(count, jobIds) {
  return {
    type: MessageType.TAG_CLEAR_RESULT,
    count,
    jobIds,
  };
}

/**
 * Create a tag rename response
 * @param {number} count - Number of jobs updated
 * @returns {{ type: string, count: number }}
 */
export function createTagRenameResponse(count) {
  return {
    type: MessageType.TAG_RENAME_RESULT,
    count,
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
  createJobStreamOutput,
  createFlushResultResponse,
  createTagListResponse,
  createTagAddResponse,
  createTagRemoveResponse,
  createTagClearResponse,
  createTagRenameResponse,
};
