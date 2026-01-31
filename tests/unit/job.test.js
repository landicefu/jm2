/**
 * Unit tests for src/core/job.js
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
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
} from '../../src/core/job.js';

describe('job', () => {
  describe('JobStatus', () => {
    it('should have all status values', () => {
      expect(JobStatus.ACTIVE).toBe('active');
      expect(JobStatus.PAUSED).toBe('paused');
      expect(JobStatus.COMPLETED).toBe('completed');
      expect(JobStatus.FAILED).toBe('failed');
    });
  });

  describe('JobType', () => {
    it('should have all type values', () => {
      expect(JobType.CRON).toBe('cron');
      expect(JobType.ONCE).toBe('once');
    });
  });

  describe('JOB_DEFAULTS', () => {
    it('should have default values', () => {
      expect(JOB_DEFAULTS.status).toBe(JobStatus.ACTIVE);
      expect(JOB_DEFAULTS.tags).toEqual([]);
      expect(JOB_DEFAULTS.env).toEqual({});
      expect(JOB_DEFAULTS.retry).toBe(0);
      expect(JOB_DEFAULTS.runCount).toBe(0);
    });
  });

  describe('createJob', () => {
    it('should create job with defaults', () => {
      const job = createJob({
        name: 'test-job',
        command: 'echo test',
        cron: '* * * * *',
      });

      expect(job.name).toBe('test-job');
      expect(job.command).toBe('echo test');
      expect(job.status).toBe(JobStatus.ACTIVE);
      expect(job.tags).toEqual([]);
      expect(job.createdAt).toBeDefined();
      expect(job.updatedAt).toBeDefined();
    });

    it('should preserve provided values over defaults', () => {
      const job = createJob({
        name: 'test-job',
        command: 'echo test',
        cron: '* * * * *',
        status: JobStatus.PAUSED,
        tags: ['backup'],
        retry: 3,
      });

      expect(job.status).toBe(JobStatus.PAUSED);
      expect(job.tags).toEqual(['backup']);
      expect(job.retry).toBe(3);
    });

    it('should set timestamps', () => {
      const before = new Date().toISOString();
      const job = createJob({ command: 'test', cron: '* * * * *' });
      const after = new Date().toISOString();

      expect(job.createdAt >= before).toBe(true);
      expect(job.createdAt <= after).toBe(true);
      expect(job.updatedAt).toBe(job.createdAt);
    });
  });

  describe('validateJob', () => {
    describe('command validation', () => {
      it('should require command', () => {
        const result = validateJob({ cron: '* * * * *' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('command is required and must be a non-empty string');
      });

      it('should reject empty command', () => {
        const result = validateJob({ command: '', cron: '* * * * *' });
        expect(result.valid).toBe(false);
      });

      it('should reject whitespace-only command', () => {
        const result = validateJob({ command: '   ', cron: '* * * * *' });
        expect(result.valid).toBe(false);
      });
    });

    describe('schedule validation', () => {
      it('should require either cron or runAt', () => {
        const result = validateJob({ command: 'echo test' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Either cron expression or runAt datetime is required');
      });

      it('should reject both cron and runAt', () => {
        const result = validateJob({
          command: 'echo test',
          cron: '* * * * *',
          runAt: '2024-12-25T10:00:00Z',
        });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Cannot specify both cron and runAt');
      });

      it('should accept valid cron expression', () => {
        const result = validateJob({
          command: 'echo test',
          cron: '0 * * * *',
        });
        expect(result.valid).toBe(true);
      });

      it('should accept valid runAt', () => {
        const result = validateJob({
          command: 'echo test',
          runAt: '2024-12-25T10:00:00Z',
        });
        expect(result.valid).toBe(true);
      });
    });

    describe('cron validation', () => {
      it('should reject invalid cron expression', () => {
        const result = validateJob({
          command: 'echo test',
          cron: 'invalid-cron',
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('Invalid cron expression'))).toBe(true);
      });

      it('should reject cron with too many fields', () => {
        const result = validateJob({
          command: 'echo test',
          cron: '* * * * * * *',
        });
        expect(result.valid).toBe(false);
      });

      it('should accept 5-field cron', () => {
        const result = validateJob({
          command: 'echo test',
          cron: '* * * * *',
        });
        expect(result.valid).toBe(true);
      });

      it('should accept 6-field cron (with seconds)', () => {
        const result = validateJob({
          command: 'echo test',
          cron: '0 * * * * *',
        });
        expect(result.valid).toBe(true);
      });
    });

    describe('runAt validation', () => {
      it('should reject invalid datetime', () => {
        const result = validateJob({
          command: 'echo test',
          runAt: 'not-a-date',
        });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('runAt must be a valid datetime');
      });

      it('should accept ISO 8601 datetime', () => {
        const result = validateJob({
          command: 'echo test',
          runAt: '2024-12-25T10:00:00.000Z',
        });
        expect(result.valid).toBe(true);
      });
    });

    describe('name validation', () => {
      it('should accept valid name', () => {
        const result = validateJob({
          command: 'echo test',
          cron: '* * * * *',
          name: 'my-job_123',
        });
        expect(result.valid).toBe(true);
      });

      it('should reject empty name', () => {
        const result = validateJob({
          command: 'echo test',
          cron: '* * * * *',
          name: '',
        });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('name cannot be empty');
      });

      it('should reject name with invalid characters', () => {
        const result = validateJob({
          command: 'echo test',
          cron: '* * * * *',
          name: 'my job!',
        });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('name can only contain letters, numbers, underscores, and hyphens');
      });
    });

    describe('tags validation', () => {
      it('should accept valid tags array', () => {
        const result = validateJob({
          command: 'echo test',
          cron: '* * * * *',
          tags: ['backup', 'daily'],
        });
        expect(result.valid).toBe(true);
      });

      it('should reject non-array tags', () => {
        const result = validateJob({
          command: 'echo test',
          cron: '* * * * *',
          tags: 'not-an-array',
        });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('tags must be an array');
      });

      it('should reject empty string tags', () => {
        const result = validateJob({
          command: 'echo test',
          cron: '* * * * *',
          tags: ['valid', ''],
        });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Each tag must be a non-empty string');
      });
    });

    describe('env validation', () => {
      it('should accept valid env object', () => {
        const result = validateJob({
          command: 'echo test',
          cron: '* * * * *',
          env: { NODE_ENV: 'production' },
        });
        expect(result.valid).toBe(true);
      });

      it('should reject non-object env', () => {
        const result = validateJob({
          command: 'echo test',
          cron: '* * * * *',
          env: 'not-an-object',
        });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('env must be an object');
      });

      it('should reject array env', () => {
        const result = validateJob({
          command: 'echo test',
          cron: '* * * * *',
          env: ['not', 'valid'],
        });
        expect(result.valid).toBe(false);
      });
    });

    describe('timeout validation', () => {
      it('should accept valid timeout number', () => {
        const result = validateJob({
          command: 'echo test',
          cron: '* * * * *',
          timeout: 5000,
        });
        expect(result.valid).toBe(true);
      });

      it('should accept valid timeout string', () => {
        const result = validateJob({
          command: 'echo test',
          cron: '* * * * *',
          timeout: '5m',
        });
        expect(result.valid).toBe(true);
      });

      it('should reject invalid timeout string', () => {
        const result = validateJob({
          command: 'echo test',
          cron: '* * * * *',
          timeout: 'invalid',
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('Invalid timeout format'))).toBe(true);
      });

      it('should reject negative timeout', () => {
        const result = validateJob({
          command: 'echo test',
          cron: '* * * * *',
          timeout: -1000,
        });
        expect(result.valid).toBe(false);
      });
    });

    describe('retry validation', () => {
      it('should accept valid retry count', () => {
        const result = validateJob({
          command: 'echo test',
          cron: '* * * * *',
          retry: 3,
        });
        expect(result.valid).toBe(true);
      });

      it('should accept zero retry', () => {
        const result = validateJob({
          command: 'echo test',
          cron: '* * * * *',
          retry: 0,
        });
        expect(result.valid).toBe(true);
      });

      it('should reject negative retry', () => {
        const result = validateJob({
          command: 'echo test',
          cron: '* * * * *',
          retry: -1,
        });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('retry must be a non-negative integer');
      });

      it('should reject non-integer retry', () => {
        const result = validateJob({
          command: 'echo test',
          cron: '* * * * *',
          retry: 1.5,
        });
        expect(result.valid).toBe(false);
      });
    });

    describe('type validation', () => {
      it('should accept valid type', () => {
        const result = validateJob({
          command: 'echo test',
          cron: '* * * * *',
          type: JobType.CRON,
        });
        expect(result.valid).toBe(true);
      });

      it('should reject invalid type', () => {
        const result = validateJob({
          command: 'echo test',
          cron: '* * * * *',
          type: 'invalid',
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('Invalid job type'))).toBe(true);
      });
    });

    describe('status validation', () => {
      it('should accept valid status', () => {
        const result = validateJob({
          command: 'echo test',
          cron: '* * * * *',
          status: JobStatus.PAUSED,
        });
        expect(result.valid).toBe(true);
      });

      it('should reject invalid status', () => {
        const result = validateJob({
          command: 'echo test',
          cron: '* * * * *',
          status: 'invalid',
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('Invalid job status'))).toBe(true);
      });
    });
  });

  describe('normalizeJob', () => {
    it('should set type to CRON for cron jobs', () => {
      const job = normalizeJob({
        command: 'echo test',
        cron: '* * * * *',
      });
      expect(job.type).toBe(JobType.CRON);
    });

    it('should set type to ONCE for runAt jobs', () => {
      const job = normalizeJob({
        command: 'echo test',
        runAt: '2024-12-25T10:00:00Z',
      });
      expect(job.type).toBe(JobType.ONCE);
    });

    it('should normalize tags to lowercase', () => {
      const job = normalizeJob({
        command: 'echo test',
        cron: '* * * * *',
        tags: ['Backup', 'DAILY'],
      });
      expect(job.tags).toEqual(['backup', 'daily']);
    });

    it('should remove duplicate tags', () => {
      const job = normalizeJob({
        command: 'echo test',
        cron: '* * * * *',
        tags: ['backup', 'Backup', 'BACKUP'],
      });
      expect(job.tags).toEqual(['backup']);
    });

    it('should convert timeout string to milliseconds', () => {
      const job = normalizeJob({
        command: 'echo test',
        cron: '* * * * *',
        timeout: '5m',
      });
      expect(job.timeout).toBe(300000);
    });

    it('should trim command', () => {
      const job = normalizeJob({
        command: '  echo test  ',
        cron: '* * * * *',
      });
      expect(job.command).toBe('echo test');
    });

    it('should trim name', () => {
      const job = normalizeJob({
        command: 'echo test',
        cron: '* * * * *',
        name: '  my-job  ',
      });
      expect(job.name).toBe('my-job');
    });
  });

  describe('job type checks', () => {
    describe('isOneTimeJob', () => {
      it('should return true for ONCE type', () => {
        expect(isOneTimeJob({ type: JobType.ONCE })).toBe(true);
      });

      it('should return true for job with runAt', () => {
        expect(isOneTimeJob({ runAt: '2024-12-25T10:00:00Z' })).toBe(true);
      });

      it('should return false for cron job', () => {
        expect(isOneTimeJob({ type: JobType.CRON, cron: '* * * * *' })).toBe(false);
      });
    });

    describe('isPeriodicJob', () => {
      it('should return true for CRON type', () => {
        expect(isPeriodicJob({ type: JobType.CRON })).toBe(true);
      });

      it('should return true for job with cron', () => {
        expect(isPeriodicJob({ cron: '* * * * *' })).toBe(true);
      });

      it('should return false for one-time job', () => {
        expect(isPeriodicJob({ type: JobType.ONCE, runAt: '2024-12-25T10:00:00Z' })).toBe(false);
      });
    });
  });

  describe('job status checks', () => {
    describe('isJobActive', () => {
      it('should return true for active job', () => {
        expect(isJobActive({ status: JobStatus.ACTIVE })).toBe(true);
      });

      it('should return false for paused job', () => {
        expect(isJobActive({ status: JobStatus.PAUSED })).toBe(false);
      });
    });

    describe('isJobPaused', () => {
      it('should return true for paused job', () => {
        expect(isJobPaused({ status: JobStatus.PAUSED })).toBe(true);
      });

      it('should return false for active job', () => {
        expect(isJobPaused({ status: JobStatus.ACTIVE })).toBe(false);
      });
    });

    describe('isJobCompleted', () => {
      it('should return true for completed job', () => {
        expect(isJobCompleted({ status: JobStatus.COMPLETED })).toBe(true);
      });

      it('should return false for active job', () => {
        expect(isJobCompleted({ status: JobStatus.ACTIVE })).toBe(false);
      });
    });
  });

  describe('isJobExpired', () => {
    it('should return false for cron job', () => {
      expect(isJobExpired({ type: JobType.CRON, cron: '* * * * *' })).toBe(false);
    });

    it('should return false for one-time job without runAt', () => {
      expect(isJobExpired({ type: JobType.ONCE })).toBe(false);
    });

    it('should return true for one-time job with past runAt', () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString(); // Yesterday
      expect(isJobExpired({ type: JobType.ONCE, runAt: pastDate })).toBe(true);
    });

    it('should return false for one-time job with future runAt', () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString(); // Tomorrow
      expect(isJobExpired({ type: JobType.ONCE, runAt: futureDate })).toBe(false);
    });
  });

  describe('formatJobForDisplay', () => {
    it('should format cron job for display', () => {
      const job = {
        id: 1,
        name: 'test-job',
        command: 'echo test',
        type: JobType.CRON,
        cron: '0 * * * *',
        status: JobStatus.ACTIVE,
        tags: ['backup', 'daily'],
        nextRun: '2024-12-25T10:00:00Z',
        lastRun: '2024-12-24T10:00:00Z',
        runCount: 5,
        createdAt: '2024-12-01T00:00:00Z',
      };

      const formatted = formatJobForDisplay(job);

      expect(formatted.id).toBe(1);
      expect(formatted.name).toBe('test-job');
      expect(formatted.schedule).toBe('0 * * * *');
      expect(formatted.tags).toBe('backup, daily');
    });

    it('should format one-time job for display', () => {
      const job = {
        id: 2,
        name: 'once-job',
        command: 'echo once',
        type: JobType.ONCE,
        runAt: '2024-12-25T10:00:00Z',
        status: JobStatus.ACTIVE,
        tags: [],
        createdAt: '2024-12-01T00:00:00Z',
      };

      const formatted = formatJobForDisplay(job);

      expect(formatted.schedule).toBe('at 2024-12-25T10:00:00Z');
      expect(formatted.tags).toBe('');
    });
  });

  describe('createExecutionResult', () => {
    it('should create execution result with defaults', () => {
      const result = createExecutionResult({
        jobId: 1,
        jobName: 'test-job',
        exitCode: 0,
        duration: 1000,
      });

      expect(result.jobId).toBe(1);
      expect(result.jobName).toBe('test-job');
      expect(result.exitCode).toBe(0);
      expect(result.success).toBe(true);
      expect(result.duration).toBe(1000);
      expect(result.startTime).toBeDefined();
      expect(result.triggeredBy).toBe('scheduled');
      expect(result.attempt).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
    });

    it('should mark failed execution', () => {
      const result = createExecutionResult({
        jobId: 1,
        jobName: 'test-job',
        exitCode: 1,
      });

      expect(result.success).toBe(false);
    });

    it('should preserve provided values', () => {
      const result = createExecutionResult({
        jobId: 1,
        jobName: 'test-job',
        exitCode: 0,
        triggeredBy: 'manual',
        attempt: 2,
        stdout: 'output',
        stderr: 'error',
        error: 'some error',
      });

      expect(result.triggeredBy).toBe('manual');
      expect(result.attempt).toBe(2);
      expect(result.stdout).toBe('output');
      expect(result.stderr).toBe('error');
      expect(result.error).toBe('some error');
    });
  });

  describe('default export', () => {
    it('should export all functions and constants', async () => {
      const jobModule = await import('../../src/core/job.js');
      
      expect(jobModule.default).toBeDefined();
      expect(jobModule.default.JobStatus).toBeDefined();
      expect(jobModule.default.JobType).toBeDefined();
      expect(jobModule.default.JOB_DEFAULTS).toBeDefined();
      expect(typeof jobModule.default.createJob).toBe('function');
      expect(typeof jobModule.default.validateJob).toBe('function');
      expect(typeof jobModule.default.normalizeJob).toBe('function');
      expect(typeof jobModule.default.isOneTimeJob).toBe('function');
      expect(typeof jobModule.default.isPeriodicJob).toBe('function');
      expect(typeof jobModule.default.isJobActive).toBe('function');
      expect(typeof jobModule.default.isJobPaused).toBe('function');
      expect(typeof jobModule.default.isJobCompleted).toBe('function');
      expect(typeof jobModule.default.isJobExpired).toBe('function');
      expect(typeof jobModule.default.formatJobForDisplay).toBe('function');
      expect(typeof jobModule.default.createExecutionResult).toBe('function');
    });
  });
});
