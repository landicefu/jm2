/**
 * Unit tests for the job scheduler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Scheduler, createScheduler } from '../../src/daemon/scheduler.js';
import { JobStatus, JobType } from '../../src/core/job.js';
import * as storage from '../../src/core/storage.js';

// Mock storage module
vi.mock('../../src/core/storage.js', () => ({
  getJobs: vi.fn(),
  saveJobs: vi.fn(),
  getJobById: vi.fn(),
  getJobByName: vi.fn(),
  getJob: vi.fn(),
}));

describe('Scheduler', () => {
  let scheduler;
  let mockLogger;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    };
    storage.getJobs.mockReturnValue([]);
    scheduler = new Scheduler({ logger: mockLogger, checkIntervalMs: 100 });
  });

  afterEach(() => {
    if (scheduler) {
      scheduler.stop();
    }
  });

  describe('constructor', () => {
    it('should create a scheduler with default options', () => {
      const s = new Scheduler();
      expect(s.jobs).toBeInstanceOf(Map);
      expect(s.running).toBe(false);
      expect(s.checkIntervalMs).toBe(1000);
    });

    it('should create a scheduler with custom options', () => {
      const s = new Scheduler({ logger: mockLogger, checkIntervalMs: 500 });
      expect(s.logger).toBe(mockLogger);
      expect(s.checkIntervalMs).toBe(500);
    });
  });

  describe('start/stop', () => {
    it('should start the scheduler', () => {
      scheduler.start();
      expect(scheduler.running).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Scheduler starting...');
      expect(mockLogger.info).toHaveBeenCalledWith('Scheduler started');
    });

    it('should not start if already running', () => {
      scheduler.start();
      const interval = scheduler.checkInterval;
      scheduler.start();
      expect(scheduler.checkInterval).toBe(interval);
    });

    it('should stop the scheduler', () => {
      scheduler.start();
      scheduler.stop();
      expect(scheduler.running).toBe(false);
      expect(scheduler.checkInterval).toBeNull();
      expect(mockLogger.info).toHaveBeenCalledWith('Scheduler stopped');
    });

    it('should not stop if not running', () => {
      scheduler.stop();
      expect(mockLogger.info).not.toHaveBeenCalledWith('Scheduler stopped');
    });
  });

  describe('loadJobs', () => {
    it('should load jobs from storage', () => {
      const storedJobs = [
        { id: 1, name: 'test1', command: 'echo test', type: JobType.CRON, cron: '* * * * *', status: JobStatus.ACTIVE },
        { id: 2, name: 'test2', command: 'echo test2', type: JobType.ONCE, runAt: new Date(Date.now() + 60000).toISOString(), status: JobStatus.ACTIVE },
      ];
      storage.getJobs.mockReturnValue(storedJobs);

      scheduler.loadJobs();

      expect(scheduler.jobs.size).toBe(2);
      expect(mockLogger.debug).toHaveBeenCalledWith('Loaded 2 jobs');
    });

    it('should handle empty jobs list', () => {
      storage.getJobs.mockReturnValue([]);
      scheduler.loadJobs();
      expect(scheduler.jobs.size).toBe(0);
    });
  });

  describe('calculateNextRun', () => {
    it('should return null for non-active jobs', () => {
      const job = {
        id: 1,
        type: JobType.CRON,
        cron: '* * * * *',
        status: JobStatus.PAUSED,
      };
      expect(scheduler.calculateNextRun(job)).toBeNull();
    });

    it('should calculate next run for cron jobs', () => {
      const job = {
        id: 1,
        type: JobType.CRON,
        cron: '* * * * *',
        status: JobStatus.ACTIVE,
      };
      const nextRun = scheduler.calculateNextRun(job);
      expect(nextRun).toBeInstanceOf(Date);
      expect(nextRun.getTime()).toBeGreaterThan(Date.now());
    });

    it('should return future runAt for one-time jobs', () => {
      const futureDate = new Date(Date.now() + 60000);
      const job = {
        id: 1,
        type: JobType.ONCE,
        runAt: futureDate.toISOString(),
        status: JobStatus.ACTIVE,
      };
      const nextRun = scheduler.calculateNextRun(job);
      expect(nextRun).toEqual(futureDate);
    });

    it('should return past runAt for expired one-time jobs', () => {
      const pastDate = new Date(Date.now() - 60000);
      const job = {
        id: 1,
        type: JobType.ONCE,
        runAt: pastDate.toISOString(),
        status: JobStatus.ACTIVE,
      };
      // Should still return the date so it can be processed as due
      expect(scheduler.calculateNextRun(job)).toEqual(pastDate);
    });
  });

  describe('getDueJobs', () => {
    it('should return empty array when no jobs are due', () => {
      scheduler.addJob({
        id: 1,
        name: 'test',
        command: 'echo test',
        type: JobType.CRON,
        cron: '0 0 * * *', // Daily at midnight - far future
        status: JobStatus.ACTIVE,
      });

      const dueJobs = scheduler.getDueJobs();
      expect(dueJobs).toEqual([]);
    });

    it('should return jobs that are due', () => {
      const pastDate = new Date(Date.now() - 1000);
      scheduler.addJob({
        id: 1,
        name: 'test',
        command: 'echo test',
        type: JobType.ONCE,
        runAt: pastDate.toISOString(),
        status: JobStatus.ACTIVE,
      });

      const dueJobs = scheduler.getDueJobs();
      expect(dueJobs).toHaveLength(1);
      expect(dueJobs[0].id).toBe(1);
    });

    it('should not return inactive jobs', () => {
      const pastDate = new Date(Date.now() - 1000);
      scheduler.addJob({
        id: 1,
        name: 'test',
        command: 'echo test',
        type: JobType.ONCE,
        runAt: pastDate.toISOString(),
        status: JobStatus.PAUSED,
      });

      const dueJobs = scheduler.getDueJobs();
      expect(dueJobs).toEqual([]);
    });
  });

  describe('tick', () => {
    it('should return empty array when not running', () => {
      const result = scheduler.tick();
      expect(result).toEqual([]);
    });

    it('should process due jobs', () => {
      scheduler.start();
      const pastDate = new Date(Date.now() - 1000);
      scheduler.addJob({
        id: 1,
        name: 'test',
        command: 'echo test',
        type: JobType.ONCE,
        runAt: pastDate.toISOString(),
        status: JobStatus.ACTIVE,
      });

      const dueJobs = scheduler.tick();
      expect(dueJobs).toHaveLength(1);
      expect(mockLogger.debug).toHaveBeenCalledWith('Job 1 (test) is due');
    });

    it('should mark one-time jobs as completed', () => {
      scheduler.start();
      const pastDate = new Date(Date.now() - 1000);
      scheduler.addJob({
        id: 1,
        name: 'test',
        command: 'echo test',
        type: JobType.ONCE,
        runAt: pastDate.toISOString(),
        status: JobStatus.ACTIVE,
      });

      scheduler.tick();
      const job = scheduler.getJob(1);
      expect(job.status).toBe(JobStatus.COMPLETED);
    });

    it('should recalculate next run for cron jobs', () => {
      scheduler.start();
      scheduler.addJob({
        id: 1,
        name: 'test',
        command: 'echo test',
        type: JobType.CRON,
        cron: '* * * * *',
        status: JobStatus.ACTIVE,
      });

      // Set a past nextRun to simulate due job
      const job = scheduler.getJob(1);
      job.nextRun = new Date(Date.now() - 1000);

      scheduler.tick();
      const updatedJob = scheduler.getJob(1);
      expect(updatedJob.nextRun.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('addJob', () => {
    it('should add a cron job', () => {
      const job = scheduler.addJob({
        name: 'test',
        command: 'echo test',
        cron: '* * * * *',
        status: JobStatus.ACTIVE,
      });

      expect(job.id).toBeDefined();
      expect(job.type).toBe(JobType.CRON);
      expect(job.nextRun).toBeInstanceOf(Date);
      expect(scheduler.jobs.has(job.id)).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(`Job ${job.id} (test) added`);
    });

    it('should add a one-time job', () => {
      const futureDate = new Date(Date.now() + 60000);
      const job = scheduler.addJob({
        name: 'test',
        command: 'echo test',
        runAt: futureDate.toISOString(),
        status: JobStatus.ACTIVE,
      });

      expect(job.type).toBe(JobType.ONCE);
      expect(job.nextRun).toEqual(futureDate);
    });

    it('should use provided ID', () => {
      const job = scheduler.addJob({
        id: 100,
        name: 'test',
        command: 'echo test',
        cron: '* * * * *',
      });

      expect(job.id).toBe(100);
    });

    it('should persist jobs to storage', () => {
      scheduler.addJob({
        name: 'test',
        command: 'echo test',
        cron: '* * * * *',
      });

      expect(storage.saveJobs).toHaveBeenCalled();
    });
  });

  describe('removeJob', () => {
    it('should remove an existing job', () => {
      scheduler.addJob({
        id: 1,
        name: 'test',
        command: 'echo test',
        cron: '* * * * *',
      });

      const result = scheduler.removeJob(1);
      expect(result).toBe(true);
      expect(scheduler.jobs.has(1)).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith('Job 1 removed');
    });

    it('should return false for non-existent job', () => {
      const result = scheduler.removeJob(999);
      expect(result).toBe(false);
    });
  });

  describe('updateJob', () => {
    it('should update a job', () => {
      scheduler.addJob({
        id: 1,
        name: 'test',
        command: 'echo test',
        cron: '* * * * *',
      });

      const updated = scheduler.updateJob(1, { name: 'updated' });
      expect(updated.name).toBe('updated');
      expect(updated.command).toBe('echo test'); // unchanged
    });

    it('should recalculate next run when updating cron', () => {
      scheduler.addJob({
        id: 1,
        name: 'test',
        command: 'echo test',
        cron: '0 0 * * *',
        status: JobStatus.ACTIVE,
      });

      const updated = scheduler.updateJob(1, { cron: '* * * * *' });
      expect(updated.cron).toBe('* * * * *');
      expect(updated.nextRun).toBeInstanceOf(Date);
    });

    it('should return null for non-existent job', () => {
      const result = scheduler.updateJob(999, { name: 'test' });
      expect(result).toBeNull();
    });
  });

  describe('updateJobStatus', () => {
    it('should update job status', () => {
      scheduler.addJob({
        id: 1,
        name: 'test',
        command: 'echo test',
        cron: '* * * * *',
        status: JobStatus.ACTIVE,
      });

      const updated = scheduler.updateJobStatus(1, JobStatus.PAUSED);
      expect(updated.status).toBe(JobStatus.PAUSED);
      expect(updated.nextRun).toBeNull();
    });

    it('should recalculate next run when activating', () => {
      scheduler.addJob({
        id: 1,
        name: 'test',
        command: 'echo test',
        cron: '* * * * *',
        status: JobStatus.PAUSED,
      });

      // First set nextRun to null (paused)
      let job = scheduler.getJob(1);
      job.nextRun = null;

      const updated = scheduler.updateJobStatus(1, JobStatus.ACTIVE);
      expect(updated.status).toBe(JobStatus.ACTIVE);
      expect(updated.nextRun).toBeInstanceOf(Date);
    });
  });

  describe('getAllJobs', () => {
    it('should return all jobs', () => {
      scheduler.addJob({ id: 1, name: 'test1', command: 'echo 1', cron: '* * * * *' });
      scheduler.addJob({ id: 2, name: 'test2', command: 'echo 2', cron: '0 * * * *' });

      const jobs = scheduler.getAllJobs();
      expect(jobs).toHaveLength(2);
    });
  });

  describe('getJob', () => {
    it('should return job by ID', () => {
      scheduler.addJob({ id: 1, name: 'test', command: 'echo test', cron: '* * * * *' });

      const job = scheduler.getJob(1);
      expect(job).toBeDefined();
      expect(job.name).toBe('test');
    });

    it('should return null for non-existent job', () => {
      const job = scheduler.getJob(999);
      expect(job).toBeNull();
    });
  });

  describe('generateJobId', () => {
    it('should generate sequential IDs', () => {
      const id1 = scheduler.generateJobId();
      scheduler.jobs.set(id1, {});

      const id2 = scheduler.generateJobId();
      scheduler.jobs.set(id2, {});

      expect(id2).toBe(id1 + 1);
    });
  });

  describe('getStats', () => {
    it('should return scheduler statistics', () => {
      scheduler.addJob({
        id: 1,
        name: 'cron-active',
        command: 'echo test',
        type: JobType.CRON,
        cron: '* * * * *',
        status: JobStatus.ACTIVE,
      });

      scheduler.addJob({
        id: 2,
        name: 'once-paused',
        command: 'echo test',
        type: JobType.ONCE,
        runAt: new Date(Date.now() + 60000).toISOString(),
        status: JobStatus.PAUSED,
      });

      const stats = scheduler.getStats();
      expect(stats.totalJobs).toBe(2);
      expect(stats.activeJobs).toBe(1);
      expect(stats.pausedJobs).toBe(1);
      expect(stats.cronJobs).toBe(1);
      expect(stats.onceJobs).toBe(1);
    });
  });

  describe('handleExpiredOneTimeJobs', () => {
    it('should mark expired one-time jobs as failed on load', () => {
      const pastDate = new Date(Date.now() - 60000); // 1 minute ago
      const storedJobs = [
        {
          id: 1,
          name: 'expired-job',
          command: 'echo test',
          type: JobType.ONCE,
          runAt: pastDate.toISOString(),
          status: JobStatus.ACTIVE,
        },
      ];
      storage.getJobs.mockReturnValue(storedJobs);

      scheduler.loadJobs();

      const job = scheduler.getJob(1);
      expect(job.status).toBe(JobStatus.FAILED);
      expect(job.lastResult).toBe('failed');
      expect(job.error).toContain('expired');
      expect(job.expiredAt).toBeDefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('expired')
      );
    });

    it('should not mark non-expired one-time jobs as failed', () => {
      const futureDate = new Date(Date.now() + 60000); // 1 minute from now
      const storedJobs = [
        {
          id: 1,
          name: 'future-job',
          command: 'echo test',
          type: JobType.ONCE,
          runAt: futureDate.toISOString(),
          status: JobStatus.ACTIVE,
        },
      ];
      storage.getJobs.mockReturnValue(storedJobs);

      scheduler.loadJobs();

      const job = scheduler.getJob(1);
      expect(job.status).toBe(JobStatus.ACTIVE);
    });

    it('should not mark already completed one-time jobs', () => {
      const pastDate = new Date(Date.now() - 60000);
      const storedJobs = [
        {
          id: 1,
          name: 'completed-job',
          command: 'echo test',
          type: JobType.ONCE,
          runAt: pastDate.toISOString(),
          status: JobStatus.COMPLETED,
        },
      ];
      storage.getJobs.mockReturnValue(storedJobs);

      scheduler.loadJobs();

      const job = scheduler.getJob(1);
      expect(job.status).toBe(JobStatus.COMPLETED);
      expect(mockLogger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('expired')
      );
    });

    it('should not mark already failed one-time jobs', () => {
      const pastDate = new Date(Date.now() - 60000);
      const storedJobs = [
        {
          id: 1,
          name: 'failed-job',
          command: 'echo test',
          type: JobType.ONCE,
          runAt: pastDate.toISOString(),
          status: JobStatus.FAILED,
        },
      ];
      storage.getJobs.mockReturnValue(storedJobs);

      scheduler.loadJobs();

      const job = scheduler.getJob(1);
      expect(job.status).toBe(JobStatus.FAILED);
      expect(mockLogger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('expired')
      );
    });

    it('should not mark cron jobs as expired', () => {
      const storedJobs = [
        {
          id: 1,
          name: 'cron-job',
          command: 'echo test',
          type: JobType.CRON,
          cron: '* * * * *',
          status: JobStatus.ACTIVE,
        },
      ];
      storage.getJobs.mockReturnValue(storedJobs);

      scheduler.loadJobs();

      const job = scheduler.getJob(1);
      expect(job.status).toBe(JobStatus.ACTIVE);
    });

    it('should handle multiple expired jobs', () => {
      const pastDate = new Date(Date.now() - 60000);
      const storedJobs = [
        {
          id: 1,
          name: 'expired-1',
          command: 'echo test',
          type: JobType.ONCE,
          runAt: pastDate.toISOString(),
          status: JobStatus.ACTIVE,
        },
        {
          id: 2,
          name: 'expired-2',
          command: 'echo test',
          type: JobType.ONCE,
          runAt: pastDate.toISOString(),
          status: JobStatus.ACTIVE,
        },
      ];
      storage.getJobs.mockReturnValue(storedJobs);

      scheduler.loadJobs();

      expect(scheduler.getJob(1).status).toBe(JobStatus.FAILED);
      expect(scheduler.getJob(2).status).toBe(JobStatus.FAILED);
      expect(mockLogger.info).toHaveBeenCalledWith('Marked 2 expired one-time job(s) as failed');
    });
  });

  describe('createScheduler', () => {
    it('should create a scheduler instance', () => {
      const s = createScheduler({ logger: mockLogger });
      expect(s).toBeInstanceOf(Scheduler);
      expect(s.logger).toBe(mockLogger);
    });
  });
});
