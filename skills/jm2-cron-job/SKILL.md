---
name: jm2-cron-job
description: "Schedule, manage, and inspect periodic (cron) and one-time (at) jobs using the jm2 CLI. Use when the user wants to create/list/edit/remove scheduled jobs, view job logs or history, back up/restore job data, install the daemon at boot, or manage job tags. Covers every command, flag, and the accepted datetime/duration/cron formats."
---

# jm2 — Job Manager 2 CLI

`jm2` is a local job scheduler that combines `cron` (recurring) and `at` (one-time) functionality. Jobs are managed by a background daemon; data lives in `~/.jm2/`.

## When to Use

✅ **USE this skill when the user wants to:**
- Schedule a recurring command (cron expression)
- Schedule a one-time command at a specific time or after a delay
- List / inspect / edit / pause / resume / remove scheduled jobs
- View logs or execution history of a scheduled job
- Manage job tags
- Install the jm2 daemon to start on boot
- Back up or restore jm2 data

❌ **DO NOT use this skill for:**
- System-wide cron edits (`crontab -e`) — jm2 is a separate scheduler
- Running ad-hoc shell commands that don't need scheduling

## Prerequisites

The daemon must be running for most commands (`add`, `list`, `run`, `edit`, …). Start it with `jm2 start`. Only `start`, `stop`, `status`, `install`, `uninstall`, `backup`, `restore`, `export`, `import` work without a running daemon (some still require it — check the output).

## Global Flags

| Flag | Description |
|------|-------------|
| `-v, --version` | Display version number |
| `-h, --help` | Display help (works on any subcommand too) |

---

## Daemon Management

### `jm2 start [options]`
Start the JM2 daemon.

| Option | Description |
|--------|-------------|
| `-f, --foreground` | Run in foreground (don't daemonize) |

### `jm2 stop`
Stop the daemon.

### `jm2 restart`
Restart the daemon.

### `jm2 status`
Show daemon status, PID, uptime, and job statistics.

### `jm2 install [options]`
Register the daemon to start on system boot (launchd on macOS, systemd on Linux).

| Option | Description |
|--------|-------------|
| `--user` | Install for current user only (default) |
| `--system` | Install system-wide (requires admin/root) |

### `jm2 uninstall [options]`
Unregister the daemon from system startup.

| Option | Description |
|--------|-------------|
| `--user` | Uninstall user-level registration (default) |
| `--system` | Uninstall system-wide registration (requires admin/root) |
| `-f, --force` | Skip confirmation prompt |

---

## Adding Jobs

### `jm2 add [options] <command>`
Add a new job. Exactly one of `--cron`, `--at`, or `--delay` must be provided.

| Option | Description |
|--------|-------------|
| `-n, --name <name>` | Job name (unique identifier; auto-generated if omitted) |
| `-c, --cron <expression>` | Cron expression for recurring jobs |
| `-a, --at <datetime>` | Run once at specific datetime |
| `-i, --delay <duration>` | Run once after duration (e.g., `30m`, `2h`, `1d`) |
| `-t, --tag <tag>` | Add a tag (repeatable) |
| `--cwd <path>` | Working directory |
| `-e, --env <KEY=value>` | Environment variable (repeatable) |
| `--timeout <duration>` | Max execution time (e.g., `30m`, `2h`) |
| `--retry <count>` | Number of retry attempts on failure (default: `0`) |
| `-R, --require <requirement>` | Add a run requirement; the run is skipped if unmet (repeatable). See [Run Requirements](#run-requirements-conditional-skipping) |
| `--examples` | Print common `jm2 add` examples and exit |

> Note: `--cron`, `--at`, and `--delay` are mutually exclusive. `--delay` replaced the older `--in` flag.

### Accepted `--at` datetime formats
- `HH:mm` or `HH:mm:ss` — today, or tomorrow if already past
- `YYYY-MM-DD` — midnight on that date (error if past)
- `YYYY-MM-DD HH:mm` / `YYYY-MM-DD HH:mm:ss`
- `YYYY-MM-DDTHH:mm:ss` (ISO 8601)
- Natural language: `"today 14:30"`, `"tomorrow 09:00"`

### Accepted duration format (`--delay`, `--timeout`)
`30s`, `5m`, `2h`, `1d`, `1w`, or compound like `1h30m`.

### Cron expression
Standard 5-field (`minute hour day-of-month month day-of-week`) or 6-field with seconds. Supports ranges (`9-17`), lists (`1,3,5`), and steps (`*/5`).

Common patterns:

| Expression | Meaning |
|------------|---------|
| `* * * * *` | Every minute |
| `*/5 * * * *` | Every 5 minutes |
| `0 * * * *` | Every hour |
| `0 2 * * *` | Daily at 2:00 AM |
| `0 0 * * 0` | Every Sunday at midnight |
| `0 9-17 * * 1-5` | Hourly, 9 AM–5 PM, weekdays |

---

## Run Requirements (conditional skipping)

A job can declare **requirements** (preconditions). Before each scheduled run, the
daemon checks them; if **any** requirement is not met, that run is **skipped** and
the reason is written to the job's log (visible via `jm2 logs <job>`) and shown by
`jm2 show <job>`. Jobs with no requirements always run (backward compatible).

Add requirements with `-R, --require <requirement>` on `jm2 add` (repeatable), and
manage them on `jm2 edit` with `--require` (replace all), `--require-append`,
`--require-remove`, and `--clear-requirements`.

### Available requirements

| Requirement | Met when… |
|-------------|-----------|
| `ac` | On AC power (not battery) |
| `wifi` | Connected to Wi-Fi |
| `ssid:<name>` | Connected to the Wi-Fi network `<name>` |
| `ethernet` | Connected via wired Ethernet |
| `online` | The internet is reachable |
| `vpn` | A VPN connection appears active |
| `not-vpn` | No VPN connection is active |
| `disk-free:<gb>[:<path>]` | At least `<gb>` gigabytes free on `<path>` (defaults to `/`) |
| `path-exists:<path>` | `<path>` exists (e.g. an external/mounted volume). Paths may contain spaces |
| `screen-locked` | The screen is locked |
| `screen-unlocked` | The screen is unlocked |
| `script:<js>` | An inline Node.js expression/body returns a truthy value |

### Platform support

| Requirement | macOS | Linux | Windows |
|-------------|:-----:|:-----:|:-------:|
| `ac` | ✅ | ✅ | ✅ |
| `wifi`, `ssid:<name>` | ✅ | ✅¹ | ✅ |
| `ethernet` | ✅ | ✅¹ | ✅ |
| `online` | ✅ | ✅ | ✅ |
| `vpn`, `not-vpn` | ✅ | ✅ | ⚠️² |
| `disk-free`, `path-exists` | ✅ | ✅ | ✅ |
| `screen-locked`, `screen-unlocked` | ✅ | ❌ | ❌ |
| `script:<js>` | ✅ | ✅ | ✅ |

A requirement that is **not supported** on the current OS is *unevaluable* and, per the
"unevaluable → met" policy, is **treated as met (the job still runs)**. `jm2 add` and
`jm2 edit` print a warning when a requirement won't apply on the current platform, and the
daemon notes it in the job's log at run time.

- ¹ Linux Wi-Fi/SSID/Ethernet detection needs `iwgetid` and/or `nmcli` present.
- ² Windows VPN detection is best-effort (adapter-name heuristic only).

### Behavior

- **Skip is per-run.** A cron job simply waits for its next scheduled time; a
  one-time (`--at`/`--delay`) job is marked skipped and will not run.
- **Unevaluable requirements run anyway.** If a requirement cannot be checked on the
  current machine (e.g. Wi-Fi state on a headless box), it is treated as met.
- **`script:` errors skip.** If an inline script throws, times out (5s), or has a
  syntax error, the requirement is treated as **not met** (the run is skipped).
  The script may `return` a value or be a bare expression, and receives `require`,
  `process`, `os`, `job`, and `console`.
- **Manual `jm2 run` bypasses requirements** — an explicit run always executes.

### Examples

```bash
# Only back up when on AC power, online, and with 10GB free
jm2 add "backup.sh" --cron "0 2 * * *" --name backup \
  --require ac --require online --require "disk-free:10"

# Only sync on the home Wi-Fi network
jm2 add "sync.sh" --cron "*/30 * * * *" --require "ssid:HomeNet"

# Only run when an external drive is mounted (path may contain spaces)
jm2 add "archive.sh" --cron "0 * * * *" --require "path-exists:/Volumes/My Backup"

# Custom condition via inline Node.js
jm2 add "task.sh" --cron "0 9 * * *" --require "script:new Date().getDay() !== 0"

# Manage requirements on an existing job
jm2 edit backup --require-append not-vpn      # add one
jm2 edit backup --require-remove online       # remove one
jm2 edit backup --require ac --require wifi    # replace all
jm2 edit backup --clear-requirements          # remove all
```

---

## Inspecting Jobs

### `jm2 list [options]`
List all jobs.

| Option | Description |
|--------|-------------|
| `-t, --tag <tag>` | Filter by tag |
| `-s, --status <status>` | Filter by status: `active`, `paused`, `completed`, `failed` |
| `--type <type>` | Filter by type: `cron`, `once` |
| `-v, --verbose` | Show detailed information |

### `jm2 show [options] <job>`
Show full details for a job (by ID or name).

| Option | Description |
|--------|-------------|
| `--recreate-command-only` | Print only the `jm2 add …` command that would recreate this job |

### `jm2 history [options] [job]`
View execution history, optionally scoped to one job.

| Option | Description |
|--------|-------------|
| `-f, --failed` | Show only failed executions |
| `-s, --success` | Show only successful executions |
| `-l, --limit <count>` | Maximum entries (default: `20`) |

### `jm2 logs [options] <job>`
View stdout/stderr logs for a job (job is required).

| Option | Description |
|--------|-------------|
| `-n, --lines <count>` | Number of lines to show (default: `50`) |
| `-f, --follow` | Follow log output in real time |
| `--since <time>` | Only logs since (e.g., `1h`, `30m`, `2026-01-31`) |
| `--until <time>` | Only logs until given time |
| `--timestamps` / `--no-timestamps` | Show or hide timestamps (default: shown) |

---

## Modifying Jobs

### `jm2 edit [options] <job>`
Edit an existing job.

| Option | Description |
|--------|-------------|
| `--command <command>` | New command to execute |
| `-n, --name <name>` | Rename the job |
| `-c, --cron <expression>` | New cron expression |
| `-a, --at <datetime>` | Convert to one-time job at datetime (replaces cron) |
| `-i, --delay <duration>` | Convert to one-time job after delay (replaces cron) |
| `--cwd <path>` | New working directory |
| `-e, --env <KEY=value>` | Set an env var (repeatable) |
| `--timeout <duration>` | New timeout |
| `--retry <count>` | New retry count |
| `-t, --tag <tag>` | **Replace** all tags (repeatable) |
| `--tag-append <tag>` | Append tag(s) (repeatable) |
| `--tag-remove <tag>` | Remove tag(s) (repeatable) |
| `--require <requirement>` | **Replace** all run requirements (repeatable) |
| `--require-append <requirement>` | Add run requirement(s) to the existing ones (repeatable) |
| `--require-remove <requirement>` | Remove run requirement(s) from the existing ones (repeatable) |
| `--clear-requirements` | Remove all run requirements |

### `jm2 remove [options] <jobs...>`
Remove one or more jobs (by ID or name). Space-separate multiple jobs.

| Option | Description |
|--------|-------------|
| `-f, --force` | Skip confirmation prompt |

### `jm2 pause <jobs...>`
Pause one or more jobs. No options.

### `jm2 resume <jobs...>`
Resume one or more paused jobs. No options.

### `jm2 run [options] <job>`
Trigger a job to run immediately (out of schedule).

| Option | Description |
|--------|-------------|
| `-w, --wait` | Wait for completion and print output |

---

## Tag Management

### `jm2 tags <subcommand> [args...] [options]`

Subcommands:

| Subcommand | Description |
|------------|-------------|
| `list` | List all tags with job counts |
| `add <tag> <job>...` | Add a tag to one or more jobs |
| `rm <tag> [<job>...]` | Remove a tag from listed jobs, or all jobs with `--all` |
| `clear [<job>...]` | Clear all tags from listed jobs, or all jobs with `--all --force` |
| `rename <old-tag> <new-tag>` | Rename a tag across every job |
| `jobs [tag-name]` | Show jobs grouped by tag, or jobs matching one tag |

Options:

| Option | Description |
|--------|-------------|
| `-v, --verbose` | Show associated jobs (for `list`) |
| `-a, --all` | Apply to all jobs (for `rm`, `clear`) |
| `-f, --force` | Skip confirmation for destructive ops |

---

## Maintenance & Config

### `jm2 flush [options]`
Clean up completed one-time jobs, old logs, and history.

| Option | Description |
|--------|-------------|
| `--no-jobs` | Skip removing completed one-time jobs |
| `--logs <duration>` | Remove logs older than duration (e.g., `7d`, `24h`) |
| `--history <duration>` | Remove history older than duration (e.g., `30d`) |
| `-a, --all` | Remove all logs and history (no age limit) |
| `--force` | Skip confirmation |

### `jm2 config [options]`
View or modify daemon configuration (`~/.jm2/config.json`).

| Option | Description |
|--------|-------------|
| `-s, --show` | Show all configuration (default) |
| `--log-max-size <size>` | Max log file size (e.g., `10mb`, `50MB`) |
| `--log-max-files <count>` | Max log files to retain |
| `--level <level>` | Log level: `DEBUG`, `INFO`, `WARN`, `ERROR` |
| `--max-concurrent <count>` | Max concurrent job executions |
| `--reset` | Reset config to defaults |

### `jm2 export [options]`
Export job configurations to JSON.

| Option | Description |
|--------|-------------|
| `-o, --output <file>` | Output path (default: `jm2-export.json`) |

### `jm2 import [options] <file>`
Import job configurations from a JSON file.

| Option | Description |
|--------|-------------|
| `-s, --skip` | Skip jobs with conflicting names instead of renaming |
| `-f, --force` | Skip confirmation prompt |

### `jm2 backup [options] [file]`
Create a compressed backup of all jm2 data (jobs, config, history, logs).

| Option | Description |
|--------|-------------|
| `-o, --output <file>` | Output path (default: `jm2-backup-<timestamp>.json.gz`) |

You can also pass the output path as the positional `[file]`.

### `jm2 restore [options] <file>`
Restore jm2 data from a backup file.

| Option | Description |
|--------|-------------|
| `-y, --yes` | Skip confirmation prompt |
| `-f, --force` | Force restore even if daemon is running |

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Invalid arguments |
| 3 | Daemon not running |
| 4 | Job not found |
| 5 | Permission denied |
| 6 | Job name already exists |
| 7 | Scheduled time is in the past |

---

## Quick Recipes

```bash
# Start the daemon and install it at boot
jm2 start
jm2 install

# Recurring: every day at 02:00
jm2 add "pg_dump mydb > /backups/db.sql" --cron "0 2 * * *" --name db-backup --tag backup

# One-time: in 30 minutes
jm2 add "notify-send 'Stand up'" --delay 30m --name standup

# One-time: at a specific datetime
jm2 add "npm run deploy" --at "2026-05-01 03:00" --name deploy --cwd /srv/app --env NODE_ENV=production

# Inspect
jm2 list --tag backup --verbose
jm2 show db-backup
jm2 logs db-backup -n 200 --follow
jm2 history db-backup --failed -l 5

# Modify
jm2 edit db-backup --cron "0 3 * * *" --tag-append critical
jm2 pause db-backup
jm2 resume db-backup
jm2 run db-backup --wait

# Cleanup
jm2 flush --logs 7d --history 30d --force
jm2 remove db-backup --force
```

## Data Locations

```
~/.jm2/
├── config.json         # Daemon configuration
├── jobs.json           # Job definitions
├── daemon.pid          # Daemon PID
├── daemon.log          # Daemon logs
└── logs/               # Per-job execution logs
    ├── <job-name>.log
    └── job-<n>.log     # Auto-generated names
```
