/**
 * Job scheduler for jm2 daemon
 * Manages cron jobs and one-time job scheduling
 */

import { getNextRunTime, isValidCronExpression } from '../utils/cron.js';
import { JobStatus, JobType } from '../core/job.js';
import { getJobs, saveJobs } from '../core/storage.js';

/**
 * Scheduler class - manages job scheduling state and execution timing
 */
export class Scheduler {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.executor = options.executor || null;
    this.jobs = new Map(); // Map of job ID to scheduled job info
    this.running = false;
    this.checkInterval = null;
    this.checkIntervalMs = options.checkIntervalMs || 1000; // Check every second
    this.runningJobs = new Set(); // Track currently running job IDs
  }

  /**
   * Start the scheduler
   */
  start() {
    if (this.running) {
      return;
    }

    this.running = true;
    this.logger.info('Scheduler starting...');

    // Load jobs from storage
    this.loadJobs();

    // Start the check interval
    this.checkInterval = setInterval(() => {
      this.tick();
    }, this.checkIntervalMs);

    this.logger.info('Scheduler started');
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (!this.running) {
      return;
    }

    this.running = false;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    this.logger.info('Scheduler stopped');
  }

  /**
   * Load jobs from storage into memory
   */
  loadJobs() {
    const storedJobs = getJobs();
    this.jobs.clear();

    for (const job of storedJobs) {
      this.addJobToMemory(job);
    }

    // Handle expired one-time jobs that were missed while daemon was stopped
    this.handleExpiredOneTimeJobs();

    this.logger.debug(`Loaded ${this.jobs.size} jobs`);
  }

  /**
   * Handle expired one-time jobs on daemon restart
   * Jobs that are past their run time and still active should be marked as failed
   */
  handleExpiredOneTimeJobs() {
    const now = new Date();
    let expiredCount = 0;

    for (const [id, job] of this.jobs) {
      if (
        job.type === JobType.ONCE &&
        job.status === JobStatus.ACTIVE &&
        job.runAt
      ) {
        const runAt = new Date(job.runAt);
        if (runAt < now) {
          // Job was scheduled to run while daemon was stopped
          this.updateJobStatus(id, JobStatus.FAILED);
          this.updateJob(id, {
            lastResult: 'failed',
            error: 'Job expired - daemon was not running at scheduled time',
            expiredAt: now.toISOString(),
          });
          expiredCount++;
          this.logger.warn(
            `Job ${id} (${job.name || 'unnamed'}) expired - was scheduled for ${runAt.toISOString()}`
          );
        }
      }
    }

    if (expiredCount > 0) {
      this.logger.info(`Marked ${expiredCount} expired one-time job(s) as failed`);
    }
  }

  /**
   * Add a job to the in-memory map
   * @param {object} job - Job object
   */
  addJobToMemory(job) {
    // Calculate next run time for active jobs
    let nextRun = null;
    if (job.status === JobStatus.ACTIVE) {
      nextRun = this.calculateNextRun(job);
    }

    this.jobs.set(job.id, {
      ...job,
      nextRun,
    });

    // Update job in storage with next run time
    this.updateJobNextRun(job.id, nextRun);
  }

  /**
   * Calculate the next run time for a job
   * @param {object} job - Job object
   * @returns {Date|null} Next run time or null
   */
  calculateNextRun(job) {
    if (job.status !== JobStatus.ACTIVE) {
      return null;
    }

    if (job.type === JobType.CRON && job.cron) {
      return getNextRunTime(job.cron);
    }

    if (job.type === JobType.ONCE && job.runAt) {
      // Always return the runAt date for one-time jobs
      // This allows jobs that are already due to be processed
      return new Date(job.runAt);
    }

    return null;
  }

  /**
   * Get jobs that are due to run
   * @returns {Array} Array of jobs that should run now
   */
  getDueJobs() {
    const now = new Date();
    const dueJobs = [];

    for (const [id, job] of this.jobs) {
      if (job.status !== JobStatus.ACTIVE) {
        continue;
      }

      if (job.nextRun && job.nextRun <= now) {
        dueJobs.push({ ...job });
      }
    }

    return dueJobs;
  }

  /**
   * Execute a job using the executor
   * @param {object} job - Job to execute
   */
  async executeJob(job) {
    if (!this.executor) {
      this.logger.warn(`Cannot execute job ${job.id}: no executor configured`);
      return;
    }

    if (this.runningJobs.has(job.id)) {
      this.logger.warn(`Job ${job.id} is already running`);
      return;
    }

    this.runningJobs.add(job.id);
    this.logger.info(`Executing job ${job.id} (${job.name || 'unnamed'})`);

    try {
      const result = await this.executor.executeJobWithRetry(job);
      
      // Update job stats
      const updatedJob = this.jobs.get(job.id);
      if (updatedJob) {
        updatedJob.runCount = (updatedJob.runCount || 0) + 1;
        updatedJob.lastRun = new Date().toISOString();
        updatedJob.lastResult = result.status === 'success' ? 'success' : 'failed';
        this.persistJobs();
      }

      this.logger.info(`Job ${job.id} completed: ${result.status === 'success' ? 'success' : 'failed'}`);
    } catch (error) {
      this.logger.error(`Job ${job.id} failed: ${error.message}`);
      
      const updatedJob = this.jobs.get(job.id);
      if (updatedJob) {
        updatedJob.runCount = (updatedJob.runCount || 0) + 1;
        updatedJob.lastRun = new Date().toISOString();
        updatedJob.lastResult = 'failed';
        this.persistJobs();
      }
    } finally {
      this.runningJobs.delete(job.id);
    }
  }

  /**
   * Process due jobs - called on each tick
   * @returns {Array} Jobs that were processed
   */
  tick() {
    if (!this.running) {
      return [];
    }

    const dueJobs = this.getDueJobs();

    for (const job of dueJobs) {
      this.logger.debug(`Job ${job.id} (${job.name || 'unnamed'}) is due`);

      // Execute the job
      this.executeJob(job);

      // For one-time jobs, mark as completed after scheduling
      if (job.type === JobType.ONCE) {
        this.updateJobStatus(job.id, JobStatus.COMPLETED);
      } else {
        // For cron jobs, recalculate next run time
        const nextRun = this.calculateNextRun({ ...job, status: JobStatus.ACTIVE });
        this.updateJobNextRun(job.id, nextRun);
      }
    }

    return dueJobs;
  }

  /**
   * Add a new job
   * @param {object} jobData - Job data
   * @returns {object} Added job
   */
  addJob(jobData) {
    // Generate ID if not provided
    if (!jobData.id) {
      jobData.id = this.generateJobId();
    }

    // Determine job type
    if (!jobData.type) {
      if (jobData.cron) {
        jobData.type = JobType.CRON;
      } else if (jobData.runAt) {
        jobData.type = JobType.ONCE;
      }
    }

    // Calculate initial next run
    const nextRun = this.calculateNextRun(jobData);
    const job = { ...jobData, nextRun };

    // Add to memory
    this.jobs.set(job.id, job);

    // Save to storage
    this.persistJobs();

    this.logger.info(`Job ${job.id} (${job.name || 'unnamed'}) added`);

    return job;
  }

  /**
   * Remove a job
   * @param {number} jobId - Job ID
   * @returns {boolean} True if removed
   */
  removeJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) {
      return false;
    }

    this.jobs.delete(jobId);
    this.persistJobs();

    this.logger.info(`Job ${jobId} removed`);
    return true;
  }

  /**
   * Update a job
   * @param {number} jobId - Job ID
   * @param {object} updates - Updates to apply
   * @returns {object|null} Updated job or null
   */
  updateJob(jobId, updates) {
    const job = this.jobs.get(jobId);
    if (!job) {
      return null;
    }

    const updatedJob = {
      ...job,
      ...updates,
      id: jobId, // Don't allow changing ID
      updatedAt: new Date().toISOString(),
    };

    // Recalculate next run if needed
    updatedJob.nextRun = this.calculateNextRun(updatedJob);

    this.jobs.set(jobId, updatedJob);
    this.persistJobs();

    this.logger.info(`Job ${jobId} updated`);
    return updatedJob;
  }

  /**
   * Update job status
   * @param {number} jobId - Job ID
   * @param {string} status - New status
   * @returns {object|null} Updated job or null
   */
  updateJobStatus(jobId, status) {
    const updates = { status };

    if (status === JobStatus.ACTIVE) {
      // Recalculate next run when activating
      const job = this.jobs.get(jobId);
      if (job) {
        updates.nextRun = this.calculateNextRun({ ...job, status });
      }
    } else {
      updates.nextRun = null;
    }

    return this.updateJob(jobId, updates);
  }

  /**
   * Update job's next run time in storage
   * @param {number} jobId - Job ID
   * @param {Date|null} nextRun - Next run time
   */
  updateJobNextRun(jobId, nextRun) {
    const job = this.jobs.get(jobId);
    if (job) {
      job.nextRun = nextRun;
      job.nextRunISO = nextRun ? nextRun.toISOString() : null;
    }
    this.persistJobs();
  }

  /**
   * Get all jobs
   * @returns {Array} Array of all jobs
   */
  getAllJobs() {
    return Array.from(this.jobs.values());
  }

  /**
   * Get a job by ID
   * @param {number} jobId - Job ID
   * @returns {object|null} Job or null
   */
  getJob(jobId) {
    return this.jobs.get(jobId) || null;
  }

  /**
   * Generate a unique job ID
   * @returns {number} New job ID
   */
  generateJobId() {
    let maxId = 0;
    for (const id of this.jobs.keys()) {
      if (id > maxId) {
        maxId = id;
      }
    }
    return maxId + 1;
  }

  /**
   * Persist jobs to storage
   */
  persistJobs() {
    const jobsArray = Array.from(this.jobs.values()).map(job => ({
      ...job,
      nextRun: job.nextRun ? job.nextRun.toISOString() : null,
    }));
    saveJobs(jobsArray);
  }

  /**
   * Get scheduler statistics
   * @returns {object} Statistics object
   */
  getStats() {
    const jobs = this.getAllJobs();
    const activeJobs = jobs.filter(j => j.status === JobStatus.ACTIVE);
    const cronJobs = jobs.filter(j => j.type === JobType.CRON);
    const onceJobs = jobs.filter(j => j.type === JobType.ONCE);

    return {
      totalJobs: jobs.length,
      activeJobs: activeJobs.length,
      pausedJobs: jobs.filter(j => j.status === JobStatus.PAUSED).length,
      completedJobs: jobs.filter(j => j.status === JobStatus.COMPLETED).length,
      failedJobs: jobs.filter(j => j.status === JobStatus.FAILED).length,
      cronJobs: cronJobs.length,
      onceJobs: onceJobs.length,
      dueJobs: this.getDueJobs().length,
    };
  }
}

/**
 * Create a new scheduler instance
 * @param {object} options - Scheduler options
 * @returns {Scheduler} Scheduler instance
 */
export function createScheduler(options = {}) {
  return new Scheduler(options);
}

export default Scheduler;
