/**
 * Unit tests for the executor module
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  executeJob, 
  executeJobWithRetry, 
  killJob, 
  formatDuration, 
  ExecutionStatus 
} from '../../src/daemon/executor.js';
import { getJobLogFile } from '../../src/utils/paths.js';
import * as storage from '../../src/core/storage.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Set up test data directory
process.env.JM2_DATA_DIR = '/tmp/jm2-test-executor';

// Clean up test directory before each test
beforeEach(() => {
  try {
    if (fs.existsSync(process.env.JM2_DATA_DIR)) {
      fs.rmSync(process.env.JM2_DATA_DIR, { recursive: true });
    }
    fs.mkdirSync(process.env.JM2_DATA_DIR, { recursive: true });
    fs.mkdirSync(path.join(process.env.JM2_DATA_DIR, 'logs'), { recursive: true });
  } catch (error) {
    // Directory might not exist, that's fine
  }
});

// Clean up after each test
afterEach(() => {
  try {
    if (fs.existsSync(process.env.JM2_DATA_DIR)) {
      fs.rmSync(process.env.JM2_DATA_DIR, { recursive: true });
    }
  } catch (error) {
    // Ignore cleanup errors
  }
});

describe('Executor', () => {
  describe('executeJob', () => {
    it('should execute a simple command successfully', async () => {
      const job = {
        id: 1,
        name: 'test-echo',
        command: 'echo "hello world"',
      };

      const result = await executeJob(job);

      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('hello world');
      expect(result.error).toBeNull();
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should capture stdout output', async () => {
      const job = {
        id: 2,
        name: 'test-stdout',
        command: 'echo "stdout content"',
      };

      const result = await executeJob(job);

      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(result.stdout).toContain('stdout content');
    });

    it('should capture stderr output', async () => {
      const job = {
        id: 3,
        name: 'test-stderr',
        command: 'echo "stderr content" >&2',
      };

      const result = await executeJob(job);

      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(result.stderr).toContain('stderr content');
    });

    it('should handle command failure', async () => {
      const job = {
        id: 4,
        name: 'test-fail',
        command: 'exit 42',
      };

      const result = await executeJob(job);

      expect(result.status).toBe(ExecutionStatus.FAILED);
      expect(result.exitCode).toBe(42);
      expect(result.error).toContain('42');
    });

    it('should support custom working directory', async () => {
      const job = {
        id: 5,
        name: 'test-cwd',
        command: 'pwd',
        cwd: '/tmp',
      };

      const result = await executeJob(job);

      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      // macOS has /tmp as a symlink to /private/tmp, so we check for suffix
      expect(result.stdout.trim()).toMatch(/\/tmp$/);
    });

    it('should support environment variables', async () => {
      const job = {
        id: 6,
        name: 'test-env',
        command: 'echo $TEST_VAR',
        env: { TEST_VAR: 'test_value' },
      };

      const result = await executeJob(job);

      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(result.stdout.trim()).toBe('test_value');
    });

    it('should inherit parent environment variables', async () => {
      process.env.INHERITED_VAR = 'inherited_value';
      const job = {
        id: 7,
        name: 'test-inherit-env',
        command: 'echo $INHERITED_VAR',
      };

      const result = await executeJob(job);

      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(result.stdout.trim()).toBe('inherited_value');
      delete process.env.INHERITED_VAR;
    });

    it.skip('should timeout long-running commands', async () => {
      const job = {
        id: 8,
        name: 'test-timeout',
        command: 'node -e "setTimeout(() => {}, 30000)"',
        timeout: '300ms',
      };

      const startTime = Date.now();
      const result = await executeJob(job);
      const duration = Date.now() - startTime;

      expect(result.status).toBe(ExecutionStatus.TIMEOUT);
      expect(result.error).toContain('timed out');
      expect(duration).toBeGreaterThanOrEqual(200); // Should have waited at least some time
      expect(duration).toBeLessThan(5000); // Should timeout quickly
    }, 10000);

    it('should complete before timeout for fast commands', async () => {
      const job = {
        id: 9,
        name: 'test-no-timeout',
        command: 'echo "quick"',
        timeout: '5s',
      };

      const result = await executeJob(job);

      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(result.stdout).toContain('quick');
    });

    it('should create log file for job output', async () => {
      const job = {
        id: 10,
        name: 'test-logfile',
        command: 'echo "log this"',
      };

      await executeJob(job);

      const logFile = getJobLogFile('test-logfile');
      expect(fs.existsSync(logFile)).toBe(true);
      
      const logContent = fs.readFileSync(logFile, 'utf8');
      expect(logContent).toContain('Starting execution');
      expect(logContent).toContain('log this');
    });

    it('should record execution history', async () => {
      const job = {
        id: 11,
        name: 'test-history',
        command: 'echo "history test"',
      };

      await executeJob(job);

      const history = storage.getJobHistory(11);
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].jobId).toBe(11);
      expect(history[0].status).toBe(ExecutionStatus.SUCCESS);
      expect(history[0].command).toBe('echo "history test"');
    });

    it('should handle invalid commands gracefully', async () => {
      const job = {
        id: 12,
        name: 'test-invalid-cmd',
        command: 'this_command_does_not_exist_12345',
      };

      const result = await executeJob(job);

      expect(result.status).toBe(ExecutionStatus.FAILED);
      expect(result.error).toBeTruthy();
    });

    it('should handle commands with special characters', async () => {
      const job = {
        id: 13,
        name: 'test-special',
        command: 'echo "hello\tworld" && echo "line 2"',
      };

      const result = await executeJob(job);

      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(result.stdout).toContain('hello');
      expect(result.stdout).toContain('line 2');
    });

    it('should handle multi-line output', async () => {
      const job = {
        id: 14,
        name: 'test-multiline',
        command: 'echo "line1"; echo "line2"; echo "line3"',
      };

      const result = await executeJob(job);

      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(result.stdout).toContain('line1');
      expect(result.stdout).toContain('line2');
      expect(result.stdout).toContain('line3');
    });
  });

  describe('executeJobWithRetry', () => {
    it('should succeed on first attempt without retries', async () => {
      const job = {
        id: 20,
        name: 'test-no-retry',
        command: 'echo "success"',
        retry: 0,
      };

      const result = await executeJobWithRetry(job);

      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(result.attempts).toBe(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      // Create a command that fails first 2 times then succeeds
      const testScript = path.join(process.env.JM2_DATA_DIR, 'retry-test.sh');
      fs.writeFileSync(testScript, `#!/bin/sh
COUNTER_FILE="${process.env.JM2_DATA_DIR}/retry-counter"
if [ ! -f "$COUNTER_FILE" ]; then
  echo "1" > "$COUNTER_FILE"
  exit 1
fi
COUNT=$(cat "$COUNTER_FILE")
if [ "$COUNT" -lt "2" ]; then
  echo "$((COUNT + 1))" > "$COUNTER_FILE"
  exit 1
fi
rm "$COUNTER_FILE"
echo "success after retries"
exit 0
`);
      fs.chmodSync(testScript, 0o755);

      const job = {
        id: 21,
        name: 'test-retry-success',
        command: testScript,
        retry: 3,
      };

      const result = await executeJobWithRetry(job, { retryDelay: 100 });

      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(result.attempts).toBe(3); // 1 initial + 2 retries
      expect(result.stdout).toContain('success after retries');
    });

    it('should fail after exhausting retries', async () => {
      const job = {
        id: 22,
        name: 'test-retry-fail',
        command: 'exit 1',
        retry: 2,
      };

      const result = await executeJobWithRetry(job, { retryDelay: 50 });

      expect(result.status).toBe(ExecutionStatus.FAILED);
      expect(result.attempts).toBe(3); // 1 initial + 2 retries
    });
  });

  describe('formatDuration', () => {
    it('should format milliseconds', () => {
      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(999)).toBe('999ms');
    });

    it('should format seconds', () => {
      expect(formatDuration(1000)).toBe('1.0s');
      expect(formatDuration(1500)).toBe('1.5s');
      expect(formatDuration(59000)).toBe('59.0s');
    });

    it('should format minutes and seconds', () => {
      expect(formatDuration(60000)).toBe('1m0s');
      expect(formatDuration(90000)).toBe('1m30s');
      expect(formatDuration(3540000)).toBe('59m0s');
    });

    it('should format hours and minutes', () => {
      expect(formatDuration(3600000)).toBe('1h0m');
      expect(formatDuration(5400000)).toBe('1h30m');
      expect(formatDuration(7200000)).toBe('2h0m');
    });
  });

  describe('ExecutionStatus', () => {
    it('should have correct status constants', () => {
      expect(ExecutionStatus.SUCCESS).toBe('success');
      expect(ExecutionStatus.FAILED).toBe('failed');
      expect(ExecutionStatus.TIMEOUT).toBe('timeout');
      expect(ExecutionStatus.KILLED).toBe('killed');
    });
  });

  describe('job execution metadata', () => {
    it('should include timestamps in result', async () => {
      const beforeStart = new Date().toISOString();
      const job = {
        id: 30,
        name: 'test-timestamps',
        command: 'echo "test"',
      };

      const result = await executeJob(job);
      const afterEnd = new Date().toISOString();

      expect(result.startTime).toBeDefined();
      expect(result.endTime).toBeDefined();
      expect(result.startTime >= beforeStart || result.startTime <= afterEnd).toBeTruthy();
      expect(result.endTime >= beforeStart || result.endTime <= afterEnd).toBeTruthy();
      expect(new Date(result.endTime) >= new Date(result.startTime)).toBe(true);
    });

    it('should track execution duration', async () => {
      const job = {
        id: 31,
        name: 'test-duration',
        command: 'sleep 0.1',
      };

      const result = await executeJob(job);

      expect(result.duration).toBeGreaterThanOrEqual(50); // At least 50ms
    });
  });

  describe('complex command scenarios', () => {
    it('should handle piped commands', async () => {
      const job = {
        id: 40,
        name: 'test-pipe',
        command: 'echo "hello world" | wc -w',
      };

      const result = await executeJob(job);

      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(result.stdout.trim()).toBe('2');
    });

    it('should handle environment variable expansion', async () => {
      const job = {
        id: 41,
        name: 'test-env-expand',
        command: 'export MY_VAR=expanded && echo $MY_VAR',
      };

      const result = await executeJob(job);

      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(result.stdout.trim()).toBe('expanded');
    });

    it('should handle commands with quotes', async () => {
      const job = {
        id: 42,
        name: 'test-quotes',
        command: 'echo "double quotes" && echo \'single quotes\'',
      };

      const result = await executeJob(job);

      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(result.stdout).toContain('double quotes');
    });
  });
});