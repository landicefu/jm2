# JM2 - Job Manager 2

A simple yet powerful job scheduler for Node.js, combining the functionality of `cron` (periodic tasks) and `at` (one-time tasks). Designed to be as easy to use as pm2.

<a href="https://www.buymeacoffee.com/landicefu" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>

## Features

- 🔄 **Periodic Jobs** - Schedule recurring tasks using cron expressions
- ⏰ **One-time Jobs** - Schedule tasks to run once at a specific time
- 💾 **Persistent Storage** - Jobs survive daemon restarts and system reboots
- 🖥️ **Simple CLI** - Intuitive command-line interface inspired by pm2
- 📊 **Job Monitoring** - View job status, history, and logs
- 🏷️ **Job Tagging** - Organize jobs with tags for easy management
- ✅ **Run Requirements** - Skip a scheduled run unless conditions are met (AC power, Wi-Fi/SSID, internet, free disk, mounted path, custom script, and more)

## Installation

### Global Installation (Recommended)

```bash
npm install -g jm2
```

### Using npx (No Installation Required)

You can use jm2 directly with npx without installing it globally:

```bash
# Start the daemon
npx jm2 start

# Add a job
npx jm2 add "echo 'Hello World'" --cron "* * * * *" --name hello

# List jobs
npx jm2 list
```

**Note:** When using npx, the daemon will also run without global installation. All commands work the same way.

## Quick Start

```bash
# Start the daemon
jm2 start

# Add a periodic job (runs every minute)
jm2 add "echo 'Hello World'" --cron "* * * * *" --name hello

# Add a one-time job (runs at specific time)
jm2 add "node backup.js" --at "2024-12-25 10:00" --name christmas-backup

# List all jobs
jm2 list

# Stop the daemon
jm2 stop
```

## CLI Reference

### Daemon Management

#### `jm2 start`
Start the JM2 daemon process.

```bash
jm2 start
```

Options:
- `--foreground, -f` - Run in foreground (don't daemonize)

#### `jm2 stop`
Stop the JM2 daemon process.

```bash
jm2 stop
```

#### `jm2 restart`
Restart the JM2 daemon process.

```bash
jm2 restart
```

#### `jm2 status`
Show daemon status and statistics.

```bash
jm2 status
```

Output example:
```
JM2 Daemon Status
─────────────────────────────────
Status:     Running
PID:        12345
Uptime:     2d 5h 30m
Jobs:       15 total (10 active, 5 paused)
Executed:   1,234 runs today
```

### Job Management

#### `jm2 add <command>`
Add a new scheduled job.

```bash
# Periodic job with cron expression
jm2 add "npm run backup" --cron "0 2 * * *" --name nightly-backup

# One-time job at specific datetime
jm2 add "node deploy.js" --at "2024-12-25 10:00" --name deploy

# One-time job with relative time
jm2 add "echo 'reminder'" --in "30m" --name reminder

# Job without name (auto-generates job-1, job-2, etc.)
jm2 add "echo 'quick task'" --in "5m"

# Job with duplicate name handling
jm2 add "npm run backup" --cron "0 3 * * *" --name backup --auto-suffix
# If "backup" exists, creates "backup-2", "backup-3", etc.

# Job with tags
jm2 add "npm test" --cron "0 * * * *" --name hourly-test --tag ci --tag testing

# Job with working directory
jm2 add "npm run build" --cron "0 0 * * *" --name build --cwd /path/to/project

# Job with environment variables
jm2 add "node app.js" --cron "*/5 * * * *" --name app --env NODE_ENV=production --env PORT=3000
```

Options:
- `--cron, -c <expression>` - Cron expression for periodic jobs
- `--at, -a <datetime>` - Specific datetime for one-time jobs (see [Datetime Format](#datetime-format-for---at))
- `--in, -i <duration>` - Relative time for one-time jobs (e.g., "30m", "2h", "1d")
- `--name, -n <name>` - Job name (optional, auto-generates `job-1`, `job-2`, etc. if not provided). **Error if name already exists** unless `--auto-suffix` is used
- `--auto-suffix` - Auto-add suffix (`-2`, `-3`, etc.) if name already exists
- `--tag, -t <tag>` - Add tag(s) to the job (can be used multiple times)
- `--cwd <path>` - Working directory for the command
- `--env, -e <KEY=value>` - Environment variable (can be used multiple times)
- `--shell <shell>` - Shell to use (default: /bin/sh on Unix, cmd.exe on Windows)
- `--timeout <duration>` - Maximum execution time (e.g., "5m", "1h")
- `--retry <count>` - Number of retries on failure (default: 0)
- `--require, -R <requirement>` - Add a run requirement; the run is skipped if unmet (can be used multiple times). See [Run Requirements](#run-requirements)
- `--paused` - Add job in paused state

#### `jm2 list`
List all scheduled jobs.

```bash
# List all jobs
jm2 list

# List jobs with specific tag
jm2 list --tag backup

# List only active jobs
jm2 list --active

# List only paused jobs
jm2 list --paused

# Show detailed output
jm2 list --verbose
```

Options:
- `--tag, -t <tag>` - Filter by tag
- `--active` - Show only active jobs
- `--paused` - Show only paused jobs
- `--verbose, -v` - Show detailed information

Output example:
```
┌────┬──────────────────┬────────┬─────────────────┬──────────────────────┬────────────┐
│ ID │ Name             │ Status │ Schedule        │ Next Run             │ Last Run   │
├────┼──────────────────┼────────┼─────────────────┼──────────────────────┼────────────┤
│ 1  │ nightly-backup   │ active │ 0 2 * * *       │ 2024-12-20 02:00:00  │ 2h ago     │
│ 2  │ hourly-test      │ active │ 0 * * * *       │ 2024-12-19 15:00:00  │ 45m ago    │
│ 3  │ deploy           │ active │ at 2024-12-25   │ 2024-12-25 10:00:00  │ never      │
│ 4  │ old-task         │ paused │ */5 * * * *     │ -                    │ 3d ago     │
└────┴──────────────────┴────────┴─────────────────┴──────────────────────┴────────────┘
```

#### `jm2 show <id|name>`
Show detailed information about a specific job.

```bash
jm2 show nightly-backup
jm2 show 1
```

Output example:
```
Job: nightly-backup (ID: 1)
───────────────────────────────────
Command:    npm run backup
Schedule:   0 2 * * * (cron)
Status:     active
Created:    2024-12-01 10:30:00
Tags:       backup, database

Working Dir: /home/user/project
Environment:
  NODE_ENV=production
  DB_HOST=localhost

Execution History (last 5):
  ✓ 2024-12-19 02:00:00 - completed in 45s (exit: 0)
  ✓ 2024-12-18 02:00:00 - completed in 42s (exit: 0)
  ✗ 2024-12-17 02:00:00 - failed in 12s (exit: 1)
  ✓ 2024-12-16 02:00:00 - completed in 44s (exit: 0)
  ✓ 2024-12-15 02:00:00 - completed in 43s (exit: 0)

Next Run:   2024-12-20 02:00:00 (in 8h 30m)
```

#### `jm2 remove <id|name>`
Remove a scheduled job.

```bash
jm2 remove nightly-backup
jm2 remove 1

# Remove multiple jobs
jm2 remove 1 2 3

# Remove by tag
jm2 remove --tag old-jobs

# Force remove without confirmation
jm2 remove nightly-backup --force
```

Options:
- `--tag, -t <tag>` - Remove all jobs with this tag
- `--force, -f` - Skip confirmation prompt

#### `jm2 pause <id|name>`
Pause a scheduled job.

```bash
jm2 pause nightly-backup
jm2 pause 1

# Pause multiple jobs
jm2 pause 1 2 3

# Pause by tag
jm2 pause --tag testing
```

Options:
- `--tag, -t <tag>` - Pause all jobs with this tag

#### `jm2 resume <id|name>`
Resume a paused job.

```bash
jm2 resume nightly-backup
jm2 resume 1

# Resume multiple jobs
jm2 resume 1 2 3

# Resume by tag
jm2 resume --tag testing
```

Options:
- `--tag, -t <tag>` - Resume all jobs with this tag

#### `jm2 run <id|name>`
Manually trigger a job to run immediately.

```bash
jm2 run nightly-backup
jm2 run 1
```

Options:
- `--wait, -w` - Wait for job to complete and show output

#### `jm2 edit <id|name>`
Edit an existing job's configuration.

```bash
# Change cron schedule
jm2 edit nightly-backup --cron "0 3 * * *"

# Change command
jm2 edit nightly-backup --command "npm run full-backup"

# Replace all tags (removes existing, sets new)
jm2 edit nightly-backup --tag production --tag critical

# Append tags without removing existing ones
jm2 edit nightly-backup --tag-append new-tag

# Remove specific tags
jm2 edit nightly-backup --tag-remove old-tag

# Change working directory
jm2 edit nightly-backup --cwd /new/path
```

Options:
- `--cron, -c <expression>` - New cron expression
- `--at, -a <datetime>` - Convert to one-time job at datetime
- `--command <cmd>` - New command to execute
- `--name, -n <name>` - Rename the job
- `--tag, -t <tag>` - Set tags (replaces all existing tags, can be used multiple times)
- `--tag-append <tag>` - Append tags to existing tags (can be used multiple times)
- `--tag-remove <tag>` - Remove specific tags (can be used multiple times)
- `--require <requirement>` - Replace all run requirements (can be used multiple times)
- `--require-append <requirement>` - Add run requirement(s) to the existing ones (can be used multiple times)
- `--require-remove <requirement>` - Remove run requirement(s) from the existing ones (can be used multiple times)
- `--clear-requirements` - Remove all run requirements
- `--cwd <path>` - New working directory
- `--env, -e <KEY=value>` - Set/update environment variable
- `--timeout <duration>` - New timeout value
- `--retry <count>` - New retry count

#### `jm2 tags <subcommand>`
Manage job tags in bulk.

```bash
# List all tags with job counts
jm2 tags list

# List tags with associated jobs (verbose)
jm2 tags list -v

# Add tag to multiple jobs
jm2 tags add production 1 2 3
jm2 tags add staging job-name job2-name

# Remove tag from specific jobs
jm2 tags rm staging 1 2

# Remove tag from all jobs
jm2 tags rm old-tag --all

# Clear all tags from specific jobs
jm2 tags clear 1 2

# Clear all tags from all jobs (requires confirmation)
jm2 tags clear --all --force

# Rename a tag across all jobs
jm2 tags rename staging production

# Show jobs grouped by tag (includes untagged group)
jm2 tags jobs

# Show jobs with specific tag
jm2 tags jobs production
```

Subcommands:
- `list` - List all tags with job counts
- `add <tag> <job-id-or-name>...` - Add tag to specified jobs
- `rm <tag> [job-id-or-name]...` - Remove tag from jobs (use `--all` for all jobs)
- `clear [job-id-or-name]...` - Clear all tags from jobs (use `--all --force` for all jobs)
- `rename <old-tag> <new-tag>` - Rename a tag across all jobs
- `jobs [tag-name]` - List jobs grouped by tag

Options:
- `-v, --verbose` - Show verbose output (list associated jobs)
- `-a, --all` - Apply to all jobs (for rm and clear commands)
- `-f, --force` - Skip confirmation for destructive operations

### Run Requirements

A job can declare **requirements** (preconditions). Before each scheduled run, the daemon checks them; if **any** requirement is not met, that run is **skipped** and the reason is written to the job's log (see `jm2 logs <job>`) and shown by `jm2 show <job>`. Jobs with no requirements always run, so existing jobs are unaffected.

Add requirements with `--require` / `-R` on `jm2 add` (repeatable), and manage them on `jm2 edit` with `--require` (replace all), `--require-append`, `--require-remove`, and `--clear-requirements`.

Available requirements:

| Requirement | Met when… |
|-------------|-----------|
| `ac` | On AC power (not battery) |
| `wifi` | Connected to Wi-Fi |
| `ssid:<name>` | Connected to the Wi-Fi network `<name>` |
| `ethernet` | Connected via wired Ethernet |
| `online` | The internet is reachable |
| `vpn` / `not-vpn` | A VPN connection is / is not active |
| `disk-free:<gb>[:<path>]` | At least `<gb>` GB free on `<path>` (defaults to `/`) |
| `path-exists:<path>` | `<path>` exists (e.g. a mounted volume); paths may contain spaces |
| `screen-locked` / `screen-unlocked` | The screen is locked / unlocked |
| `script:<js>` | An inline Node.js expression/body returns a truthy value |

Platform support:

| Requirement | macOS | Linux | Windows |
|-------------|:-----:|:-----:|:-------:|
| `ac` | ✅ | ✅ | ✅ |
| `wifi`, `ssid` | ✅ | ✅¹ | ✅ |
| `ethernet` | ✅ | ✅¹ | ✅ |
| `online` | ✅ | ✅ | ✅ |
| `vpn`, `not-vpn` | ✅ | ✅ | ⚠️² |
| `disk-free`, `path-exists` | ✅ | ✅ | ✅ |
| `screen-locked`, `screen-unlocked` | ✅ | ❌ | ❌ |
| `script` | ✅ | ✅ | ✅ |

A requirement that is **not supported** on the current OS is *unevaluable* and, per the "unevaluable → met" policy, is **treated as met (the job still runs)**. `jm2 add`/`jm2 edit` warn when a requirement won't apply on the current platform, and the daemon notes it in the job's log at run time. Requirement checks run in the daemon via direct executable invocation, so they don't depend on which shell launched jm2.

¹ Linux Wi-Fi/SSID/Ethernet detection needs `iwgetid`/`nmcli`. ² Windows VPN detection is best-effort.

Behavior:

- **Skip is per-run.** A cron job waits for its next scheduled time; a one-time (`--at`/`--in`) job is marked skipped and will not run.
- **Unevaluable requirements run anyway.** If a requirement cannot be checked on the current machine, it is treated as met.
- **`script:` errors skip.** If an inline script throws, times out (5s), or has a syntax error, the requirement is treated as **not met**. The script may `return` a value or be a bare expression, and receives `require`, `process`, `os`, `job`, and `console`.
- **Manual `jm2 run` bypasses requirements** — an explicit run always executes.

Examples:

```bash
# Only back up when on AC power, online, and with 10GB free
jm2 add "backup.sh" --cron "0 2 * * *" --name backup --require ac --require online --require "disk-free:10"

# Only sync on the home Wi-Fi network
jm2 add "sync.sh" --cron "*/30 * * * *" --require "ssid:HomeNet"

# Only run when an external drive is mounted (path may contain spaces)
jm2 add "archive.sh" --cron "0 * * * *" --require "path-exists:/Volumes/My Backup"

# Manage requirements on an existing job
jm2 edit backup --require-append not-vpn      # add one
jm2 edit backup --require-remove online       # remove one
jm2 edit backup --clear-requirements          # remove all
```

### Logs and History

#### `jm2 logs [id|name]`
View job execution logs.

```bash
# View all recent logs
jm2 logs

# View logs for specific job
jm2 logs nightly-backup

# Follow logs in real-time
jm2 logs --follow

# Show last N lines
jm2 logs --lines 100

# Filter by date
jm2 logs --since "2024-12-01"
jm2 logs --until "2024-12-15"
```

Options:
- `--follow, -f` - Follow log output in real-time
- `--lines, -n <count>` - Number of lines to show (default: 50)
- `--since <datetime>` - Show logs since datetime
- `--until <datetime>` - Show logs until datetime
- `--errors` - Show only error logs

#### `jm2 history [id|name]`
View job execution history.

```bash
# View all execution history
jm2 history

# View history for specific job
jm2 history nightly-backup

# Show last N executions
jm2 history --count 20
```

Options:
- `--count, -c <number>` - Number of executions to show (default: 10)
- `--failed` - Show only failed executions
- `--success` - Show only successful executions

### Utility Commands

#### `jm2 flush`
Clear completed one-time jobs and old logs.

```bash
# Clear completed one-time jobs
jm2 flush

# Clear logs older than 30 days
jm2 flush --logs --days 30

# Clear all history
jm2 flush --history

# Force without confirmation
jm2 flush --force
```

Options:
- `--logs` - Clear old log files
- `--history` - Clear execution history
- `--days <number>` - Clear items older than N days (default: 7)
- `--force, -f` - Skip confirmation prompt

#### `jm2 export`
Export jobs configuration.

```bash
# Export to stdout
jm2 export

# Export to file
jm2 export --output jobs.json

# Export specific jobs
jm2 export --tag production
```

Options:
- `--output, -o <file>` - Output file path
- `--tag, -t <tag>` - Export only jobs with this tag

#### `jm2 import`
Import jobs from configuration file.

```bash
jm2 import jobs.json

# Merge with existing jobs
jm2 import jobs.json --merge

# Replace all existing jobs
jm2 import jobs.json --replace
```

Options:
- `--merge` - Merge with existing jobs (default)
- `--replace` - Replace all existing jobs

## Cron Expression Reference

```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 6) (Sunday to Saturday)
│ │ │ │ │
│ │ │ │ │
* * * * *
```

### Common Examples

| Expression | Description |
|------------|-------------|
| `* * * * *` | Every minute |
| `*/5 * * * *` | Every 5 minutes |
| `0 * * * *` | Every hour |
| `0 0 * * *` | Every day at midnight |
| `0 2 * * *` | Every day at 2:00 AM |
| `0 0 * * 0` | Every Sunday at midnight |
| `0 0 1 * *` | First day of every month |
| `0 9-17 * * 1-5` | Every hour from 9 AM to 5 PM, Monday to Friday |

## Datetime Format for `--at`

The `--at` option accepts flexible datetime formats:

### Time Only (HH:mm or HH:mm:ss)
Schedules for today, or **tomorrow if the time has already passed**.

```bash
# Schedule for 3:30 PM today (or tomorrow if it's past 3:30 PM)
jm2 add "echo 'meeting'" --at "15:30" --name meeting

# With seconds
jm2 add "node task.js" --at "09:00:00" --name morning-task
```

### Date + Time (Full datetime)
Schedules for the exact datetime. **Shows error if the time is in the past.**

```bash
# ISO 8601 format
jm2 add "node deploy.js" --at "2024-12-25T10:00:00" --name deploy

# Simple format
jm2 add "npm run backup" --at "2024-12-25 10:00" --name backup

# With seconds
jm2 add "node task.js" --at "2024-12-25 10:00:00" --name task
```

### Date Only (YYYY-MM-DD)
Schedules for midnight (00:00:00) on that date. **Shows error if the date is in the past.**

```bash
jm2 add "npm run report" --at "2024-12-31" --name year-end
```

### Supported Formats Summary

| Format | Example | Behavior |
|--------|---------|----------|
| `HH:mm` | `15:30` | Today, or tomorrow if past |
| `HH:mm:ss` | `15:30:00` | Today, or tomorrow if past |
| `YYYY-MM-DD` | `2024-12-25` | Midnight on date (error if past) |
| `YYYY-MM-DD HH:mm` | `2024-12-25 10:00` | Exact datetime (error if past) |
| `YYYY-MM-DD HH:mm:ss` | `2024-12-25 10:00:00` | Exact datetime (error if past) |
| `YYYY-MM-DDTHH:mm:ss` | `2024-12-25T10:00:00` | ISO 8601 (error if past) |

## Duration Format

For `--in`, `--timeout` options:

| Format | Description |
|--------|-------------|
| `30s` | 30 seconds |
| `5m` | 5 minutes |
| `2h` | 2 hours |
| `1d` | 1 day |
| `1w` | 1 week |
| `1h30m` | 1 hour and 30 minutes |

## Configuration

JM2 stores its data in `~/.jm2/`:

```
~/.jm2/
├── config.json         # Daemon configuration
├── jobs.json           # Job definitions
├── daemon.pid          # Daemon process ID
├── daemon.log          # Daemon logs
└── logs/               # Job execution logs (named by task)
    ├── nightly-backup.log
    ├── hourly-test.log
    ├── job-1.log       # Auto-generated name
    └── job-2.log
```

### Configuration Options

Edit `~/.jm2/config.json`:

```json
{
  "logRetentionDays": 30,
  "historyRetentionDays": 90,
  "maxConcurrentJobs": 10,
  "defaultShell": "/bin/bash",
  "timezone": "UTC"
}
```

## Exit Codes

| Code | Description |
|------|-------------|
| 0 | Success |
| 1 | General error |
| 2 | Invalid arguments |
| 3 | Daemon not running |
| 4 | Job not found |
| 5 | Permission denied |
| 6 | Job name already exists |
| 7 | Scheduled time is in the past |

## Examples

### Backup Database Every Night

```bash
jm2 add "pg_dump mydb > /backups/db-$(date +%Y%m%d).sql" \
  --cron "0 2 * * *" \
  --name db-backup \
  --tag backup \
  --tag database \
  --cwd /home/user
```

### Run Tests Every Hour During Work Hours

```bash
jm2 add "npm test" \
  --cron "0 9-17 * * 1-5" \
  --name work-tests \
  --tag testing \
  --cwd /home/user/project \
  --timeout 10m
```

### Schedule a One-time Deployment

```bash
jm2 add "npm run deploy:production" \
  --at "2024-12-25 03:00" \
  --name christmas-deploy \
  --tag deployment \
  --cwd /home/user/app \
  --env NODE_ENV=production
```

### Set a Reminder in 30 Minutes

```bash
jm2 add "notify-send 'Meeting in 5 minutes!'" \
  --in 30m \
  --name meeting-reminder
```

## License

JM2 is made available under the terms of the GNU Affero General Public License 3.0 (AGPL 3.0). For other licenses contact [me](mailto:landicefu@gmail.com).
