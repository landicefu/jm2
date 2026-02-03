/**
 * Test for flush command syncing with scheduler
 * Verifies that flushed jobs are removed from both storage and scheduler memory
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createScheduler } from '../../src/daemon/scheduler.js';
import { saveJobs, getJobs } from '../../src/core/storage.js';
import { JobStatus, JobType } from '../../src/core/job.js';
import { unlinkSync, existsSync } from 'node:fs';
import { getJobsFile } from '../../src/utils/paths.js';

describe('Flush command scheduler sync', () => {
  let scheduler;
  const testJobsFile = getJobsFile();

  beforeEach(() => {
    // Clean up any existing jobs file
    if (existsSync(testJobsFile)) {
      unlinkSync(testJobsFile);
    }

    // Create a fresh scheduler
    scheduler = createScheduler({
      logger: {
        info: () => {},
        debug: () => {},
        warn: () => {},
        error: () => {},
      },
    });
  });

  afterEach(() => {
    if (scheduler) {
      scheduler.stop();
    }
    // Clean up test jobs file
    if (existsSync(testJobsFile)) {
      unlinkSync(testJobsFile);
    }
  });

  it('should sync scheduler memory after flushing completed one-time jobs', () => {
    // Add some jobs to storage
    const jobs = [
      {
        id: 1,
        name: 'completed-job',
        command: 'echo "done"',
        type: JobType.ONCE,
        status: JobStatus.COMPLETED,
        runAt: new Date(Date.now() - 1000).toISOString(),
      },
      {
        id: 2,
        name: 'active-job',
        command: 'echo "active"',
        type: JobType.ONCE,
        status: JobStatus.ACTIVE,
        runAt: new Date(Date.now() + 10000).toISOString(),
      },
      {
        id: 3,
        name: 'cron-job',
        command: 'echo "cron"',
        type: JobType.CRON,
        status: JobStatus.COMPLETED,
        cron: '* * * * *',
      },
    ];

    saveJobs(jobs);

    // Load jobs into scheduler
    scheduler.loadJobs();

    // Verify all jobs are loaded
    expect(scheduler.getAllJobs()).toHaveLength(3);
    expect(scheduler.getJob(1)).toBeTruthy();
    expect(scheduler.getJob(2)).toBeTruthy();
    expect(scheduler.getJob(3)).toBeTruthy();

    // Simulate flush operation (remove completed one-time jobs from storage)
    const storedJobs = getJobs();
    const filteredJobs = storedJobs.filter(job => {
      if (job.type !== JobType.ONCE) {
        return true;
      }
      return job.status !== JobStatus.COMPLETED;
    });
    saveJobs(filteredJobs);

    // Reload jobs into scheduler (this is what the fix does)
    scheduler.loadJobs();

    // Verify that completed one-time job is removed from scheduler memory
    const remainingJobs = scheduler.getAllJobs();
    expect(remainingJobs).toHaveLength(2);
    expect(scheduler.getJob(1)).toBeNull(); // Completed one-time job should be gone
    expect(scheduler.getJob(2)).toBeTruthy(); // Active one-time job should remain
    expect(scheduler.getJob(3)).toBeTruthy(); // Cron job should remain (even if completed)

    // Verify storage matches scheduler
    const storedJobsAfter = getJobs();
    expect(storedJobsAfter).toHaveLength(2);
    expect(storedJobsAfter.find(j => j.id === 1)).toBeUndefined();
    expect(storedJobsAfter.find(j => j.id === 2)).toBeDefined();
    expect(storedJobsAfter.find(j => j.id === 3)).toBeDefined();
  });

  it('should handle flush when no jobs need to be removed', () => {
    // Add only active jobs
    const jobs = [
      {
        id: 1,
        name: 'active-job',
        command: 'echo "active"',
        type: JobType.ONCE,
        status: JobStatus.ACTIVE,
        runAt: new Date(Date.now() + 10000).toISOString(),
      },
    ];

    saveJobs(jobs);
    scheduler.loadJobs();

    expect(scheduler.getAllJobs()).toHaveLength(1);

    // Simulate flush (no jobs to remove)
    const storedJobs = getJobs();
    const filteredJobs = storedJobs.filter(job => {
      if (job.type !== JobType.ONCE) {
        return true;
      }
      return job.status !== JobStatus.COMPLETED;
    });
    saveJobs(filteredJobs);
    scheduler.loadJobs();

    // Verify job still exists
    expect(scheduler.getAllJobs()).toHaveLength(1);
    expect(scheduler.getJob(1)).toBeTruthy();
  });
});
