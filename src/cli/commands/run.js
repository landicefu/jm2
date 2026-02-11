/**
 * JM2 run command
 * Manually execute a job immediately
 */

import { send, sendWithStream } from '../../ipc/client.js';
import { MessageType } from '../../ipc/protocol.js';
import { printSuccess, printError, printInfo } from '../utils/output.js';
import { isDaemonRunning } from '../../daemon/index.js';

/**
 * Execute the run command
 * @param {string} jobRef - Job ID or name
 * @param {object} options - Command options
 * @returns {Promise<number>} Exit code
 */
export async function runCommand(jobRef, options = {}) {
  // Check if daemon is running
  if (!isDaemonRunning()) {
    printError('Daemon is not running. Start it with: jm2 start');
    return 1;
  }

  if (!jobRef || jobRef.trim() === '') {
    printError('Job ID or name is required');
    return 1;
  }

  try {
    // Determine if jobRef is an ID (numeric) or name
    const jobId = parseInt(jobRef, 10);
    const message = isNaN(jobId)
      ? { type: MessageType.JOB_RUN, jobName: jobRef, wait: options.wait }
      : { type: MessageType.JOB_RUN, jobId, wait: options.wait };

    printInfo(`Running job: ${jobRef}...`);

    if (options.wait) {
      // Use streaming for real-time output
      const response = await sendWithStream(message, {
        timeoutMs: null,
        onStream: (chunk) => {
          if (chunk.stream === 'stdout') {
            process.stdout.write(chunk.data);
          } else if (chunk.stream === 'stderr') {
            process.stderr.write(chunk.data);
          }
        },
      });

      if (response.type === MessageType.ERROR) {
        printError(response.message);
        return 1;
      }

      if (response.type === MessageType.JOB_RUN_RESULT) {
        const result = response.result;

        if (result.error) {
          printError(`Job execution failed: ${result.error}`);
          return 1;
        }

        // Display final results
        if (result.status === 'success') {
          printSuccess('Job completed successfully');
          console.log(`\nExit code: ${result.exitCode || 0}`);
          console.log(`Duration: ${formatDuration(result.duration || 0)}`);
        } else if (result.status === 'timeout') {
          printError('Job timed out');
          return 1;
        } else {
          printError(`Job failed with status: ${result.status}`);
          return 1;
        }

        return 0;
      }
    } else {
      // Non-waiting mode - just queue the job
      const response = await send(message, { timeoutMs: 5000 });

      if (response.type === MessageType.ERROR) {
        printError(response.message);
        return 1;
      }

      if (response.type === MessageType.JOB_RUN_RESULT) {
        const result = response.result;
        printSuccess(`Job queued for execution (ID: ${result.jobId || jobRef})`);
        printInfo('Use --wait to wait for completion and see output');
        return 0;
      }
    }

    printError('Unexpected response from daemon');
    return 1;
  } catch (error) {
    printError(`Failed to run job: ${error.message}`);
    return 1;
  }
}

/**
 * Format duration in milliseconds to human-readable string
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
function formatDuration(ms) {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(1);
  return `${minutes}m ${seconds}s`;
}

export default { runCommand };
