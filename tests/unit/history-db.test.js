/**
 * Unit tests for src/core/history-db.js
 * Tests SQLite-based history storage with concurrent access handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

describe('history-db', () => {
  const originalEnv = process.env.JM2_DATA_DIR;
  let testDataDir;
  let historyDb;

  beforeEach(async () => {
    // Create a unique test directory
    testDataDir = join(tmpdir(), `jm2-history-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    process.env.JM2_DATA_DIR = testDataDir;
    mkdirSync(testDataDir, { recursive: true });

    // Re-import the module to pick up the new env var
    vi.resetModules();
    historyDb = await import('../../src/core/history-db.js');
  });

  afterEach(() => {
    // Close database connection if open
    try {
      historyDb.closeDatabase();
    } catch {
      // Ignore errors if database wasn't opened
    }

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

  describe('getDatabase', () => {
    it('should create database file on first access', () => {
      const dbPath = join(testDataDir, 'history.db');
      expect(existsSync(dbPath)).toBe(false);

      historyDb.getDatabase();

      expect(existsSync(dbPath)).toBe(true);
    });

    it('should return same instance on multiple calls (singleton)', () => {
      const db1 = historyDb.getDatabase();
      const db2 = historyDb.getDatabase();

      expect(db1).toBe(db2);
    });

    it('should create database with WAL mode enabled', () => {
      const db = historyDb.getDatabase();
      const journalMode = db.pragma('journal_mode', { simple: true });

      expect(journalMode).toBe('wal');
    });
  });

  describe('addHistoryEntry', () => {
    it('should add a history entry with all fields', () => {
      const entry = {
        jobId: 1,
        jobName: 'test-job',
        command: 'echo hello',
        status: 'success',
        exitCode: 0,
        startTime: '2024-01-01T00:00:00.000Z',
        endTime: '2024-01-01T00:00:01.000Z',
        duration: 1000,
        error: null,
      };

      const result = historyDb.addHistoryEntry(entry);

      expect(result.id).toBeDefined();
      expect(result.jobId).toBe(1);
      expect(result.jobName).toBe('test-job');
      expect(result.command).toBe('echo hello');
      expect(result.status).toBe('success');
      expect(result.timestamp).toBeDefined();
    });

    it('should add a history entry with minimal fields', () => {
      const entry = {
        jobId: 1,
        jobName: 'test-job',
        command: 'echo hello',
        status: 'running',
        startTime: '2024-01-01T00:00:00.000Z',
      };

      const result = historyDb.addHistoryEntry(entry);

      expect(result.id).toBeDefined();
      expect(result.status).toBe('running');
      expect(result.exitCode).toBeNull();
      expect(result.endTime).toBeNull();
      expect(result.duration).toBeNull();
      expect(result.error).toBeNull();
    });

    it('should auto-generate timestamp if not provided', () => {
      const entry = {
        jobId: 1,
        jobName: 'test-job',
        command: 'echo hello',
        status: 'success',
        startTime: '2024-01-01T00:00:00.000Z',
      };

      const before = new Date().toISOString();
      const result = historyDb.addHistoryEntry(entry);
      const after = new Date().toISOString();

      expect(result.timestamp).toBeDefined();
      expect(result.timestamp >= before && result.timestamp <= after).toBe(true);
    });

    it('should use provided timestamp if given', () => {
      const customTimestamp = '2023-06-15T12:30:00.000Z';
      const entry = {
        jobId: 1,
        jobName: 'test-job',
        command: 'echo hello',
        status: 'success',
        startTime: '2024-01-01T00:00:00.000Z',
        timestamp: customTimestamp,
      };

      const result = historyDb.addHistoryEntry(entry);

      expect(result.timestamp).toBe(customTimestamp);
    });
  });

  describe('getHistory', () => {
    it('should return all history entries by default', () => {
      // Add test entries inline
      historyDb.addHistoryEntry({
        jobId: 1,
        jobName: 'job-1',
        command: 'echo 1',
        status: 'success',
        startTime: '2024-01-01T00:00:00.000Z',
        timestamp: '2024-01-01T00:00:00.000Z',
      });
      historyDb.addHistoryEntry({
        jobId: 2,
        jobName: 'job-2',
        command: 'echo 2',
        status: 'failed',
        startTime: '2024-01-02T00:00:00.000Z',
        timestamp: '2024-01-02T00:00:00.000Z',
        error: 'Error message',
      });
      historyDb.addHistoryEntry({
        jobId: 1,
        jobName: 'job-1',
        command: 'echo 3',
        status: 'success',
        startTime: '2024-01-03T00:00:00.000Z',
        timestamp: '2024-01-03T00:00:00.000Z',
      });

      const history = historyDb.getHistory();

      expect(history).toHaveLength(3);
    });

    it('should filter by jobId', () => {
      historyDb.addHistoryEntry({
        jobId: 1,
        jobName: 'job-1',
        command: 'echo 1',
        status: 'success',
        startTime: '2024-01-01T00:00:00.000Z',
        timestamp: '2024-01-01T00:00:00.000Z',
      });
      historyDb.addHistoryEntry({
        jobId: 2,
        jobName: 'job-2',
        command: 'echo 2',
        status: 'failed',
        startTime: '2024-01-02T00:00:00.000Z',
        timestamp: '2024-01-02T00:00:00.000Z',
      });
      historyDb.addHistoryEntry({
        jobId: 1,
        jobName: 'job-1',
        command: 'echo 3',
        status: 'success',
        startTime: '2024-01-03T00:00:00.000Z',
        timestamp: '2024-01-03T00:00:00.000Z',
      });

      const history = historyDb.getHistory({ jobId: 1 });

      expect(history).toHaveLength(2);
      expect(history.every(h => h.jobId === 1)).toBe(true);
    });

    it('should filter by status', () => {
      historyDb.addHistoryEntry({
        jobId: 1,
        jobName: 'job-1',
        command: 'echo 1',
        status: 'success',
        startTime: '2024-01-01T00:00:00.000Z',
        timestamp: '2024-01-01T00:00:00.000Z',
      });
      historyDb.addHistoryEntry({
        jobId: 2,
        jobName: 'job-2',
        command: 'echo 2',
        status: 'failed',
        startTime: '2024-01-02T00:00:00.000Z',
        timestamp: '2024-01-02T00:00:00.000Z',
      });
      historyDb.addHistoryEntry({
        jobId: 1,
        jobName: 'job-1',
        command: 'echo 3',
        status: 'success',
        startTime: '2024-01-03T00:00:00.000Z',
        timestamp: '2024-01-03T00:00:00.000Z',
      });

      const history = historyDb.getHistory({ status: 'success' });

      expect(history).toHaveLength(2);
      expect(history.every(h => h.status === 'success')).toBe(true);
    });

    it('should filter by since timestamp', () => {
      historyDb.addHistoryEntry({
        jobId: 1,
        jobName: 'job-1',
        command: 'echo 1',
        status: 'success',
        startTime: '2024-01-01T00:00:00.000Z',
        timestamp: '2024-01-01T00:00:00.000Z',
      });
      historyDb.addHistoryEntry({
        jobId: 2,
        jobName: 'job-2',
        command: 'echo 2',
        status: 'failed',
        startTime: '2024-01-02T00:00:00.000Z',
        timestamp: '2024-01-02T00:00:00.000Z',
      });
      historyDb.addHistoryEntry({
        jobId: 1,
        jobName: 'job-1',
        command: 'echo 3',
        status: 'success',
        startTime: '2024-01-03T00:00:00.000Z',
        timestamp: '2024-01-03T00:00:00.000Z',
      });

      const history = historyDb.getHistory({ since: '2024-01-02T00:00:00.000Z' });

      expect(history).toHaveLength(2);
    });

    it('should filter by until timestamp', () => {
      historyDb.addHistoryEntry({
        jobId: 1,
        jobName: 'job-1',
        command: 'echo 1',
        status: 'success',
        startTime: '2024-01-01T00:00:00.000Z',
        timestamp: '2024-01-01T00:00:00.000Z',
      });
      historyDb.addHistoryEntry({
        jobId: 2,
        jobName: 'job-2',
        command: 'echo 2',
        status: 'failed',
        startTime: '2024-01-02T00:00:00.000Z',
        timestamp: '2024-01-02T00:00:00.000Z',
      });
      historyDb.addHistoryEntry({
        jobId: 1,
        jobName: 'job-1',
        command: 'echo 3',
        status: 'success',
        startTime: '2024-01-03T00:00:00.000Z',
        timestamp: '2024-01-03T00:00:00.000Z',
      });

      const history = historyDb.getHistory({ until: '2024-01-02T00:00:00.000Z' });

      expect(history).toHaveLength(2);
    });

    it('should apply limit', () => {
      for (let i = 0; i < 5; i++) {
        historyDb.addHistoryEntry({
          jobId: 1,
          jobName: 'job-1',
          command: `echo ${i}`,
          status: 'success',
          startTime: `2024-01-0${i + 1}T00:00:00.000Z`,
          timestamp: `2024-01-0${i + 1}T00:00:00.000Z`,
        });
      }

      const history = historyDb.getHistory({ limit: 2 });

      expect(history).toHaveLength(2);
    });

    it('should apply offset', () => {
      for (let i = 0; i < 5; i++) {
        historyDb.addHistoryEntry({
          jobId: 1,
          jobName: 'job-1',
          command: `echo ${i}`,
          status: 'success',
          startTime: `2024-01-0${i + 1}T00:00:00.000Z`,
          timestamp: `2024-01-0${i + 1}T00:00:00.000Z`,
        });
      }

      const history = historyDb.getHistory({ offset: 2, limit: 10 });

      expect(history).toHaveLength(3);
    });

    it('should sort by timestamp descending by default', () => {
      historyDb.addHistoryEntry({
        jobId: 1,
        jobName: 'job-1',
        command: 'echo 1',
        status: 'success',
        startTime: '2024-01-01T00:00:00.000Z',
        timestamp: '2024-01-01T00:00:00.000Z',
      });
      historyDb.addHistoryEntry({
        jobId: 1,
        jobName: 'job-1',
        command: 'echo 2',
        status: 'success',
        startTime: '2024-01-02T00:00:00.000Z',
        timestamp: '2024-01-02T00:00:00.000Z',
      });
      historyDb.addHistoryEntry({
        jobId: 1,
        jobName: 'job-1',
        command: 'echo 3',
        status: 'success',
        startTime: '2024-01-03T00:00:00.000Z',
        timestamp: '2024-01-03T00:00:00.000Z',
      });

      const history = historyDb.getHistory();

      expect(history[0].timestamp).toBe('2024-01-03T00:00:00.000Z');
      expect(history[2].timestamp).toBe('2024-01-01T00:00:00.000Z');
    });

    it('should sort ascending when specified', () => {
      historyDb.addHistoryEntry({
        jobId: 1,
        jobName: 'job-1',
        command: 'echo 1',
        status: 'success',
        startTime: '2024-01-01T00:00:00.000Z',
        timestamp: '2024-01-01T00:00:00.000Z',
      });
      historyDb.addHistoryEntry({
        jobId: 1,
        jobName: 'job-1',
        command: 'echo 2',
        status: 'success',
        startTime: '2024-01-02T00:00:00.000Z',
        timestamp: '2024-01-02T00:00:00.000Z',
      });
      historyDb.addHistoryEntry({
        jobId: 1,
        jobName: 'job-1',
        command: 'echo 3',
        status: 'success',
        startTime: '2024-01-03T00:00:00.000Z',
        timestamp: '2024-01-03T00:00:00.000Z',
      });

      const history = historyDb.getHistory({ order: 'asc' });

      expect(history[0].timestamp).toBe('2024-01-01T00:00:00.000Z');
      expect(history[2].timestamp).toBe('2024-01-03T00:00:00.000Z');
    });

    it('should combine multiple filters', () => {
      historyDb.addHistoryEntry({
        jobId: 1,
        jobName: 'job-1',
        command: 'echo 1',
        status: 'success',
        startTime: '2024-01-01T00:00:00.000Z',
        timestamp: '2024-01-01T00:00:00.000Z',
      });
      historyDb.addHistoryEntry({
        jobId: 1,
        jobName: 'job-1',
        command: 'echo 2',
        status: 'failed',
        startTime: '2024-01-02T00:00:00.000Z',
        timestamp: '2024-01-02T00:00:00.000Z',
      });
      historyDb.addHistoryEntry({
        jobId: 1,
        jobName: 'job-1',
        command: 'echo 3',
        status: 'success',
        startTime: '2024-01-03T00:00:00.000Z',
        timestamp: '2024-01-03T00:00:00.000Z',
      });

      const history = historyDb.getHistory({
        jobId: 1,
        status: 'success',
        since: '2024-01-02T00:00:00.000Z',
      });

      expect(history).toHaveLength(1);
      expect(history[0].jobId).toBe(1);
      expect(history[0].status).toBe('success');
    });
  });

  describe('getJobHistory', () => {
    it('should return history for specific job', () => {
      // Add test entries for job 1
      for (let i = 0; i < 5; i++) {
        historyDb.addHistoryEntry({
          jobId: 1,
          jobName: 'job-1',
          command: `echo ${i}`,
          status: 'success',
          startTime: `2024-01-0${i + 1}T00:00:00.000Z`,
          timestamp: `2024-01-0${i + 1}T00:00:00.000Z`,
        });
      }
      // Add entry for job 2
      historyDb.addHistoryEntry({
        jobId: 2,
        jobName: 'job-2',
        command: 'echo other',
        status: 'success',
        startTime: '2024-01-01T00:00:00.000Z',
        timestamp: '2024-01-01T00:00:00.000Z',
      });

      const history = historyDb.getJobHistory(1);

      expect(history).toHaveLength(5);
      expect(history.every(h => h.jobId === 1)).toBe(true);
    });

    it('should apply limit', () => {
      for (let i = 0; i < 5; i++) {
        historyDb.addHistoryEntry({
          jobId: 1,
          jobName: 'job-1',
          command: `echo ${i}`,
          status: 'success',
          startTime: `2024-01-0${i + 1}T00:00:00.000Z`,
          timestamp: `2024-01-0${i + 1}T00:00:00.000Z`,
        });
      }

      const history = historyDb.getJobHistory(1, 3);

      expect(history).toHaveLength(3);
    });

    it('should return empty array for non-existent job', () => {
      const history = historyDb.getJobHistory(999);

      expect(history).toEqual([]);
    });

    it('should sort by timestamp descending', () => {
      for (let i = 0; i < 5; i++) {
        historyDb.addHistoryEntry({
          jobId: 1,
          jobName: 'job-1',
          command: `echo ${i}`,
          status: 'success',
          startTime: `2024-01-0${i + 1}T00:00:00.000Z`,
          timestamp: `2024-01-0${i + 1}T00:00:00.000Z`,
        });
      }

      const history = historyDb.getJobHistory(1, 10);

      expect(history[0].timestamp).toBe('2024-01-05T00:00:00.000Z');
      expect(history[4].timestamp).toBe('2024-01-01T00:00:00.000Z');
    });
  });

  describe('getHistoryEntryById', () => {
    it('should return entry by id', () => {
      const added = historyDb.addHistoryEntry({
        jobId: 1,
        jobName: 'test-job',
        command: 'echo hello',
        status: 'success',
        startTime: '2024-01-01T00:00:00.000Z',
      });

      const retrieved = historyDb.getHistoryEntryById(added.id);

      expect(retrieved).toBeDefined();
      expect(retrieved.id).toBe(added.id);
      expect(retrieved.jobName).toBe('test-job');
    });

    it('should return null for non-existent id', () => {
      const retrieved = historyDb.getHistoryEntryById(999);

      expect(retrieved).toBeNull();
    });
  });

  describe('getHistoryCount', () => {
    it('should return total count', () => {
      historyDb.addHistoryEntry({
        jobId: 1,
        jobName: 'job-1',
        command: 'echo 1',
        status: 'success',
        startTime: '2024-01-01T00:00:00.000Z',
        timestamp: '2024-01-01T00:00:00.000Z',
      });
      historyDb.addHistoryEntry({
        jobId: 1,
        jobName: 'job-1',
        command: 'echo 2',
        status: 'failed',
        startTime: '2024-01-02T00:00:00.000Z',
        timestamp: '2024-01-02T00:00:00.000Z',
      });
      historyDb.addHistoryEntry({
        jobId: 2,
        jobName: 'job-2',
        command: 'echo 3',
        status: 'success',
        startTime: '2024-01-03T00:00:00.000Z',
        timestamp: '2024-01-03T00:00:00.000Z',
      });

      const count = historyDb.getHistoryCount();

      expect(count).toBe(3);
    });

    it('should filter by jobId', () => {
      historyDb.addHistoryEntry({
        jobId: 1,
        jobName: 'job-1',
        command: 'echo 1',
        status: 'success',
        startTime: '2024-01-01T00:00:00.000Z',
        timestamp: '2024-01-01T00:00:00.000Z',
      });
      historyDb.addHistoryEntry({
        jobId: 1,
        jobName: 'job-1',
        command: 'echo 2',
        status: 'failed',
        startTime: '2024-01-02T00:00:00.000Z',
        timestamp: '2024-01-02T00:00:00.000Z',
      });
      historyDb.addHistoryEntry({
        jobId: 2,
        jobName: 'job-2',
        command: 'echo 3',
        status: 'success',
        startTime: '2024-01-03T00:00:00.000Z',
        timestamp: '2024-01-03T00:00:00.000Z',
      });

      const count = historyDb.getHistoryCount({ jobId: 1 });

      expect(count).toBe(2);
    });

    it('should filter by status', () => {
      historyDb.addHistoryEntry({
        jobId: 1,
        jobName: 'job-1',
        command: 'echo 1',
        status: 'success',
        startTime: '2024-01-01T00:00:00.000Z',
        timestamp: '2024-01-01T00:00:00.000Z',
      });
      historyDb.addHistoryEntry({
        jobId: 1,
        jobName: 'job-1',
        command: 'echo 2',
        status: 'failed',
        startTime: '2024-01-02T00:00:00.000Z',
        timestamp: '2024-01-02T00:00:00.000Z',
      });
      historyDb.addHistoryEntry({
        jobId: 2,
        jobName: 'job-2',
        command: 'echo 3',
        status: 'success',
        startTime: '2024-01-03T00:00:00.000Z',
        timestamp: '2024-01-03T00:00:00.000Z',
      });

      const count = historyDb.getHistoryCount({ status: 'success' });

      expect(count).toBe(2);
    });
  });

  describe('clearHistoryBefore', () => {
    it('should remove entries before specified date', () => {
      historyDb.addHistoryEntry({
        jobId: 1,
        jobName: 'job-1',
        command: 'echo old',
        status: 'success',
        startTime: '2024-01-01T00:00:00.000Z',
        timestamp: '2024-01-01T00:00:00.000Z',
      });
      historyDb.addHistoryEntry({
        jobId: 1,
        jobName: 'job-1',
        command: 'echo middle',
        status: 'success',
        startTime: '2024-01-15T00:00:00.000Z',
        timestamp: '2024-01-15T00:00:00.000Z',
      });
      historyDb.addHistoryEntry({
        jobId: 1,
        jobName: 'job-1',
        command: 'echo new',
        status: 'success',
        startTime: '2024-02-01T00:00:00.000Z',
        timestamp: '2024-02-01T00:00:00.000Z',
      });

      const cutoffDate = new Date('2024-01-10T00:00:00.000Z');
      const removed = historyDb.clearHistoryBefore(cutoffDate);

      expect(removed).toBe(1);

      const remaining = historyDb.getHistory();
      expect(remaining).toHaveLength(2);
      expect(remaining.every(h => h.timestamp >= '2024-01-10T00:00:00.000Z')).toBe(true);
    });

    it('should return 0 when no entries match', () => {
      historyDb.addHistoryEntry({
        jobId: 1,
        jobName: 'job-1',
        command: 'echo test',
        status: 'success',
        startTime: '2024-01-01T00:00:00.000Z',
        timestamp: '2024-01-01T00:00:00.000Z',
      });

      const cutoffDate = new Date('2023-01-01T00:00:00.000Z');
      const removed = historyDb.clearHistoryBefore(cutoffDate);

      expect(removed).toBe(0);
    });
  });

  describe('clearAllHistory', () => {
    it('should remove all entries', () => {
      historyDb.addHistoryEntry({
        jobId: 1,
        jobName: 'job-1',
        command: 'echo 1',
        status: 'success',
        startTime: '2024-01-01T00:00:00.000Z',
      });
      historyDb.addHistoryEntry({
        jobId: 2,
        jobName: 'job-2',
        command: 'echo 2',
        status: 'success',
        startTime: '2024-01-01T00:00:00.000Z',
      });

      const removed = historyDb.clearAllHistory();

      expect(removed).toBe(2);

      const remaining = historyDb.getHistory();
      expect(remaining).toHaveLength(0);
    });

    it('should return 0 when no entries exist', () => {
      const removed = historyDb.clearAllHistory();

      expect(removed).toBe(0);
    });
  });

  describe('clearJobHistory', () => {
    it('should remove entries for specific job', () => {
      historyDb.addHistoryEntry({
        jobId: 1,
        jobName: 'job-1',
        command: 'echo 1',
        status: 'success',
        startTime: '2024-01-01T00:00:00.000Z',
      });
      historyDb.addHistoryEntry({
        jobId: 1,
        jobName: 'job-1',
        command: 'echo 2',
        status: 'success',
        startTime: '2024-01-02T00:00:00.000Z',
      });
      historyDb.addHistoryEntry({
        jobId: 2,
        jobName: 'job-2',
        command: 'echo 3',
        status: 'success',
        startTime: '2024-01-01T00:00:00.000Z',
      });

      const removed = historyDb.clearJobHistory(1);

      expect(removed).toBe(2);

      const job1History = historyDb.getJobHistory(1);
      expect(job1History).toHaveLength(0);

      const job2History = historyDb.getJobHistory(2);
      expect(job2History).toHaveLength(1);
    });

    it('should return 0 for non-existent job', () => {
      historyDb.addHistoryEntry({
        jobId: 1,
        jobName: 'job-1',
        command: 'echo 1',
        status: 'success',
        startTime: '2024-01-01T00:00:00.000Z',
      });

      const removed = historyDb.clearJobHistory(999);

      expect(removed).toBe(0);
    });
  });

  describe('getJobStats', () => {
    it('should return correct statistics', () => {
      historyDb.addHistoryEntry({
        jobId: 1,
        jobName: 'job-1',
        command: 'echo 1',
        status: 'success',
        startTime: '2024-01-01T00:00:00.000Z',
        timestamp: '2024-01-01T00:00:00.000Z',
        duration: 1000,
      });
      historyDb.addHistoryEntry({
        jobId: 1,
        jobName: 'job-1',
        command: 'echo 2',
        status: 'success',
        startTime: '2024-01-02T00:00:00.000Z',
        timestamp: '2024-01-02T00:00:00.000Z',
        duration: 2000,
      });
      historyDb.addHistoryEntry({
        jobId: 1,
        jobName: 'job-1',
        command: 'echo 3',
        status: 'failed',
        startTime: '2024-01-03T00:00:00.000Z',
        timestamp: '2024-01-03T00:00:00.000Z',
        duration: 500,
      });

      const stats = historyDb.getJobStats(1);

      expect(stats.jobId).toBe(1);
      expect(stats.totalCount).toBe(3);
      expect(stats.successCount).toBe(2);
      expect(stats.failedCount).toBe(1);
      expect(stats.averageDuration).toBeCloseTo(1166.67, 0);
      expect(stats.lastRun).toBe('2024-01-03T00:00:00.000Z');
    });

    it('should return zero stats for non-existent job', () => {
      const stats = historyDb.getJobStats(999);

      expect(stats.jobId).toBe(999);
      expect(stats.totalCount).toBe(0);
      expect(stats.successCount).toBe(0);
      expect(stats.failedCount).toBe(0);
      expect(stats.averageDuration).toBe(0);
      expect(stats.lastRun).toBeNull();
    });
  });

  describe('closeDatabase', () => {
    it('should close database connection', () => {
      historyDb.getDatabase();
      expect(() => historyDb.closeDatabase()).not.toThrow();
    });

    it('should not throw if database was not opened', () => {
      expect(() => historyDb.closeDatabase()).not.toThrow();
    });
  });
});
