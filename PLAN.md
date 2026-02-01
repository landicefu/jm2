# JM2 Implementation Plan

This document outlines the step-by-step implementation plan for JM2 (Job Manager 2). Each step is designed to be testable independently.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLI (commander.js)                       │
├─────────────────────────────────────────────────────────────────┤
│                      IPC Communication Layer                     │
│                    (Unix Socket / Named Pipe)                    │
├─────────────────────────────────────────────────────────────────┤
│                         Daemon Process                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  Scheduler  │  │  Executor   │  │  Storage (JSON files)   │  │
│  │  (cron +    │  │  (spawn     │  │  - jobs.json            │  │
│  │   one-time) │  │   commands) │  │  - config.json          │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
jm2/
├── package.json
├── README.md
├── PLAN.md
├── .gitignore
├── bin/
│   └── jm2.js              # CLI entry point
├── src/
│   ├── cli/
│   │   ├── index.js        # CLI setup and command registration
│   │   ├── commands/
│   │   │   ├── start.js    # jm2 start
│   │   │   ├── stop.js     # jm2 stop
│   │   │   ├── restart.js  # jm2 restart
│   │   │   ├── status.js   # jm2 status
│   │   │   ├── add.js      # jm2 add
│   │   │   ├── list.js     # jm2 list
│   │   │   ├── show.js     # jm2 show
│   │   │   ├── remove.js   # jm2 remove
│   │   │   ├── pause.js    # jm2 pause
│   │   │   ├── resume.js   # jm2 resume
│   │   │   ├── run.js      # jm2 run
│   │   │   ├── edit.js     # jm2 edit
│   │   │   ├── logs.js     # jm2 logs
│   │   │   ├── history.js  # jm2 history
│   │   │   ├── flush.js    # jm2 flush
│   │   │   ├── export.js   # jm2 export
│   │   │   └── import.js   # jm2 import
│   │   └── utils/
│   │       ├── output.js   # Table formatting, colors
│   │       └── prompts.js  # Confirmation prompts
│   ├── daemon/
│   │   ├── index.js        # Daemon entry point
│   │   ├── scheduler.js    # Job scheduling logic
│   │   ├── executor.js     # Command execution
│   │   └── ipc-server.js   # IPC server for CLI communication
│   ├── core/
│   │   ├── storage.js      # JSON file persistence
│   │   ├── job.js          # Job model and validation
│   │   ├── config.js       # Configuration management
│   │   └── logger.js       # Logging utilities
│   ├── ipc/
│   │   ├── client.js       # IPC client (used by CLI)
│   │   ├── server.js       # IPC server (used by daemon)
│   │   └── protocol.js     # Message protocol definitions
│   └── utils/
│       ├── duration.js     # Duration parsing (30m, 2h, etc.)
│       ├── cron.js         # Cron expression utilities
│       └── paths.js        # Path utilities (~/.jm2/)
└── tests/
    ├── unit/
    │   ├── duration.test.js
    │   ├── cron.test.js
    │   ├── job.test.js
    │   └── storage.test.js
    └── integration/
        ├── daemon.test.js
        └── cli.test.js
```

---

## Implementation Steps

> **Note for Agents:** After completing each phase, update this PLAN.md to mark completed tasks with `[x]` and commit the changes. This helps track progress for subsequent agents.

### Progress Overview

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1: Foundation | ✅ Complete | Core utilities, storage, job model, config, logger |
| Phase 2: Daemon Core | ✅ Complete | Daemon process, PID management, IPC communication |
| Phase 3: CLI Foundation | ✅ Complete | CLI entry point, daemon commands (start/stop/restart/status) |
| Phase 4: Job Scheduling | ✅ Complete | Cron scheduler, one-time job scheduler |
| Phase 5: Job Execution | ✅ Complete | Command executor, retry logic |
| Phase 6: Job Management | ✅ Complete | add/list/show/remove/pause/resume/run/edit commands |
| Phase 7: Logs and History | ✅ Complete | logs/history commands, log rotation |
| Phase 8: Utility Commands | ⏳ Pending | flush, export, import commands |
| Phase 9: Polish | ⏳ Pending | Error handling, edge cases, persistence |
| Phase 11: SQLite History | ✅ Complete | Migrate history from JSON to SQLite with config enforcement |

---

### Phase 1: Foundation ✅ COMPLETE

#### Step 1.1: Project Setup and Core Utilities
**Goal:** Set up the project structure and implement basic utilities.

**Tasks:**
- [x] Create package.json with dependencies
- [x] Create .gitignore
- [x] Create `src/utils/paths.js` - Path utilities for ~/.jm2/
- [x] Create `src/utils/duration.js` - Duration parsing
- [x] Create `src/core/logger.js` - Basic logging

**Test:**
```bash
# Unit tests for duration parsing
npm test -- --grep "duration"

# Verify paths resolve correctly
node -e "const paths = require('./src/utils/paths'); console.log(paths.getDataDir())"
```

#### Step 1.2: Storage Layer ✅ COMPLETE
**Goal:** Implement JSON file persistence for jobs and config.

**Tasks:**
- [x] Create `src/core/storage.js` - Read/write JSON files
- [x] Create `src/core/config.js` - Configuration management
- [x] Create `src/core/job.js` - Job model with validation

**Test:**
```bash
# Unit tests for storage
npm test -- --grep "storage"

# Manual test: create, read, update, delete jobs
node -e "
const storage = require('./src/core/storage');
storage.saveJob({ id: 1, name: 'test', command: 'echo hi' });
console.log(storage.getJobs());
"
```

---

### Phase 2: Daemon Core ✅ COMPLETE

#### Step 2.1: Basic Daemon Process ✅ COMPLETE
**Goal:** Create a daemon that can start, run in background, and stop.

**Tasks:**
- [x] Create `src/daemon/index.js` - Daemon entry point
- [x] Implement daemonization (fork and detach)
- [x] Implement PID file management
- [x] Implement graceful shutdown

**Test:**
```bash
# Start daemon manually
node src/daemon/index.js &

# Check PID file exists
cat ~/.jm2/daemon.pid

# Stop daemon
kill $(cat ~/.jm2/daemon.pid)
```

#### Step 2.2: IPC Communication ✅ COMPLETE
**Goal:** Enable CLI to communicate with daemon via Unix socket.

**Tasks:**
- [x] Create `src/ipc/protocol.js` - Message format definitions
- [x] Create `src/ipc/server.js` - IPC server for daemon
- [x] Create `src/ipc/client.js` - IPC client for CLI
- [x] Integrate IPC server into daemon

**Test:**
```bash
# Start daemon
node src/daemon/index.js &

# Test IPC communication
node -e "
const client = require('./src/ipc/client');
client.send({ type: 'ping' }).then(console.log);
"
# Should receive: { type: 'pong' }
```

---

### Phase 3: CLI Foundation ✅ COMPLETE

#### Step 3.1: CLI Setup and Daemon Commands ✅ COMPLETE
**Goal:** Implement basic CLI structure and daemon management commands.

**Tasks:**
- [x] Create `bin/jm2.js` - CLI entry point
- [x] Create `src/cli/index.js` - Commander.js setup
- [x] Create `src/cli/commands/start.js` - `jm2 start`
- [x] Create `src/cli/commands/stop.js` - `jm2 stop`
- [x] Create `src/cli/commands/restart.js` - `jm2 restart`
- [x] Create `src/cli/commands/status.js` - `jm2 status`
- [x] Create `src/cli/utils/output.js` - Output formatting

**Completed:** All daemon management commands are working. Tests pass. Commit: `1385d7f`

**Test:**
```bash
# Link CLI globally for testing
npm link

# Test daemon commands
jm2 start
jm2 status
jm2 stop
jm2 restart
```

---

### Phase 4: Job Scheduling ✅ COMPLETE

#### Step 4.1: Cron Scheduler ✅ COMPLETE
**Goal:** Implement periodic job scheduling using cron expressions.

**Tasks:**
- [x] Create `src/utils/cron.js` - Cron expression utilities
- [x] Create `src/daemon/scheduler.js` - Job scheduler
- [x] Implement cron job scheduling
- [x] Implement next run time calculation

**Completed:**
- Created cron expression utilities with validation, next run time calculation, and presets. Commit: `97815be`
- Created `src/daemon/scheduler.js` with full job scheduling support including:
  - Cron job scheduling with next run calculation
  - One-time job scheduling (`--at` support)
  - Job status management (active, paused, completed)
  - Due job detection via tick/check mechanism
  - Job CRUD operations (add, remove, update)
  - Scheduler statistics
- Created comprehensive unit tests (36 tests, all passing)

**Test:**
```bash
# Unit test cron parsing - PASSING (35 tests)
npm run test:run -- --reporter=dot tests/unit/cron.test.js
```

#### Step 4.2: One-time Job Scheduler ✅ COMPLETE
**Goal:** Implement one-time job scheduling (at and in).

**Tasks:**
- [x] Extend scheduler for one-time jobs (already supported in scheduler.js)
- [x] Create `src/utils/datetime.js` - datetime parsing utilities
- [x] Implement `--at` datetime parsing (ISO 8601, date/time, today/tomorrow keywords)
- [x] Implement `--in` relative time parsing (converts duration to future datetime)
- [x] Handle expired one-time jobs on daemon restart (mark as FAILED with error message)

**Completed:**
- Created `src/utils/datetime.js` with comprehensive datetime parsing:
  - `parseDateTime()` - supports ISO 8601, "2026-01-31", "today 10:00", "tomorrow 14:30", "now"
  - `parseRunIn()` - converts duration strings like "1h30m" to future Date
  - `parseRunAtOption()` - unified interface for --at and --in options
  - `isDateTimePast()` - checks if a datetime has expired
  - `formatDateTime()` - formats dates for display
  - `getRelativeTimeDescription()` - human-readable relative time
- Added `handleExpiredOneTimeJobs()` to scheduler to handle missed one-time jobs on daemon restart
- Created comprehensive tests (60+ tests for datetime utilities, 6 tests for expired job handling)
- All 358 tests passing

**Test:**
```bash
# Run all tests
npm run test:run -- --reporter=dot

# Test one-time job with --in
jm2 add "echo 'hello'" --in 1m --name test-once
jm2 list
# Wait 1 minute
jm2 logs test-once
jm2 list  # Job should be marked as completed
```

---

### Phase 5: Job Execution

#### Step 5.1: Command Executor ✅ COMPLETE
**Goal:** Implement command execution with proper process management.

**Tasks:**
- [x] Create `src/daemon/executor.js` - Command execution
- [x] Implement spawn with shell
- [x] Implement working directory support
- [x] Implement environment variables
- [x] Implement timeout handling (process group killing for proper cleanup)
- [x] Implement output capture and logging

**Completed:**
- Created `src/daemon/executor.js` with comprehensive command execution support:
  - `executeJob()` - Execute a single job with full process management
  - `executeJobWithRetry()` - Execute with automatic retry on failure
  - `killJob()` - Kill running processes (with process group support)
  - `formatDuration()` - Human-readable duration formatting
  - Process group management via `detached: true` for proper cleanup of child processes
  - Timeout handling with SIGTERM -> SIGKILL escalation
  - stdout/stderr capture and logging to job-specific log files
  - Execution history recording via storage module
- Created comprehensive unit tests (26 tests passing, 1 skipped for timeout edge case)

**Test:**
```bash
# Test job with working directory
jm2 add "pwd" --cron "* * * * *" --name test-cwd --cwd /tmp
jm2 run test-cwd --wait
# Should output: /tmp

# Test job with environment
jm2 add "echo \$MY_VAR" --cron "* * * * *" --name test-env --env MY_VAR=hello
jm2 run test-env --wait
# Should output: hello

# Test timeout
jm2 add "sleep 60" --cron "* * * * *" --name test-timeout --timeout 5s
jm2 run test-timeout --wait
# Should timeout after 5 seconds
```

#### Step 5.2: Retry Logic ✅ COMPLETE
**Goal:** Implement retry on failure.

**Tasks:**
- [x] Add retry count to job model (retry and retryCount fields in JOB_DEFAULTS)
- [x] Implement retry logic in executor (executeJobWithRetry with configurable delay)
- [x] Track retry attempts in history (each attempt recorded separately)

**Completed:**
- Job model already has `retry` (max retries) and `retryCount` (current retry count) fields
- `executeJobWithRetry()` function implemented with:
  - Configurable retry count via job.retry
  - Configurable delay between retries (default 1s)
  - Returns attempt count in result
  - Logs retry attempts
- Each execution attempt is recorded separately in history
- All tests passing (26 executor tests including 3 retry-specific tests)

**Test:**
```bash
# Unit tests for retry logic
npm run test:run -- --reporter=dot tests/unit/executor.test.js

# Manual test
jm2 add "exit 1" --cron "* * * * *" --name test-retry --retry 3
jm2 run test-retry --wait
jm2 history test-retry
# Should show 4 attempts (1 original + 3 retries)
```

---

### Phase 6: Job Management Commands

#### Step 6.1: Add and List Commands ✅ COMPLETE
**Goal:** Implement `jm2 add` and `jm2 list`.

**Tasks:**
- [x] Create `src/cli/commands/add.js` - Full implementation
- [x] Create `src/cli/commands/list.js` - Table output
- [x] Implement all add options (cron, at, delay, tags, etc.)
- [x] Implement list filters (tag, status, type)

**Completed:**
- Created `src/cli/commands/add.js` with comprehensive job creation support:
  - `--cron` for recurring jobs with cron expressions
  - `--at` for one-time jobs at specific datetime (ISO 8601, "today 10:00", "tomorrow 14:30")
  - `--delay` for one-time jobs after duration (e.g., "30m", "2h", "1d")
  - `--name` for job naming
  - `--tag` for tagging (can be used multiple times)
  - `--cwd` for working directory
  - `--env` for environment variables
  - `--timeout` for execution timeout
  - `--retry` for retry count
- Created `src/cli/commands/list.js` with job listing features:
  - Table output with ID, Name, Status, Schedule, Next Run, Last Run
  - `--verbose` for detailed job information
  - Filters: `--tag`, `--status`, `--type`
- Updated IPC protocol with job management message types
- Updated daemon to integrate scheduler and handle job IPC messages
- All 384 tests passing

**Test:**
```bash
# Add cron job
jm2 add "echo test" --cron "0 * * * *" --name hourly --tag test

# Add one-time job with delay
jm2 add "echo once" --delay "5m" --name delayed-job

# Add one-time job at specific time
jm2 add "echo midnight" --at "tomorrow 00:00" --name midnight

# List jobs
jm2 list
jm2 list --tag test
jm2 list --verbose
jm2 list --type cron
jm2 list --status active
```

#### Step 6.2: Show, Remove, Pause, Resume Commands ✅ COMPLETE
**Goal:** Implement job inspection and state management.

**Tasks:**
- [x] Create `src/cli/commands/show.js` - Shows detailed job information
- [x] Create `src/cli/commands/remove.js` - Removes jobs with confirmation (--force to skip)
- [x] Create `src/cli/commands/pause.js` - Pauses jobs (prevents execution)
- [x] Create `src/cli/commands/resume.js` - Resumes paused jobs
- [x] Create `src/cli/utils/prompts.js` - Confirmation prompts utility
- [x] Update `src/cli/index.js` - Registered all new commands

**Completed:**
- Created `show.js` with comprehensive job detail display including:
  - Basic info (ID, Name, Status, Type)
  - Schedule info (cron/runAt, next run, last run)
  - Command details with working directory and environment variables
  - Tags, timeout, retry settings
  - Creation/update timestamps and execution history
- Created `remove.js` supporting:
  - Single or multiple job removal
  - Job lookup by ID or name
  - Confirmation prompt (skip with --force)
  - Summary of successes/failures
- Created `pause.js` and `resume.js` with:
  - Support for multiple jobs at once
  - Job lookup by ID or name
  - Success/failure reporting
- Created `prompts.js` with `confirm()` and `confirmDestructive()` helpers
- All 384 tests passing

**Test:**
```bash
jm2 add "echo test" --cron "* * * * *" --name test-job
jm2 show test-job
jm2 pause test-job
jm2 list  # Should show paused
jm2 resume test-job
jm2 list  # Should show active
jm2 remove test-job
jm2 list  # Should be gone
```

#### Step 6.3: Run and Edit Commands ✅ COMPLETE
**Goal:** Implement manual execution and job editing.

**Tasks:**
- [x] Create `src/cli/commands/run.js` - Manual job execution with `--wait` support
- [x] Create `src/cli/commands/edit.js` - Edit existing job properties
- [x] Update `src/cli/index.js` - Register run and edit commands
- [x] Update daemon's `handleJobRun` - Actually execute jobs (not just queue them)

**Completed:**
- Created `run.js` with comprehensive manual execution support:
  - Run jobs by ID or name
  - `--wait` flag to wait for completion and display output
  - Shows stdout, stderr, exit code, and duration when waiting
  - Async execution (fire and forget) when not using --wait
- Created `edit.js` with full job editing capabilities:
  - `--command` - Update the command to execute
  - `--name` - Rename the job
  - `--cron` - Change to cron schedule
  - `--at` or `--delay` - Change to one-time schedule
  - `--cwd` - Update working directory
  - `--env` - Set environment variables
  - `--timeout` - Update timeout
  - `--retry` - Update retry count
  - `--tag` - Replace all tags
  - Validates mutually exclusive scheduling options
- Updated daemon's `handleJobRun` to:
  - Execute jobs immediately when called
  - Support `--wait` mode that returns execution results
  - Update job stats (runCount, lastRun, lastResult)
  - Handle errors gracefully
- All 384 tests passing

**Test:**
```bash
jm2 add "echo original" --cron "0 * * * *" --name test-edit
jm2 run test-edit --wait
# Should output: original

jm2 edit test-edit --command "echo modified"
jm2 run test-edit --wait
# Should output: modified

jm2 edit test-edit --cron "*/5 * * * *"
jm2 show test-edit
# Should show new cron expression
```

---

### Phase 7: Logs and History

#### Step 7.1: Logging System ✅ COMPLETE
**Goal:** Implement job execution logging with size limiting.

**Tasks:**
- [x] Enhance `src/core/logger.js` for job logs
- [x] Create log files per job
- [x] Add log size limiting configuration to config.json:
  - `logging.maxFileSize`: Maximum size per log file (default: 10MB)
  - `logging.maxFiles`: Number of rotated files to keep (default: 5)
- [x] Implement log rotation when size limit is reached
- [x] Add `jm2 config --log-max-size` and `jm2 config --log-max-files` commands

**Completed:**
- Enhanced `src/core/logger.js` with log rotation support:
  - Added `parseSize()` function to parse size strings (e.g., "10mb", "50KB")
  - Added `formatSize()` function to format bytes as human-readable strings
  - Added `rotateLogs()` function to rotate log files when size limit is reached
  - Updated `createLogger()` to support rotation options
  - Updated `createDaemonLogger()` and `createJobLogger()` to use config-based rotation settings
- Created `src/cli/commands/config.js` with comprehensive configuration management:
  - `jm2 config` - Show all configuration settings
  - `jm2 config --log-max-size <size>` - Set maximum log file size
  - `jm2 config --log-max-files <count>` - Set maximum number of log files
  - `jm2 config --level <level>` - Set log level (DEBUG, INFO, WARN, ERROR)
  - `jm2 config --max-concurrent <count>` - Set max concurrent jobs
  - `jm2 config --reset` - Reset to defaults
- Configuration validation ensures valid values for all settings
- Added 13 new tests for log rotation and size parsing (397 total tests passing)

**Test:**
```bash
# Check log configuration
jm2 config --show

# Set log limits
jm2 config --log-max-size 50mb
jm2 config --log-max-files 5

# Create a job and check logs
jm2 add "echo 'log test'" --cron "* * * * *" --name log-test
jm2 run log-test
ls ~/.jm2/logs/
cat ~/.jm2/logs/log-test.log
```

#### Step 7.2: Logs and History Commands ✅ COMPLETE
**Goal:** Implement log viewing and history commands.

**Tasks:**
- [x] Create `src/cli/commands/logs.js` with options:
  - `--lines, -n`: Number of lines to show from tail (default: 50)
  - `--follow, -f`: Watch/follow log output in real-time
  - `--since`: Show logs since a specific time (e.g., "1h ago", "2026-01-31")
  - `--until`: Show logs until a specific time
  - `--timestamps`: Show timestamps (default: true, use --no-timestamps to hide)
- [x] Create `src/cli/commands/history.js` to show execution history
- [x] Implement efficient tail functionality for large log files
- [x] Implement log following with file watching
- [x] Register commands in `src/cli/index.js`

**Completed:**
- Created `logs.js` with comprehensive log viewing features:
  - `--lines, -n`: Show last N lines (default: 50) with efficient tail implementation
  - `--follow, -f`: Real-time log following with file watching (like `tail -f`)
  - `--since`: Filter logs since a relative time ("1h", "30m") or absolute date
  - `--until`: Filter logs until a specific time
  - `--timestamps/--no-timestamps`: Control timestamp display with gray formatting
  - Direct file reading for log access (no IPC needed)
- Created `history.js` with execution history display:
  - Shows job execution history in a formatted table
  - `--failed`: Filter to show only failed executions
  - `--success`: Filter to show only successful executions
  - `--limit`: Control number of entries shown (default: 20)
  - Supports viewing history for a specific job or all jobs
  - Colorized status (green=success, red=failed, yellow=timeout)
- All 397 tests passing

**Test:**
```bash
# Show last 50 lines (default)
jm2 logs log-test

# Show last 100 lines
jm2 logs log-test --lines 100
jm2 logs log-test -n 100

# Follow/watch logs in real-time (like tail -f)
jm2 logs log-test --follow
jm2 logs log-test -f

# Follow and run job in another terminal
jm2 run log-test

# Show logs from last hour
jm2 logs log-test --since 1h

# Show history
jm2 history log-test
jm2 history --failed
```

---

### Phase 8: Utility Commands

#### Step 8.1: Flush Command ✅ COMPLETE
**Goal:** Implement cleanup functionality.

**Tasks:**
- [x] Create `src/cli/commands/flush.js`
- [x] Implement completed one-time job cleanup
- [x] Implement log cleanup
- [x] Implement history cleanup

**Completed:**
- Created `src/cli/commands/flush.js` with comprehensive cleanup functionality:
  - `--no-jobs` - Skip removing completed one-time jobs
  - `--logs <duration>` - Remove logs older than specified duration (e.g., "7d", "24h")
  - `--history <duration>` - Remove history entries older than specified duration
  - `--all` - Remove all logs and history
  - `--force` - Skip confirmation prompt
- Added FLUSH and FLUSH_RESULT message types to IPC protocol
- Implemented `handleFlush()` in daemon to process flush requests:
  - Removes completed one-time jobs (preserves cron jobs and non-completed jobs)
  - Removes log files older than specified age (or all if no age limit)
  - Removes history entries older than specified age (or all if no age limit)
- Registered flush command in CLI index.js
- Added unit tests for flush protocol functions (400 tests passing)

**Commit:** ffd1de7

**Test:**
```bash
# Create and complete a one-time job
jm2 add "echo done" --in 1s --name flush-test
sleep 2
jm2 list  # Should show completed

jm2 flush
jm2 list  # Completed one-time job should be gone
```

#### Step 8.2: Export and Import Commands ✅ COMPLETE
**Goal:** Implement job configuration export/import.

**Tasks:**
- [x] Create `src/cli/commands/export.js`
- [x] Create `src/cli/commands/import.js`

**Completed:**
- Created `src/cli/commands/export.js` with job export functionality:
  - Exports all jobs to a JSON file with metadata (version, exportedAt)
  - `--output, -o` option to specify output file (default: jm2-export.json)
  - Exports job configuration without runtime state (runCount, lastRun, etc. reset on import)
- Created `src/cli/commands/import.js` with job import functionality:
  - Imports jobs from a JSON export file
  - `--skip, -s` option to skip jobs with conflicting names
  - `--force, -f` option to skip confirmation prompt
  - Auto-generates unique names for conflicting jobs (e.g., job-1 → job-1-2)
  - Validates imported jobs and reports invalid/skipped jobs
  - Resets runtime state (runCount=0, lastRun=null, etc.)
- Registered both commands in `src/cli/index.js`
- All 400 tests passing

**Test:**
```bash
jm2 add "echo test1" --cron "* * * * *" --name export-test-1
jm2 add "echo test2" --cron "0 * * * *" --name export-test-2

jm2 export --output backup.json
cat backup.json

jm2 remove export-test-1 export-test-2 --force
jm2 list  # Should be empty

jm2 import backup.json
jm2 list  # Jobs should be restored
```

---

### Phase 9: Polish and Edge Cases

#### Step 9.1: Error Handling and Edge Cases
**Goal:** Handle all error cases gracefully.

**Tasks:**
- [x] Handle daemon not running errors - Improved IPC client with DaemonError class and user-friendly error messages
- [x] Handle invalid cron expressions - Updated job validation to use cron-parser for comprehensive validation
- [x] Handle invalid datetime formats - Already handled with good error messages in datetime.js
- [x] Handle job not found errors - Already handled in CLI commands and daemon
- [x] Handle permission errors - Handled by storage layer with descriptive error messages
- [x] Handle concurrent job execution limits - Added maxConcurrent enforcement to scheduler

**Completed:**
- Added DaemonError class to IPC client for better error handling
- Updated job validation to use cron-parser library for comprehensive cron validation
- Verified datetime validation has good error handling
- Verified job not found errors are handled properly in all CLI commands
- Verified permission errors are caught by storage layer
- Added maxConcurrent option to scheduler and enforcement in executeJob()
- Scheduler now reads maxConcurrent from config and respects the limit

**Test:**
```bash
# Test invalid cron
jm2 add "echo test" --cron "invalid" --name bad-cron
# Should show: Invalid cron expression error

# Test daemon not running
jm2 stop
jm2 list
# Should show: Daemon is not running. Start it with: jm2 start

# Test job not found
jm2 start
jm2 show nonexistent
# Should show: Job not found: nonexistent
```

**Test:**
```bash
# Test daemon not running
jm2 stop
jm2 list  # Should show helpful error

# Test invalid cron
jm2 add "echo test" --cron "invalid" --name bad-cron
# Should show error

# Test job not found
jm2 show nonexistent
# Should show error
```

#### Step 9.2: Daemon Persistence
**Goal:** Ensure jobs persist across daemon restarts.

**Tasks:**
- [ ] Load jobs from storage on daemon start
- [ ] Reschedule all active jobs
- [ ] Handle expired one-time jobs
- [ ] Verify job state consistency

**Test:**
```bash
jm2 start
jm2 add "echo persist" --cron "* * * * *" --name persist-test
jm2 stop
jm2 start
jm2 list  # Job should still be there and scheduled
```

---

### Phase 10: Testing and Documentation

#### Step 10.1: Unit Tests
**Goal:** Comprehensive unit test coverage.

**Tasks:**
- [ ] Test duration parsing
- [ ] Test cron utilities
- [ ] Test job model validation
- [ ] Test storage operations
- [ ] Test IPC protocol

#### Step 10.2: Integration Tests
**Goal:** End-to-end testing.

**Tasks:**
- [ ] Test full daemon lifecycle
- [ ] Test job scheduling and execution
- [ ] Test CLI commands
- [ ] Test error scenarios

#### Step 10.3: Documentation
**Goal:** Complete documentation.

**Tasks:**
- [ ] Update README with any changes
- [ ] Add JSDoc comments
- [ ] Create CONTRIBUTING.md
- [ ] Create CHANGELOG.md

---

### Phase 11: SQLite History Migration ✅ COMPLETE

#### Step 11.1: SQLite History Storage
**Goal:** Replace JSON file-based history with SQLite for better performance and querying capabilities.

**Rationale:**
- Current JSON-based history loads entire file into memory
- No enforcement of `maxEntriesPerJob` and `retentionDays` config settings
- SQLite provides efficient querying, indexing, and automatic cleanup

**Tasks:**
- [x] Add `better-sqlite3` dependency to package.json
- [x] Create `src/core/history-db.js` - SQLite database module for history
  - Initialize database with schema (job_id, job_name, command, status, exit_code, start_time, end_time, duration, error, timestamp)
  - Create indexes on job_id and timestamp for efficient queries
  - Implement `addHistoryEntry()` with automatic cleanup
  - Implement `getHistory()` with filtering and pagination
  - Implement `getJobHistory()` for specific job history
  - Implement `clearHistoryBefore()` for date-based cleanup
  - Implement `clearAllHistory()` for complete cleanup
- [x] Update `src/core/storage.js` to delegate history operations to SQLite module
- [x] Update `src/utils/paths.js` to add `getHistoryDbFile()` function
- [x] Remove or deprecate `getHistoryFile()` (JSON-based)

**Config Enforcement:**
- [x] On `addHistoryEntry()`:
  - After inserting, delete oldest entries if count for job exceeds `history.maxEntriesPerJob`
  - Delete entries older than `history.retentionDays` from all jobs (based on created_at, not timestamp)
- [x] These checks run automatically on every history insertion

**Test:**
```bash
# Install new dependency
npm install

# Run unit tests for history DB
npm run test:run -- --reporter=dot tests/unit/history-db.test.js

# Run all tests
npm run test:run -- --reporter=dot

# Manual test - add jobs and verify history is stored
jm2 start
jm2 add "echo test1" --name test-job --cron "* * * * *"
sleep 65  # Wait for job to run
jm2 history test-job  # Should show entry

# Verify SQLite file exists
ls -la ~/.jm2/history.db
```

**Notes:**
- No migration of old JSON history data needed - start fresh with SQLite
- Old `history.json` can be ignored or deleted on first SQLite access
- Keep the same public API in `storage.js` to minimize changes to other modules
- Uses WAL mode for better concurrent read/write performance
- 5-second busy timeout for handling concurrent access

---

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| commander | ^14.0.2 | CLI framework |
| cron-parser | ^5.4.0 | Parse cron expressions |
| dayjs | ^1.11.19 | Date/time manipulation |
| chalk | ^5.6.2 | Terminal colors |
| cli-table3 | ^0.6.5 | Table output |
| ora | ^8.0.0 | Spinners |
| better-sqlite3 | ^11.0.0 | SQLite database for history storage |

### Dev Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| vitest | ^3.0.0 | Testing framework |
| eslint | ^9.0.0 | Linting |

---

## Milestones

1. **M1: Foundation** (Steps 1.1-1.2)
   - Project setup complete
   - Storage layer working
   - Basic utilities implemented

2. **M2: Daemon Running** (Steps 2.1-2.2)
   - Daemon can start/stop
   - IPC communication working

3. **M3: Basic CLI** (Step 3.1)
   - CLI can control daemon
   - start/stop/status working

4. **M4: Job Scheduling** (Steps 4.1-4.2)
   - Cron jobs scheduling
   - One-time jobs scheduling

5. **M5: Job Execution** (Steps 5.1-5.2)
   - Commands executing
   - Retry logic working

6. **M6: Full CLI** (Steps 6.1-6.3)
   - All job management commands
   - Full feature parity with spec

7. **M7: Logs & History** (Steps 7.1-7.2)
   - Logging system complete
   - History tracking working

8. **M8: Utilities** (Steps 8.1-8.2)
   - Export/import working
   - Cleanup commands working

9. **M9: Production Ready** (Steps 9.1-9.2)
   - Error handling complete
   - Persistence verified

10. **M10: Release** (Steps 10.1-10.3)
    - Tests passing
    - Documentation complete
