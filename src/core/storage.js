/**
 * Storage utilities for jm2
 * Provides JSON file persistence for jobs, config, and history
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { ensureDataDir, getJobsFile, getConfigFile, getHistoryFile } from '../utils/paths.js';

/**
 * Read a JSON file and parse its contents
 * @param {string} filePath - Path to the JSON file
 * @param {*} defaultValue - Default value if file doesn't exist
 * @returns {*} Parsed JSON content or default value
 */
export function readJsonFile(filePath, defaultValue = null) {
  try {
    if (!existsSync(filePath)) {
      return defaultValue;
    }
    const content = readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return defaultValue;
    }
    throw new Error(`Failed to read JSON file ${filePath}: ${error.message}`);
  }
}

/**
 * Write data to a JSON file
 * @param {string} filePath - Path to the JSON file
 * @param {*} data - Data to write
 * @param {boolean} pretty - Whether to pretty-print the JSON (default: true)
 */
export function writeJsonFile(filePath, data, pretty = true) {
  try {
    ensureDataDir();
    const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
    writeFileSync(filePath, content, 'utf8');
  } catch (error) {
    throw new Error(`Failed to write JSON file ${filePath}: ${error.message}`);
  }
}

/**
 * Jobs storage operations
 */

/**
 * Get all jobs from storage
 * @returns {Array} Array of job objects
 */
export function getJobs() {
  return readJsonFile(getJobsFile(), []);
}

/**
 * Save all jobs to storage
 * @param {Array} jobs - Array of job objects
 */
export function saveJobs(jobs) {
  writeJsonFile(getJobsFile(), jobs);
}

/**
 * Get a job by ID
 * @param {number} id - Job ID
 * @returns {object|null} Job object or null if not found
 */
export function getJobById(id) {
  const jobs = getJobs();
  return jobs.find(job => job.id === id) || null;
}

/**
 * Get a job by name
 * @param {string} name - Job name
 * @returns {object|null} Job object or null if not found
 */
export function getJobByName(name) {
  const jobs = getJobs();
  return jobs.find(job => job.name === name) || null;
}

/**
 * Get a job by ID or name
 * @param {string|number} identifier - Job ID or name
 * @returns {object|null} Job object or null if not found
 */
export function getJob(identifier) {
  const id = parseInt(identifier, 10);
  if (!isNaN(id)) {
    const job = getJobById(id);
    if (job) return job;
  }
  return getJobByName(String(identifier));
}

/**
 * Get the next available job ID
 * @returns {number} Next available ID
 */
export function getNextJobId() {
  const jobs = getJobs();
  if (jobs.length === 0) {
    return 1;
  }
  const maxId = Math.max(...jobs.map(job => job.id));
  return maxId + 1;
}

/**
 * Add a new job to storage
 * @param {object} job - Job object (without ID)
 * @returns {object} Job object with assigned ID
 */
export function addJob(job) {
  const jobs = getJobs();
  const newJob = {
    ...job,
    id: job.id || getNextJobId(),
    createdAt: job.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  jobs.push(newJob);
  saveJobs(jobs);
  return newJob;
}

/**
 * Update an existing job
 * @param {number} id - Job ID
 * @param {object} updates - Fields to update
 * @returns {object|null} Updated job or null if not found
 */
export function updateJob(id, updates) {
  const jobs = getJobs();
  const index = jobs.findIndex(job => job.id === id);
  if (index === -1) {
    return null;
  }
  jobs[index] = {
    ...jobs[index],
    ...updates,
    id, // Ensure ID cannot be changed
    updatedAt: new Date().toISOString(),
  };
  saveJobs(jobs);
  return jobs[index];
}

/**
 * Remove a job from storage
 * @param {number} id - Job ID
 * @returns {boolean} True if job was removed, false if not found
 */
export function removeJob(id) {
  const jobs = getJobs();
  const index = jobs.findIndex(job => job.id === id);
  if (index === -1) {
    return false;
  }
  jobs.splice(index, 1);
  saveJobs(jobs);
  return true;
}

/**
 * Check if a job name already exists
 * @param {string} name - Job name to check
 * @param {number} excludeId - Optional job ID to exclude from check (for updates)
 * @returns {boolean} True if name exists
 */
export function jobNameExists(name, excludeId = null) {
  const jobs = getJobs();
  return jobs.some(job => job.name === name && job.id !== excludeId);
}

/**
 * Generate a unique job name with auto-suffix
 * @param {string} baseName - Base name to use
 * @returns {string} Unique name (baseName, baseName-2, baseName-3, etc.)
 */
export function generateUniqueName(baseName) {
  if (!jobNameExists(baseName)) {
    return baseName;
  }
  let suffix = 2;
  while (jobNameExists(`${baseName}-${suffix}`)) {
    suffix++;
  }
  return `${baseName}-${suffix}`;
}

/**
 * Generate an auto job name (job-1, job-2, etc.)
 * @returns {string} Auto-generated job name
 */
export function generateAutoName() {
  return generateUniqueName('job-1').replace('job-1-', 'job-');
}

/**
 * Get jobs filtered by tag
 * @param {string} tag - Tag to filter by
 * @returns {Array} Array of jobs with the specified tag
 */
export function getJobsByTag(tag) {
  const jobs = getJobs();
  return jobs.filter(job => job.tags && job.tags.includes(tag));
}

/**
 * Get jobs filtered by status
 * @param {string} status - Status to filter by ('active', 'paused', 'completed')
 * @returns {Array} Array of jobs with the specified status
 */
export function getJobsByStatus(status) {
  const jobs = getJobs();
  return jobs.filter(job => job.status === status);
}

/**
 * History storage operations
 */

/**
 * Get execution history
 * @returns {Array} Array of history entries
 */
export function getHistory() {
  return readJsonFile(getHistoryFile(), []);
}

/**
 * Save execution history
 * @param {Array} history - Array of history entries
 */
export function saveHistory(history) {
  writeJsonFile(getHistoryFile(), history);
}

/**
 * Add a history entry
 * @param {object} entry - History entry
 * @returns {object} Added history entry with timestamp
 */
export function addHistoryEntry(entry) {
  const history = getHistory();
  const newEntry = {
    ...entry,
    timestamp: entry.timestamp || new Date().toISOString(),
  };
  history.push(newEntry);
  saveHistory(history);
  return newEntry;
}

/**
 * Get history for a specific job
 * @param {number} jobId - Job ID
 * @param {number} limit - Maximum number of entries to return
 * @returns {Array} Array of history entries for the job
 */
export function getJobHistory(jobId, limit = 10) {
  const history = getHistory();
  return history
    .filter(entry => entry.jobId === jobId)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);
}

/**
 * Clear history older than a certain date
 * @param {Date} beforeDate - Clear entries before this date
 * @returns {number} Number of entries removed
 */
export function clearHistoryBefore(beforeDate) {
  const history = getHistory();
  const cutoff = beforeDate.toISOString();
  const filtered = history.filter(entry => entry.timestamp >= cutoff);
  const removed = history.length - filtered.length;
  saveHistory(filtered);
  return removed;
}

/**
 * Clear all history
 * @returns {number} Number of entries removed
 */
export function clearAllHistory() {
  const history = getHistory();
  const count = history.length;
  saveHistory([]);
  return count;
}

export default {
  readJsonFile,
  writeJsonFile,
  getJobs,
  saveJobs,
  getJobById,
  getJobByName,
  getJob,
  getNextJobId,
  addJob,
  updateJob,
  removeJob,
  jobNameExists,
  generateUniqueName,
  generateAutoName,
  getJobsByTag,
  getJobsByStatus,
  getHistory,
  saveHistory,
  addHistoryEntry,
  getJobHistory,
  clearHistoryBefore,
  clearAllHistory,
};
