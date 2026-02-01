/**
 * SQLite-based history storage for JM2
 * Provides efficient querying, indexing, and automatic cleanup
 * Handles concurrent access through SQLite's file locking mechanism
 */

import Database from 'better-sqlite3';
import { getHistoryDbFile, ensureDataDir } from '../utils/paths.js';
import { getConfigValue } from './config.js';

// Database instance (singleton pattern)
let dbInstance = null;

/**
 * Get or create the database instance
 * Uses singleton pattern to avoid multiple connections in the same process
 * @returns {Database} SQLite database instance
 */
export function getDatabase() {
  if (!dbInstance) {
    ensureDataDir();
    const dbPath = getHistoryDbFile();

    // Open database with busy timeout for concurrent access handling
    dbInstance = new Database(dbPath);

    // Set busy timeout to 5 seconds (5000ms) - waits for locks to be released
    dbInstance.pragma('busy_timeout = 5000');

    // Enable WAL mode for better concurrent read/write performance
    dbInstance.pragma('journal_mode = WAL');

    // Enable foreign keys
    dbInstance.pragma('foreign_keys = ON');

    // Initialize schema
    initializeSchema();
  }
  return dbInstance;
}

/**
 * Initialize the database schema
 * Creates tables and indexes if they don't exist
 */
function initializeSchema() {
  const db = dbInstance;

  // Create history table
  db.exec(`
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      job_name TEXT NOT NULL,
      command TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('success', 'failed', 'running')),
      exit_code INTEGER,
      start_time TEXT NOT NULL,
      end_time TEXT,
      duration INTEGER, -- Duration in milliseconds
      error TEXT,
      timestamp TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create indexes for efficient queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_history_job_id ON history(job_id);
    CREATE INDEX IF NOT EXISTS idx_history_timestamp ON history(timestamp);
    CREATE INDEX IF NOT EXISTS idx_history_job_id_timestamp ON history(job_id, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_history_status ON history(status);
  `);
}

/**
 * Close the database connection
 * Should be called on graceful shutdown
 */
export function closeDatabase() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/**
 * Add a history entry with automatic cleanup
 * Enforces maxEntriesPerJob and retentionDays config settings
 * @param {object} entry - History entry
 * @param {number} entry.jobId - Job ID
 * @param {string} entry.jobName - Job name
 * @param {string} entry.command - Command that was executed
 * @param {string} entry.status - Execution status ('success', 'failed', 'running')
 * @param {number} [entry.exitCode] - Exit code of the command
 * @param {string} entry.startTime - ISO timestamp when execution started
 * @param {string} [entry.endTime] - ISO timestamp when execution ended
 * @param {number} [entry.duration] - Duration in milliseconds
 * @param {string} [entry.error] - Error message if failed
 * @param {string} [entry.timestamp] - Entry timestamp (defaults to now)
 * @returns {object} The inserted history entry with generated id
 */
export function addHistoryEntry(entry) {
  const db = getDatabase();

  const timestamp = entry.timestamp || new Date().toISOString();

  const insertStmt = db.prepare(`
    INSERT INTO history (job_id, job_name, command, status, exit_code, start_time, end_time, duration, error, timestamp)
    VALUES (@jobId, @jobName, @command, @status, @exitCode, @startTime, @endTime, @duration, @error, @timestamp)
  `);

  const insertData = {
    jobId: entry.jobId,
    jobName: entry.jobName,
    command: entry.command,
    status: entry.status,
    exitCode: entry.exitCode ?? null,
    startTime: entry.startTime,
    endTime: entry.endTime ?? null,
    duration: entry.duration ?? null,
    error: entry.error ?? null,
    timestamp,
  };

  const result = insertStmt.run(insertData);

  // Perform automatic cleanup based on config
  enforceRetentionPolicy(entry.jobId);

  return {
    id: result.lastInsertRowid,
    ...insertData,
  };
}

/**
 * Enforce retention policy based on config
 * Deletes old entries exceeding maxEntriesPerJob and retentionDays
 * @param {number} jobId - The job ID that just had an entry added
 */
function enforceRetentionPolicy(jobId) {
  const db = getDatabase();

  // Get config values
  const maxEntriesPerJob = getConfigValue('history.maxEntriesPerJob', 100);
  const retentionDays = getConfigValue('history.retentionDays', 30);

  // Delete oldest entries if count for this job exceeds maxEntriesPerJob
  if (maxEntriesPerJob > 0) {
    const deleteExcessStmt = db.prepare(`
      DELETE FROM history
      WHERE id IN (
        SELECT id FROM history
        WHERE job_id = @jobId
        ORDER BY timestamp DESC
        LIMIT -1 OFFSET @maxEntries
      )
    `);
    deleteExcessStmt.run({ jobId, maxEntries: maxEntriesPerJob });
  }

  // Delete entries older than retentionDays (based on created_at, not timestamp)
  // This ensures we keep historical records based on when they were inserted,
  // not based on the logical timestamp of when the job ran
  if (retentionDays > 0) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffTimestamp = cutoffDate.toISOString();

    const deleteOldStmt = db.prepare(`
      DELETE FROM history
      WHERE created_at < @cutoffTimestamp
    `);
    deleteOldStmt.run({ cutoffTimestamp });
  }
}

/**
 * Get execution history with filtering and pagination
 * @param {object} options - Query options
 * @param {number} [options.jobId] - Filter by job ID
 * @param {string} [options.status] - Filter by status ('success', 'failed', 'running')
 * @param {string} [options.since] - Filter entries after this ISO timestamp
 * @param {string} [options.until] - Filter entries before this ISO timestamp
 * @param {number} [options.limit=100] - Maximum number of entries to return
 * @param {number} [options.offset=0] - Number of entries to skip
 * @param {string} [options.order='desc'] - Sort order ('asc' or 'desc')
 * @returns {Array} Array of history entries
 */
export function getHistory(options = {}) {
  const db = getDatabase();

  const {
    jobId,
    status,
    since,
    until,
    limit = 100,
    offset = 0,
    order = 'desc',
  } = options;

  // Build query dynamically
  const conditions = [];
  const params = {};

  if (jobId !== undefined) {
    conditions.push('job_id = @jobId');
    params.jobId = jobId;
  }

  if (status) {
    conditions.push('status = @status');
    params.status = status;
  }

  if (since) {
    conditions.push('timestamp >= @since');
    params.since = since;
  }

  if (until) {
    conditions.push('timestamp <= @until');
    params.until = until;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderClause = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const query = `
    SELECT
      id,
      job_id as jobId,
      job_name as jobName,
      command,
      status,
      exit_code as exitCode,
      start_time as startTime,
      end_time as endTime,
      duration,
      error,
      timestamp
    FROM history
    ${whereClause}
    ORDER BY timestamp ${orderClause}
    LIMIT @limit OFFSET @offset
  `;

  params.limit = limit;
  params.offset = offset;

  const stmt = db.prepare(query);
  return stmt.all(params);
}

/**
 * Get history for a specific job
 * @param {number} jobId - Job ID
 * @param {number} [limit=10] - Maximum number of entries to return
 * @param {number} [offset=0] - Number of entries to skip
 * @returns {Array} Array of history entries for the job
 */
export function getJobHistory(jobId, limit = 10, offset = 0) {
  return getHistory({
    jobId,
    limit,
    offset,
    order: 'desc',
  });
}

/**
 * Get a single history entry by ID
 * @param {number} id - History entry ID
 * @returns {object|null} History entry or null if not found
 */
export function getHistoryEntryById(id) {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT
      id,
      job_id as jobId,
      job_name as jobName,
      command,
      status,
      exit_code as exitCode,
      start_time as startTime,
      end_time as endTime,
      duration,
      error,
      timestamp
    FROM history
    WHERE id = @id
  `);

  return stmt.get({ id }) || null;
}

/**
 * Get the total count of history entries
 * @param {object} options - Filter options (same as getHistory)
 * @returns {number} Total count
 */
export function getHistoryCount(options = {}) {
  const db = getDatabase();

  const { jobId, status, since, until } = options;

  const conditions = [];
  const params = {};

  if (jobId !== undefined) {
    conditions.push('job_id = @jobId');
    params.jobId = jobId;
  }

  if (status) {
    conditions.push('status = @status');
    params.status = status;
  }

  if (since) {
    conditions.push('timestamp >= @since');
    params.since = since;
  }

  if (until) {
    conditions.push('timestamp <= @until');
    params.until = until;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const query = `SELECT COUNT(*) as count FROM history ${whereClause}`;
  const stmt = db.prepare(query);
  const result = stmt.get(params);

  return result?.count || 0;
}

/**
 * Clear history older than a certain date
 * @param {Date} beforeDate - Clear entries before this date
 * @returns {number} Number of entries removed
 */
export function clearHistoryBefore(beforeDate) {
  const db = getDatabase();

  const cutoffTimestamp = beforeDate.toISOString();

  const stmt = db.prepare(`
    DELETE FROM history
    WHERE timestamp < @cutoffTimestamp
  `);

  const result = stmt.run({ cutoffTimestamp });
  return result.changes;
}

/**
 * Clear all history
 * @returns {number} Number of entries removed
 */
export function clearAllHistory() {
  const db = getDatabase();

  const stmt = db.prepare('DELETE FROM history');
  const result = stmt.run();

  // Vacuum to reclaim disk space
  db.exec('VACUUM');

  return result.changes;
}

/**
 * Clear history for a specific job
 * @param {number} jobId - Job ID
 * @returns {number} Number of entries removed
 */
export function clearJobHistory(jobId) {
  const db = getDatabase();

  const stmt = db.prepare(`
    DELETE FROM history
    WHERE job_id = @jobId
  `);

  const result = stmt.run({ jobId });
  return result.changes;
}

/**
 * Get statistics for a job
 * @param {number} jobId - Job ID
 * @returns {object} Statistics object with successCount, failedCount, totalCount, lastRun, averageDuration
 */
export function getJobStats(jobId) {
  const db = getDatabase();

  const statsStmt = db.prepare(`
    SELECT
      COUNT(*) as totalCount,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successCount,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failedCount,
      AVG(duration) as averageDuration,
      MAX(timestamp) as lastRun
    FROM history
    WHERE job_id = @jobId
  `);

  const result = statsStmt.get({ jobId });

  return {
    jobId,
    totalCount: result?.totalCount || 0,
    successCount: result?.successCount || 0,
    failedCount: result?.failedCount || 0,
    averageDuration: result?.averageDuration || 0,
    lastRun: result?.lastRun || null,
  };
}

// Export default object for compatibility
export default {
  getDatabase,
  closeDatabase,
  addHistoryEntry,
  getHistory,
  getJobHistory,
  getHistoryEntryById,
  getHistoryCount,
  clearHistoryBefore,
  clearAllHistory,
  clearJobHistory,
  getJobStats,
};
