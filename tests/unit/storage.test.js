/**
 * Unit tests for src/core/storage.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

let storage;
let testDataDir;

describe('storage', () => {
  const originalEnv = process.env.JM2_DATA_DIR;

  beforeEach(async () => {
    // Create a unique test directory
    testDataDir = join(tmpdir(), `jm2-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    process.env.JM2_DATA_DIR = testDataDir;
    mkdirSync(testDataDir, { recursive: true });
    
    // Re-import the module to pick up the new env var
    vi.resetModules();
    storage = await import('../../src/core/storage.js');
  });

  afterEach(() => {
    // Restore original env
    if (originalEnv !== undefined) {
      process.env.JM2_DATA_DIR = originalEnv;
    } else {
      delete process.env.JM2_DATA_DIR;
    }

    // Clean up test directory
    if (testDataDir && existsSync(testDataDir)) {
      rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  describe('readJsonFile', () => {
    it('should return default value when file does not exist', () => {
      const result = storage.readJsonFile(join(testDataDir, 'nonexistent.json'), { default: true });
      expect(result).toEqual({ default: true });
    });

    it('should return null as default when no default provided', () => {
      const result = storage.readJsonFile(join(testDataDir, 'nonexistent.json'));
      expect(result).toBeNull();
    });

    it('should read and parse JSON file', () => {
      const filePath = join(testDataDir, 'test.json');
      writeFileSync(filePath, JSON.stringify({ key: 'value' }));
      
      const result = storage.readJsonFile(filePath);
      expect(result).toEqual({ key: 'value' });
    });

    it('should throw error for invalid JSON', () => {
      const filePath = join(testDataDir, 'invalid.json');
      writeFileSync(filePath, 'not valid json');
      
      expect(() => storage.readJsonFile(filePath)).toThrow();
    });
  });

  describe('writeJsonFile', () => {
    it('should write JSON file with pretty formatting by default', () => {
      const filePath = join(testDataDir, 'output.json');
      storage.writeJsonFile(filePath, { key: 'value' });
      
      const content = readFileSync(filePath, 'utf8');
      expect(content).toBe(JSON.stringify({ key: 'value' }, null, 2));
    });

    it('should write compact JSON when pretty is false', () => {
      const filePath = join(testDataDir, 'compact.json');
      storage.writeJsonFile(filePath, { key: 'value' }, false);
      
      const content = readFileSync(filePath, 'utf8');
      expect(content).toBe('{"key":"value"}');
    });

    it('should create data directory if it does not exist', () => {
      const newDir = join(testDataDir, 'subdir');
      process.env.JM2_DATA_DIR = newDir;
      
      const filePath = join(newDir, 'test.json');
      storage.writeJsonFile(filePath, { test: true });
      
      expect(existsSync(filePath)).toBe(true);
    });
  });

  describe('Jobs CRUD operations', () => {
    describe('getJobs', () => {
      it('should return empty array when no jobs file exists', () => {
        const jobs = storage.getJobs();
        expect(jobs).toEqual([]);
      });

      it('should return jobs from file', () => {
        const jobsFile = join(testDataDir, 'jobs.json');
        writeFileSync(jobsFile, JSON.stringify([{ id: 1, name: 'test' }]));
        
        const jobs = storage.getJobs();
        expect(jobs).toEqual([{ id: 1, name: 'test' }]);
      });
    });

    describe('saveJobs', () => {
      it('should save jobs to file', () => {
        storage.saveJobs([{ id: 1, name: 'test' }]);
        
        const jobsFile = join(testDataDir, 'jobs.json');
        const content = JSON.parse(readFileSync(jobsFile, 'utf8'));
        expect(content).toEqual([{ id: 1, name: 'test' }]);
      });
    });

    describe('getJobById', () => {
      beforeEach(() => {
        storage.saveJobs([
          { id: 1, name: 'job1' },
          { id: 2, name: 'job2' },
        ]);
      });

      it('should return job by ID', () => {
        const job = storage.getJobById(1);
        expect(job).toEqual({ id: 1, name: 'job1' });
      });

      it('should return null for non-existent ID', () => {
        const job = storage.getJobById(999);
        expect(job).toBeNull();
      });
    });

    describe('getJobByName', () => {
      beforeEach(() => {
        storage.saveJobs([
          { id: 1, name: 'job1' },
          { id: 2, name: 'job2' },
        ]);
      });

      it('should return job by name', () => {
        const job = storage.getJobByName('job2');
        expect(job).toEqual({ id: 2, name: 'job2' });
      });

      it('should return null for non-existent name', () => {
        const job = storage.getJobByName('nonexistent');
        expect(job).toBeNull();
      });
    });

    describe('getJob', () => {
      beforeEach(() => {
        storage.saveJobs([
          { id: 1, name: 'job1' },
          { id: 2, name: 'job2' },
        ]);
      });

      it('should find job by numeric ID', () => {
        const job = storage.getJob(1);
        expect(job.name).toBe('job1');
      });

      it('should find job by string ID', () => {
        const job = storage.getJob('2');
        expect(job.name).toBe('job2');
      });

      it('should find job by name', () => {
        const job = storage.getJob('job1');
        expect(job.id).toBe(1);
      });

      it('should return null for non-existent identifier', () => {
        const job = storage.getJob('nonexistent');
        expect(job).toBeNull();
      });
    });

    describe('getNextJobId', () => {
      it('should return 1 for empty jobs list', () => {
        expect(storage.getNextJobId()).toBe(1);
      });

      it('should return max ID + 1', () => {
        storage.saveJobs([
          { id: 1, name: 'job1' },
          { id: 5, name: 'job5' },
          { id: 3, name: 'job3' },
        ]);
        expect(storage.getNextJobId()).toBe(6);
      });
    });

    describe('addJob', () => {
      it('should add job with auto-generated ID', () => {
        const job = storage.addJob({ name: 'new-job', command: 'echo test' });
        
        expect(job.id).toBe(1);
        expect(job.name).toBe('new-job');
        expect(job.createdAt).toBeDefined();
        expect(job.updatedAt).toBeDefined();
      });

      it('should preserve provided ID', () => {
        const job = storage.addJob({ id: 100, name: 'custom-id', command: 'echo test' });
        expect(job.id).toBe(100);
      });

      it('should add job to existing jobs', () => {
        storage.saveJobs([{ id: 1, name: 'existing' }]);
        storage.addJob({ name: 'new-job', command: 'echo test' });
        
        const jobs = storage.getJobs();
        expect(jobs).toHaveLength(2);
      });
    });

    describe('updateJob', () => {
      beforeEach(() => {
        storage.saveJobs([
          { id: 1, name: 'job1', command: 'echo 1' },
          { id: 2, name: 'job2', command: 'echo 2' },
        ]);
      });

      it('should update job fields', () => {
        const updated = storage.updateJob(1, { command: 'echo updated' });
        
        expect(updated.command).toBe('echo updated');
        expect(updated.name).toBe('job1');
        expect(updated.updatedAt).toBeDefined();
      });

      it('should not allow changing ID', () => {
        const updated = storage.updateJob(1, { id: 999 });
        expect(updated.id).toBe(1);
      });

      it('should return null for non-existent job', () => {
        const updated = storage.updateJob(999, { command: 'test' });
        expect(updated).toBeNull();
      });
    });

    describe('removeJob', () => {
      beforeEach(() => {
        storage.saveJobs([
          { id: 1, name: 'job1' },
          { id: 2, name: 'job2' },
        ]);
      });

      it('should remove job by ID', () => {
        const result = storage.removeJob(1);
        
        expect(result).toBe(true);
        expect(storage.getJobs()).toHaveLength(1);
        expect(storage.getJobById(1)).toBeNull();
      });

      it('should return false for non-existent job', () => {
        const result = storage.removeJob(999);
        expect(result).toBe(false);
      });
    });
  });

  describe('Job name utilities', () => {
    describe('jobNameExists', () => {
      beforeEach(() => {
        storage.saveJobs([
          { id: 1, name: 'existing-job' },
        ]);
      });

      it('should return true for existing name', () => {
        expect(storage.jobNameExists('existing-job')).toBe(true);
      });

      it('should return false for non-existing name', () => {
        expect(storage.jobNameExists('new-job')).toBe(false);
      });

      it('should exclude specified ID from check', () => {
        expect(storage.jobNameExists('existing-job', 1)).toBe(false);
      });
    });

    describe('generateUniqueName', () => {
      it('should return base name if not taken', () => {
        expect(storage.generateUniqueName('my-job')).toBe('my-job');
      });

      it('should add suffix if name is taken', () => {
        storage.saveJobs([{ id: 1, name: 'my-job' }]);
        expect(storage.generateUniqueName('my-job')).toBe('my-job-2');
      });

      it('should increment suffix until unique', () => {
        storage.saveJobs([
          { id: 1, name: 'my-job' },
          { id: 2, name: 'my-job-2' },
          { id: 3, name: 'my-job-3' },
        ]);
        expect(storage.generateUniqueName('my-job')).toBe('my-job-4');
      });
    });

    describe('generateAutoName', () => {
      it('should generate job-1 for first job', () => {
        const name = storage.generateAutoName();
        expect(name).toMatch(/^job-\d+$/);
      });
    });
  });

  describe('Job filtering', () => {
    beforeEach(() => {
      storage.saveJobs([
        { id: 1, name: 'job1', tags: ['backup', 'daily'], status: 'active' },
        { id: 2, name: 'job2', tags: ['backup'], status: 'paused' },
        { id: 3, name: 'job3', tags: ['test'], status: 'active' },
      ]);
    });

    describe('getJobsByTag', () => {
      it('should return jobs with specified tag', () => {
        const jobs = storage.getJobsByTag('backup');
        expect(jobs).toHaveLength(2);
        expect(jobs.map(j => j.name)).toContain('job1');
        expect(jobs.map(j => j.name)).toContain('job2');
      });

      it('should return empty array for non-existent tag', () => {
        const jobs = storage.getJobsByTag('nonexistent');
        expect(jobs).toEqual([]);
      });
    });

    describe('getJobsByStatus', () => {
      it('should return jobs with specified status', () => {
        const jobs = storage.getJobsByStatus('active');
        expect(jobs).toHaveLength(2);
      });

      it('should return empty array for non-existent status', () => {
        const jobs = storage.getJobsByStatus('completed');
        expect(jobs).toEqual([]);
      });
    });
  });

  describe('History operations', () => {
    describe('getHistory', () => {
      it('should return empty array when no history file exists', () => {
        const history = storage.getHistory();
        expect(history).toEqual([]);
      });
    });

    describe('addHistoryEntry', () => {
      it('should add entry with timestamp', () => {
        const entry = storage.addHistoryEntry({
          jobId: 1,
          exitCode: 0,
        });
        
        expect(entry.jobId).toBe(1);
        expect(entry.timestamp).toBeDefined();
      });

      it('should preserve provided timestamp', () => {
        const timestamp = '2024-01-01T00:00:00.000Z';
        const entry = storage.addHistoryEntry({
          jobId: 1,
          timestamp,
        });
        
        expect(entry.timestamp).toBe(timestamp);
      });
    });

    describe('getJobHistory', () => {
      beforeEach(() => {
        storage.saveHistory([
          { jobId: 1, timestamp: '2024-01-03T00:00:00.000Z' },
          { jobId: 1, timestamp: '2024-01-01T00:00:00.000Z' },
          { jobId: 1, timestamp: '2024-01-02T00:00:00.000Z' },
          { jobId: 2, timestamp: '2024-01-01T00:00:00.000Z' },
        ]);
      });

      it('should return history for specific job', () => {
        const history = storage.getJobHistory(1);
        expect(history).toHaveLength(3);
        expect(history.every(h => h.jobId === 1)).toBe(true);
      });

      it('should sort by timestamp descending', () => {
        const history = storage.getJobHistory(1);
        expect(history[0].timestamp).toBe('2024-01-03T00:00:00.000Z');
        expect(history[2].timestamp).toBe('2024-01-01T00:00:00.000Z');
      });

      it('should respect limit parameter', () => {
        const history = storage.getJobHistory(1, 2);
        expect(history).toHaveLength(2);
      });
    });

    describe('clearHistoryBefore', () => {
      beforeEach(() => {
        storage.saveHistory([
          { jobId: 1, timestamp: '2024-01-01T00:00:00.000Z' },
          { jobId: 1, timestamp: '2024-01-15T00:00:00.000Z' },
          { jobId: 1, timestamp: '2024-01-31T00:00:00.000Z' },
        ]);
      });

      it('should remove entries before specified date', () => {
        const removed = storage.clearHistoryBefore(new Date('2024-01-10'));
        
        expect(removed).toBe(1);
        expect(storage.getHistory()).toHaveLength(2);
      });
    });

    describe('clearAllHistory', () => {
      it('should remove all history entries', () => {
        storage.saveHistory([
          { jobId: 1, timestamp: '2024-01-01T00:00:00.000Z' },
          { jobId: 2, timestamp: '2024-01-02T00:00:00.000Z' },
        ]);
        
        const removed = storage.clearAllHistory();
        
        expect(removed).toBe(2);
        expect(storage.getHistory()).toEqual([]);
      });
    });
  });

  describe('default export', () => {
    it('should export all functions', () => {
      expect(storage.default).toBeDefined();
      expect(typeof storage.default.readJsonFile).toBe('function');
      expect(typeof storage.default.writeJsonFile).toBe('function');
      expect(typeof storage.default.getJobs).toBe('function');
      expect(typeof storage.default.saveJobs).toBe('function');
      expect(typeof storage.default.getJobById).toBe('function');
      expect(typeof storage.default.getJobByName).toBe('function');
      expect(typeof storage.default.getJob).toBe('function');
      expect(typeof storage.default.addJob).toBe('function');
      expect(typeof storage.default.updateJob).toBe('function');
      expect(typeof storage.default.removeJob).toBe('function');
    });
  });
});
