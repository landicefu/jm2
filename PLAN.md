# jm2 Implementation Plan

This document outlines the step-by-step implementation plan for jm2. Each step is designed to be testable independently.

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
| Phase 4: Job Scheduling | 🔄 **NEXT** | Cron scheduler, one-time job scheduler |
| Phase 5: Job Execution | ⏳ Pending | Command executor, retry logic |
| Phase 6: Job Management | ⏳ Pending | add/list/show/remove/pause/resume/run/edit commands |
| Phase 7: Logs and History | ⏳ Pending | logs/history commands, log rotation |
| Phase 8: Utility Commands | ⏳ Pending | flush, export, import commands |
| Phase 9: Polish | ⏳ Pending | Error handling, edge cases, persistence |

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

### Phase 4: Job Scheduling 🔄 NEXT

#### Step 4.1: Cron Scheduler ✅ COMPLETE
**Goal:** Implement periodic job scheduling using cron expressions.

**Tasks:**
- [x] Create `src/utils/cron.js` - Cron expression utilities
- [ ] Create `src/daemon/scheduler.js` - Job scheduler
- [ ] Implement cron job scheduling
- [ ] Implement next run time calculation

**Completed:** Created cron expression utilities with validation, next run time calculation, and presets. Commit: `97815be`

**Test:**
```bash
# Unit test cron parsing - PASSING (35 tests)
npm run test:run -- --reporter=dot tests/unit/cron.test.js
```

#### Step 4.2: One-time Job Scheduler
**Goal:** Implement one-time job scheduling (at and in).

**Tasks:**
- [ ] Extend scheduler for one-time jobs
- [ ] Implement `--at` datetime parsing
- [ ] Implement `--in` relative time parsing
- [ ] Handle expired one-time jobs on daemon restart

**Test:**
```bash
# Test one-time job with --in
jm2 add "echo 'hello'" --in 1m --name test-once
jm2 list
# Wait 1 minute
jm2 logs test-once
jm2 list  # Job should be marked as completed
```

---

### Phase 5: Job Execution

#### Step 5.1: Command Executor
**Goal:** Implement command execution with proper process management.

**Tasks:**
- [ ] Create `src/daemon/executor.js` - Command execution
- [ ] Implement spawn with shell
- [ ] Implement working directory support
- [ ] Implement environment variables
- [ ] Implement timeout handling
- [ ] Implement output capture and logging

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

#### Step 5.2: Retry Logic
**Goal:** Implement retry on failure.

**Tasks:**
- [ ] Add retry count to job model
- [ ] Implement retry logic in executor
- [ ] Track retry attempts in history

**Test:**
```bash
# Test retry
jm2 add "exit 1" --cron "* * * * *" --name test-retry --retry 3
jm2 run test-retry --wait
jm2 history test-retry
# Should show 4 attempts (1 original + 3 retries)
```

---

### Phase 6: Job Management Commands

#### Step 6.1: Add and List Commands
**Goal:** Implement `jm2 add` and `jm2 list`.

**Tasks:**
- [ ] Create `src/cli/commands/add.js` - Full implementation
- [ ] Create `src/cli/commands/list.js` - Table output
- [ ] Implement all add options (cron, at, in, tags, etc.)
- [ ] Implement list filters (tag, active, paused)

**Test:**
```bash
jm2 add "echo test" --cron "0 * * * *" --name hourly --tag test
jm2 add "echo once" --at "2025-12-31 23:59" --name new-year
jm2 list
jm2 list --tag test
jm2 list --verbose
```

#### Step 6.2: Show, Remove, Pause, Resume Commands
**Goal:** Implement job inspection and state management.

**Tasks:**
- [ ] Create `src/cli/commands/show.js`
- [ ] Create `src/cli/commands/remove.js`
- [ ] Create `src/cli/commands/pause.js`
- [ ] Create `src/cli/commands/resume.js`
- [ ] Create `src/cli/utils/prompts.js` - Confirmation prompts

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

#### Step 6.3: Run and Edit Commands
**Goal:** Implement manual execution and job editing.

**Tasks:**
- [ ] Create `src/cli/commands/run.js`
- [ ] Create `src/cli/commands/edit.js`

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

#### Step 7.1: Logging System
**Goal:** Implement job execution logging.

**Tasks:**
- [ ] Enhance `src/core/logger.js` for job logs
- [ ] Create log files per job
- [ ] Implement log rotation

**Test:**
```bash
jm2 add "echo 'log test'" --cron "* * * * *" --name log-test
jm2 run log-test
ls ~/.jm2/logs/
cat ~/.jm2/logs/log-test.log
```

#### Step 7.2: Logs and History Commands
**Goal:** Implement log viewing and history commands.

**Tasks:**
- [ ] Create `src/cli/commands/logs.js`
- [ ] Create `src/cli/commands/history.js`
- [ ] Implement log following (--follow)
- [ ] Implement date filtering

**Test:**
```bash
jm2 logs log-test
jm2 logs log-test --lines 10
jm2 logs --follow &  # Background, then trigger a job
jm2 run log-test

jm2 history log-test
jm2 history --failed
```

---

### Phase 8: Utility Commands

#### Step 8.1: Flush Command
**Goal:** Implement cleanup functionality.

**Tasks:**
- [ ] Create `src/cli/commands/flush.js`
- [ ] Implement completed one-time job cleanup
- [ ] Implement log cleanup
- [ ] Implement history cleanup

**Test:**
```bash
# Create and complete a one-time job
jm2 add "echo done" --in 1s --name flush-test
sleep 2
jm2 list  # Should show completed

jm2 flush
jm2 list  # Completed one-time job should be gone
```

#### Step 8.2: Export and Import Commands
**Goal:** Implement job configuration export/import.

**Tasks:**
- [ ] Create `src/cli/commands/export.js`
- [ ] Create `src/cli/commands/import.js`

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
- [ ] Handle daemon not running errors
- [ ] Handle invalid cron expressions
- [ ] Handle invalid datetime formats
- [ ] Handle job not found errors
- [ ] Handle permission errors
- [ ] Handle concurrent job execution limits

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

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| commander | ^14.0.2 | CLI framework |
| cron-parser | ^5.4.0 | Parse cron expressions |
| dayjs | ^1.11.19 | Date/time manipulation |
| chalk | ^5.6.2 | Terminal colors |
| cli-table3 | ^0.6.5 | Table output |
| ora | ^8.0.0 | Spinners |

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
