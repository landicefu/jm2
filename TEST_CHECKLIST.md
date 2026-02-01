# JM2 Test Checklist

Complete verification checklist for all commands and options. Each item should be tested before release.

---

## 1. Daemon Management

### 1.1 `jm2 start`
- [ ] Start daemon when not running
- [ ] Show error when daemon already running
- [ ] `--foreground, -f` - Run in foreground mode
- [ ] Creates PID file at `~/.jm2/daemon.pid`
- [ ] Creates data directory `~/.jm2/` if not exists
- [ ] Daemon log written to `~/.jm2/daemon.log`

### 1.2 `jm2 stop`
- [ ] Stop running daemon
- [ ] Show error when daemon not running (exit code 3)
- [ ] Removes PID file after stop
- [ ] Graceful shutdown (waits for running jobs)

### 1.3 `jm2 restart`
- [ ] Restart running daemon
- [ ] Start daemon if not running
- [ ] Preserves all scheduled jobs

### 1.4 `jm2 status`
- [ ] Show "Running" when daemon is running
- [ ] Show "Stopped" when daemon is not running
- [ ] Display PID
- [ ] Display uptime
- [ ] Display job counts (total, active, paused)
- [ ] Display execution count for today

---

## 2. Job Creation (`jm2 add`)

### 2.1 Basic Options
- [ ] `<command>` - Command to execute (required)
- [ ] `--name, -n <name>` - Custom job name
- [ ] Auto-generate name (`job-1`, `job-2`) when `--name` not provided
- [ ] Error when name already exists (exit code 6)
- [ ] `--auto-suffix` - Auto-add suffix (`-2`, `-3`) if name exists
- [ ] `--paused` - Add job in paused state

### 2.2 Scheduling Options - Cron
- [ ] `--cron, -c <expression>` - Valid cron expression
- [ ] Error on invalid cron expression (exit code 2)
- [ ] `* * * * *` - Every minute
- [ ] `*/5 * * * *` - Every 5 minutes
- [ ] `0 * * * *` - Every hour
- [ ] `0 0 * * *` - Daily at midnight
- [ ] `0 2 * * *` - Daily at 2 AM
- [ ] `0 0 * * 0` - Weekly on Sunday
- [ ] `0 0 1 * *` - Monthly on 1st
- [ ] `0 9-17 * * 1-5` - Weekdays 9 AM to 5 PM

### 2.3 Scheduling Options - One-time (`--at`)
- [ ] `--at, -a <datetime>` - Absolute datetime
- [ ] Format: `HH:mm` - Time only (today or tomorrow if past)
- [ ] Format: `HH:mm:ss` - Time with seconds
- [ ] Format: `YYYY-MM-DD` - Date only (midnight)
- [ ] Format: `YYYY-MM-DD HH:mm` - Date and time
- [ ] Format: `YYYY-MM-DD HH:mm:ss` - Full datetime
- [ ] Format: `YYYY-MM-DDTHH:mm:ss` - ISO 8601
- [ ] Time-only schedules for tomorrow if time already passed today
- [ ] Error when full datetime is in the past (exit code 7)

### 2.4 Scheduling Options - Relative (`--in`)
- [ ] `--in, -i <duration>` - Relative time
- [ ] Format: `30s` - Seconds
- [ ] Format: `5m` - Minutes
- [ ] Format: `2h` - Hours
- [ ] Format: `1d` - Days
- [ ] Format: `1w` - Weeks
- [ ] Format: `1h30m` - Combined duration

### 2.5 Execution Options
- [ ] `--cwd <path>` - Working directory
- [ ] Error on invalid/non-existent path
- [ ] `--env, -e <KEY=value>` - Single environment variable
- [ ] `--env` - Multiple environment variables (repeated flag)
- [ ] `--shell <shell>` - Custom shell
- [ ] Default shell: `/bin/sh` (Unix), `cmd.exe` (Windows)
- [ ] `--timeout <duration>` - Execution timeout
- [ ] `--retry <count>` - Retry count on failure

### 2.6 Organization Options
- [ ] `--tag, -t <tag>` - Single tag
- [ ] `--tag` - Multiple tags (repeated flag)

### 2.7 Validation
- [ ] Error when neither `--cron`, `--at`, nor `--in` provided
- [ ] Error when multiple schedule types provided
- [ ] Error on empty command

---

## 3. Job Listing (`jm2 list`)

### 3.1 Basic Output
- [ ] Display all jobs in table format
- [ ] Show ID column
- [ ] Show Name column
- [ ] Show Status column (active/paused/completed)
- [ ] Show Schedule column (cron expression or "at <datetime>")
- [ ] Show Next Run column
- [ ] Show Last Run column

### 3.2 Filtering Options
- [ ] `--tag, -t <tag>` - Filter by tag
- [ ] `--active` - Show only active jobs
- [ ] `--paused` - Show only paused jobs
- [ ] `--verbose, -v` - Show detailed information

### 3.3 Edge Cases
- [ ] Empty list message when no jobs
- [ ] Handle jobs with long names (truncation)
- [ ] Handle jobs with no tags

---

## 4. Job Details (`jm2 show`)

### 4.1 Basic Output
- [ ] `jm2 show <id>` - Show by ID
- [ ] `jm2 show <name>` - Show by name
- [ ] Display job name and ID
- [ ] Display command
- [ ] Display schedule type and expression
- [ ] Display status
- [ ] Display created date
- [ ] Display tags
- [ ] Display working directory (if set)
- [ ] Display environment variables (if set)
- [ ] Display execution history (last 5)
- [ ] Display next run time with relative time

### 4.2 Error Handling
- [ ] Error when job not found (exit code 4)

---

## 5. Job Removal (`jm2 remove`)

### 5.1 Basic Usage
- [ ] `jm2 remove <id>` - Remove by ID
- [ ] `jm2 remove <name>` - Remove by name
- [ ] `jm2 remove <id1> <id2> <id3>` - Remove multiple jobs
- [ ] Confirmation prompt before removal
- [ ] `--force, -f` - Skip confirmation

### 5.2 Bulk Removal
- [ ] `--tag, -t <tag>` - Remove all jobs with tag
- [ ] Confirmation shows count of jobs to remove

### 5.3 Error Handling
- [ ] Error when job not found (exit code 4)
- [ ] Partial success message when some jobs not found

### 5.4 Cleanup
- [ ] Removes job from `jobs.json`
- [ ] Optionally removes log file

---

## 6. Job State Management

### 6.1 `jm2 pause`
- [ ] `jm2 pause <id>` - Pause by ID
- [ ] `jm2 pause <name>` - Pause by name
- [ ] `jm2 pause <id1> <id2>` - Pause multiple
- [ ] `--tag, -t <tag>` - Pause all with tag
- [ ] Already paused job shows warning
- [ ] Error when job not found (exit code 4)

### 6.2 `jm2 resume`
- [ ] `jm2 resume <id>` - Resume by ID
- [ ] `jm2 resume <name>` - Resume by name
- [ ] `jm2 resume <id1> <id2>` - Resume multiple
- [ ] `--tag, -t <tag>` - Resume all with tag
- [ ] Already active job shows warning
- [ ] Error when job not found (exit code 4)
- [ ] Reschedules next run after resume

---

## 7. Manual Execution (`jm2 run`)

### 7.1 Basic Usage
- [ ] `jm2 run <id>` - Run by ID
- [ ] `jm2 run <name>` - Run by name
- [ ] Triggers immediate execution
- [ ] Does not affect scheduled runs

### 7.2 Options
- [ ] `--wait, -w` - Wait for completion
- [ ] `--wait` shows real-time output
- [ ] `--wait` shows exit code

### 7.3 Error Handling
- [ ] Error when job not found (exit code 4)
- [ ] Error when daemon not running (exit code 3)

---

## 8. Job Editing (`jm2 edit`)

### 8.1 Schedule Changes
- [ ] `--cron, -c <expression>` - Change cron expression
- [ ] `--at, -a <datetime>` - Convert to one-time job
- [ ] Reschedules job after edit

### 8.2 Command Changes
- [ ] `--command <cmd>` - Change command

### 8.3 Metadata Changes
- [ ] `--name, -n <name>` - Rename job
- [ ] Rename updates log file name
- [ ] Error if new name already exists (exit code 6)
- [ ] `--tag, -t <tag>` - Add tag
- [ ] `--untag <tag>` - Remove tag

### 8.4 Execution Options
- [ ] `--cwd <path>` - Change working directory
- [ ] `--env, -e <KEY=value>` - Add/update env var
- [ ] `--unenv <KEY>` - Remove env var
- [ ] `--timeout <duration>` - Change timeout
- [ ] `--retry <count>` - Change retry count

### 8.5 Error Handling
- [ ] Error when job not found (exit code 4)
- [ ] Error on invalid cron expression
- [ ] Error on invalid datetime

---

## 9. Logs (`jm2 logs`)

### 9.1 Basic Usage
- [ ] `jm2 logs` - Show all recent logs
- [ ] `jm2 logs <id>` - Show logs for job by ID
- [ ] `jm2 logs <name>` - Show logs for job by name

### 9.2 Options
- [ ] `--follow, -f` - Follow log output in real-time
- [ ] `--lines, -n <count>` - Number of lines (default: 50)
- [ ] `--since <datetime>` - Show logs since datetime
- [ ] `--until <datetime>` - Show logs until datetime
- [ ] `--errors` - Show only error logs

### 9.3 Log Content
- [ ] Timestamp for each entry
- [ ] Job name in log entry
- [ ] stdout captured
- [ ] stderr captured
- [ ] Exit code logged
- [ ] Execution duration logged

### 9.4 Error Handling
- [ ] Error when job not found (exit code 4)
- [ ] Message when no logs exist

---

## 10. History (`jm2 history`)

### 10.1 Basic Usage
- [ ] `jm2 history` - Show all execution history
- [ ] `jm2 history <id>` - Show history for job by ID
- [ ] `jm2 history <name>` - Show history for job by name

### 10.2 Options
- [ ] `--count, -c <number>` - Number of executions (default: 10)
- [ ] `--failed` - Show only failed executions
- [ ] `--success` - Show only successful executions

### 10.3 History Content
- [ ] Execution timestamp
- [ ] Duration
- [ ] Exit code
- [ ] Success/failure indicator

---

## 11. Cleanup (`jm2 flush`)

### 11.1 Basic Usage
- [ ] `jm2 flush` - Clear completed one-time jobs
- [ ] Confirmation prompt
- [ ] `--force, -f` - Skip confirmation

### 11.2 Options
- [ ] `--logs` - Clear old log files
- [ ] `--history` - Clear execution history
- [ ] `--days <number>` - Clear items older than N days (default: 7)

### 11.3 Behavior
- [ ] Does not remove active periodic jobs
- [ ] Shows count of items removed

---

## 12. Export/Import

### 12.1 `jm2 export`
- [ ] `jm2 export` - Export to stdout
- [ ] `--output, -o <file>` - Export to file
- [ ] `--tag, -t <tag>` - Export only jobs with tag
- [ ] Valid JSON output
- [ ] Includes all job properties

### 12.2 `jm2 import`
- [ ] `jm2 import <file>` - Import from file
- [ ] `--merge` - Merge with existing (default)
- [ ] `--replace` - Replace all existing jobs
- [ ] Validates JSON format
- [ ] Validates job schema
- [ ] Shows count of imported jobs

### 12.3 Error Handling
- [ ] Error on invalid JSON
- [ ] Error on invalid job schema
- [ ] Error on file not found

---

## 13. Duration Parsing

### 13.1 Valid Formats
- [x] `30s` → 30 seconds
- [x] `5m` → 5 minutes
- [x] `2h` → 2 hours
- [x] `1d` → 1 day
- [x] `1w` → 1 week
- [x] `1h30m` → 1 hour 30 minutes
- [x] `2d12h` → 2 days 12 hours

### 13.2 Error Handling
- [x] Error on invalid format
- [ ] Error on negative values
- [x] Error on zero duration

---

## 14. Datetime Parsing

### 14.1 Time Only
- [ ] `15:30` → Today at 15:30 (or tomorrow if past)
- [ ] `09:00:00` → Today at 09:00:00 (or tomorrow if past)
- [ ] `23:59` → Today at 23:59 (or tomorrow if past)

### 14.2 Date + Time
- [ ] `2025-12-25 10:00` → Exact datetime
- [ ] `2025-12-25 10:00:00` → Exact datetime with seconds
- [ ] `2025-12-25T10:00:00` → ISO 8601 format

### 14.3 Date Only
- [ ] `2025-12-25` → Midnight on date

### 14.4 Error Handling
- [ ] Error on invalid format
- [ ] Error when full datetime is in the past

---

## 15. Error Codes

- [ ] Exit code 0 - Success
- [ ] Exit code 1 - General error
- [ ] Exit code 2 - Invalid arguments
- [ ] Exit code 3 - Daemon not running
- [ ] Exit code 4 - Job not found
- [ ] Exit code 5 - Permission denied
- [ ] Exit code 6 - Job name already exists
- [ ] Exit code 7 - Scheduled time is in the past

---

## 16. Daemon Behavior

### 16.1 Persistence
- [ ] Jobs persist across daemon restart
- [ ] Jobs persist across system reboot
- [ ] Paused state persists
- [ ] Execution history persists

### 16.2 One-time Job Handling
- [ ] Expired one-time jobs marked as "missed" on daemon start
- [ ] Completed one-time jobs not re-executed

### 16.3 Concurrent Execution
- [ ] Respects `maxConcurrentJobs` config
- [ ] Queues jobs when limit reached

### 16.4 Logging
- [x] Each job has separate log file: `~/.jm2/logs/{task-name}.log`
- [x] Daemon log at `~/.jm2/daemon.log`

---

## 17. Configuration

### 17.1 Config File
- [ ] Config at `~/.jm2/config.json`
- [ ] `logRetentionDays` - Log retention period
- [ ] `historyRetentionDays` - History retention period
- [ ] `maxConcurrentJobs` - Concurrent job limit
- [ ] `defaultShell` - Default shell for commands
- [ ] `timezone` - Timezone for scheduling

### 17.2 Data Files
- [x] Jobs stored at `~/.jm2/jobs.json`
- [x] PID file at `~/.jm2/daemon.pid`
- [x] Logs directory at `~/.jm2/logs/`

---

## 18. Edge Cases

### 18.1 Special Characters
- [ ] Command with quotes
- [ ] Command with special characters
- [ ] Job name with spaces (should error or handle)
- [ ] Job name with special characters

### 18.2 Long Running Jobs
- [ ] Job exceeding timeout is killed
- [ ] Timeout logged in history

### 18.3 Retry Behavior
- [ ] Retries on non-zero exit code
- [ ] Retry count tracked in history
- [ ] Delay between retries (if implemented)

### 18.4 System Events
- [ ] Handle SIGTERM gracefully
- [ ] Handle SIGINT gracefully
- [ ] Handle disk full scenario
- [ ] Handle permission denied on log write

---

## 19. Output Formatting

### 19.1 Table Output
- [ ] Proper column alignment
- [ ] Color coding for status
- [ ] Truncation for long values

### 19.2 Verbose Output
- [ ] Additional details shown
- [ ] Proper indentation

### 19.3 Error Messages
- [ ] Clear error descriptions
- [ ] Suggested fixes where applicable
- [ ] Exit code displayed in verbose mode

---

## 20. Integration Tests

### 20.1 Full Workflow
- [ ] Start daemon → Add job → List → Run → Logs → Stop
- [ ] Add cron job → Wait for execution → Verify logs
- [ ] Add one-time job → Wait → Verify completion
- [ ] Export → Remove all → Import → Verify restored

### 20.2 Stress Tests
- [ ] Add 100+ jobs
- [ ] Concurrent job execution
- [ ] Rapid add/remove operations

### 20.3 Recovery Tests
- [ ] Kill daemon process → Restart → Verify state
- [ ] Corrupt jobs.json → Daemon handles gracefully
- [ ] Delete log file → Job continues working
