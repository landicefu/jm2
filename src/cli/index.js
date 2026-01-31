/**
 * jm2 CLI
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
    .description('Job Manager 2 - A simple yet powerful job scheduler')
    .version(getVersion(), '-v, --version', 'Display version number');

  // Daemon management commands
  program
    .command('start')
    .description('Start the jm2 daemon')
    .option('-f, --foreground', 'Run in foreground (don\'t daemonize)', false)
    .action(async (options) => {
      const exitCode = await startCommand(options);
      process.exit(exitCode);
    });

  program
    .command('stop')
    .description('Stop the jm2 daemon')
    .action(async () => {
      const exitCode = await stopCommand();
      process.exit(exitCode);
    });

  program
    .command('restart')
    .description('Restart the jm2 daemon')
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
    .command('add <command>')
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

  // Parse command line arguments
  await program.parseAsync();
}

export default { runCli };
