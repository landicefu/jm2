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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

  // Parse command line arguments
  await program.parseAsync();
}

export default { runCli };
