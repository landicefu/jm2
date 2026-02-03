/**
 * JM2 CLI
 * Command-line interface using Commander.js
 */

import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { startCommand } from './commands/start.js';
import { stopCommand } from './commands/stop.js';
import { restartCommand } from './commands/restart.js';
import { statusCommand } from './commands/status.js';
import { addCommand } from './commands/add.js';
import { listCommand } from './commands/list.js';
import { showCommand } from './commands/show.js';
import { removeCommand } from './commands/remove.js';
import { pauseCommand } from './commands/pause.js';
import { resumeCommand } from './commands/resume.js';
import { runCommand } from './commands/run.js';
import { editCommand } from './commands/edit.js';
import { configCommand } from './commands/config.js';
import { logsCommand } from './commands/logs.js';
import { historyCommand } from './commands/history.js';
import { flushCommand } from './commands/flush.js';
import { exportCommand } from './commands/export.js';
import { importCommand } from './commands/import.js';
import { installCommand } from './commands/install.js';
import { uninstallCommand } from './commands/uninstall.js';
import { tagsCommand } from './commands/tags.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Collect multiple option values
 * @param {string} value - Current value
 * @param {Array} previous - Previous values
 * @returns {Array} Combined values
 */
function collect(value, previous) {
  return previous.concat([value]);
}

/**
 * Get package version from package.json
 * @returns {string} Package version
 */
function getVersion() {
  try {
    const packagePath = join(__dirname, '../../package.json');
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
    return packageJson.version;
  } catch {
    return '0.1.0';
  }
}

/**
 * Run the CLI
 */
export async function runCli() {
  const program = new Command();

  program
    .name('jm2')
    .description('JM2 (Job Manager 2) - A simple yet powerful job scheduler')
    .version(getVersion(), '-v, --version', 'Display version number')
    .showHelpAfterError()
    .action(() => {
      program.help();
    });

  // Daemon management commands
  program
    .command('start')
    .description('Start the JM2 daemon')
    .option('-f, --foreground', 'Run in foreground (don\'t daemonize)', false)
    .action(async (options) => {
      const exitCode = await startCommand(options);
      process.exit(exitCode);
    });

  program
    .command('stop')
    .description('Stop the JM2 daemon')
    .action(async () => {
      const exitCode = await stopCommand();
      process.exit(exitCode);
    });

  program
    .command('restart')
    .description('Restart the JM2 daemon')
    .action(async () => {
      const exitCode = await restartCommand();
      process.exit(exitCode);
    });

  program
    .command('status')
    .description('Show daemon status and statistics')
    .action(async () => {
      const exitCode = await statusCommand();
      process.exit(exitCode);
    });

  // Job management commands
  program
    .command('add [command]')
    .description('Add a new job')
    .option('-n, --name <name>', 'Job name (unique identifier)')
    .option('-c, --cron <expression>', 'Cron expression for recurring jobs')
    .option('-a, --at <datetime>', 'Run once at specific datetime (ISO 8601, "today 10:00", "tomorrow 14:30")')
    .option('-i, --delay <duration>', 'Run once after duration (e.g., "30m", "2h", "1d")')
    .option('-t, --tag <tag>', 'Add a tag (can be used multiple times)', collect, [])
    .option('--cwd <path>', 'Working directory for job execution')
    .option('-e, --env <env>', 'Environment variable (format: KEY=value, can be used multiple times)', collect, [])
    .option('--timeout <duration>', 'Timeout for job execution (e.g., "30m", "2h")')
    .option('--retry <count>', 'Number of retry attempts on failure', '0')
    .option('--examples', 'Show common examples of jm2 add')
    .action(async (command, options) => {
      const exitCode = await addCommand(command, options);
      process.exit(exitCode);
    });

  program
    .command('list')
    .description('List all jobs')
    .option('-t, --tag <tag>', 'Filter by tag')
    .option('-s, --status <status>', 'Filter by status (active, paused, completed, failed)')
    .option('--type <type>', 'Filter by type (cron, once)')
    .option('-v, --verbose', 'Show detailed information', false)
    .action(async (options) => {
      const exitCode = await listCommand(options);
      process.exit(exitCode);
    });

  program
    .command('show <job>')
    .description('Show detailed information about a job')
    .action(async (job) => {
      const exitCode = await showCommand(job);
      process.exit(exitCode);
    });

  program
    .command('remove <jobs...>')
    .description('Remove one or more jobs')
    .option('-f, --force', 'Force removal without confirmation', false)
    .action(async (jobs, options) => {
      const exitCode = await removeCommand(jobs, options);
      process.exit(exitCode);
    });

  program
    .command('pause <jobs...>')
    .description('Pause one or more jobs')
    .action(async (jobs) => {
      const exitCode = await pauseCommand(jobs);
      process.exit(exitCode);
    });

  program
    .command('resume <jobs...>')
    .description('Resume one or more paused jobs')
    .action(async (jobs) => {
      const exitCode = await resumeCommand(jobs);
      process.exit(exitCode);
    });

  program
    .command('run <job>')
    .description('Run a job manually')
    .option('-w, --wait', 'Wait for job to complete and show output', false)
    .action(async (job, options) => {
      const exitCode = await runCommand(job, options);
      process.exit(exitCode);
    });

  program
    .command('edit <job>')
    .description('Edit an existing job')
    .option('--command <command>', 'New command to execute')
    .option('-n, --name <name>', 'New job name')
    .option('-c, --cron <expression>', 'New cron expression')
    .option('-a, --at <datetime>', 'New datetime to run once (replaces cron)')
    .option('-i, --delay <duration>', 'New relative time to run once (replaces cron)')
    .option('--cwd <path>', 'New working directory')
    .option('-e, --env <env>', 'Set environment variable (format: KEY=value, can be used multiple times)', collect, [])
    .option('--timeout <duration>', 'New timeout for job execution')
    .option('--retry <count>', 'New retry count on failure')
    .option('-t, --tag <tag>', 'Set tags (replaces all existing tags, can be used multiple times)', collect, [])
    .option('--tag-append <tag>', 'Append tags to existing tags (can be used multiple times)', collect, [])
    .option('--tag-remove <tag>', 'Remove tags from existing tags (can be used multiple times)', collect, [])
    .action(async (job, options) => {
      const exitCode = await editCommand(job, options);
      process.exit(exitCode);
    });

  // Configuration command
  program
    .command('config')
    .description('View or modify configuration settings')
    .option('-s, --show', 'Show all configuration (default)')
    .option('--log-max-size <size>', 'Set maximum log file size (e.g., 10mb, 50MB)')
    .option('--log-max-files <count>', 'Set maximum number of log files to keep')
    .option('--level <level>', 'Set log level (DEBUG, INFO, WARN, ERROR)')
    .option('--max-concurrent <count>', 'Set maximum concurrent job executions')
    .option('--reset', 'Reset configuration to defaults')
    .action(async (options) => {
      const exitCode = await configCommand(options);
      process.exit(exitCode);
    });

  // Logs command
  program
    .command('logs <job>')
    .description('View job execution logs')
    .option('-n, --lines <count>', 'Number of lines to show (default: 50)', '50')
    .option('-f, --follow', 'Follow log output in real-time', false)
    .option('--since <time>', 'Show logs since time (e.g., "1h", "30m", "2026-01-31")')
    .option('--until <time>', 'Show logs until time')
    .option('--timestamps', 'Show timestamps', true)
    .option('--no-timestamps', 'Hide timestamps')
    .action(async (job, options) => {
      const exitCode = await logsCommand(job, options);
      process.exit(exitCode);
    });

  // History command
  program
    .command('history [job]')
    .description('Show execution history for a job or all jobs')
    .option('-f, --failed', 'Show only failed executions', false)
    .option('-s, --success', 'Show only successful executions', false)
    .option('-l, --limit <count>', 'Maximum number of entries to show (default: 20)', '20')
    .action(async (job, options) => {
      const exitCode = await historyCommand(job, options);
      process.exit(exitCode);
    });

  // Flush command
  program
    .command('flush')
    .description('Clean up completed one-time jobs, old logs, and history')
    .option('--no-jobs', 'Skip removing completed one-time jobs')
    .option('--logs <duration>', 'Remove logs older than duration (e.g., "7d", "24h")')
    .option('--history <duration>', 'Remove history older than duration (e.g., "30d")')
    .option('-a, --all', 'Remove all logs and history (equivalent to --logs --history with no age limit)')
    .option('--force', 'Skip confirmation prompt', false)
    .action(async (options) => {
      const exitCode = await flushCommand(options);
      process.exit(exitCode);
    });

  // Export command
  program
    .command('export')
    .description('Export job configurations to a JSON file')
    .option('-o, --output <file>', 'Output file path (default: jm2-export.json)', 'jm2-export.json')
    .action(async (options) => {
      const exitCode = await exportCommand(options);
      process.exit(exitCode);
    });

  // Import command
  program
    .command('import <file>')
    .description('Import job configurations from a JSON file')
    .option('-s, --skip', 'Skip jobs with conflicting names instead of renaming', false)
    .option('-f, --force', 'Skip confirmation prompt', false)
    .action(async (file, options) => {
      const exitCode = await importCommand(file, options);
      process.exit(exitCode);
    });

  // Install command
  program
    .command('install')
    .description('Register JM2 daemon to start on system boot')
    .option('--user', 'Install for current user only (default)', false)
    .option('--system', 'Install system-wide (requires admin/root)', false)
    .action(async (options) => {
      const exitCode = await installCommand(options);
      process.exit(exitCode);
    });

  // Uninstall command
  program
    .command('uninstall')
    .description('Unregister JM2 daemon from system startup')
    .option('--user', 'Uninstall user-level registration (default)', false)
    .option('--system', 'Uninstall system-wide registration (requires admin/root)', false)
    .option('-f, --force', 'Skip confirmation prompt', false)
    .action(async (options) => {
      const exitCode = await uninstallCommand(options);
      process.exit(exitCode);
    });

  // Tags command
  program
    .command('tags <subcommand> [args...]')
    .description('Manage job tags')
    .option('-v, --verbose', 'Show verbose output', false)
    .option('-a, --all', 'Apply to all jobs', false)
    .option('-f, --force', 'Skip confirmation for destructive operations', false)
    .addHelpText('after', `
Examples:
  jm2 tags list                    List all tags with job counts
  jm2 tags list -v                 List tags with associated jobs
  jm2 tags add production 1 2 3    Add "production" tag to jobs 1, 2, 3
  jm2 tags rm staging 1 2          Remove "staging" tag from jobs 1, 2
  jm2 tags rm old-tag --all        Remove "old-tag" from all jobs
  jm2 tags clear 1 2               Clear all tags from jobs 1, 2
  jm2 tags clear --all --force     Clear all tags from all jobs
  jm2 tags rename old new          Rename tag "old" to "new"
  jm2 tags jobs                    Show all jobs grouped by tag
  jm2 tags jobs production         Show jobs with "production" tag
    `)
    .action(async (subcommand, args, options) => {
      const exitCode = await tagsCommand(subcommand, args || [], options);
      process.exit(exitCode);
    });

  // Parse command line arguments
  await program.parseAsync();
}

export default { runCli };
