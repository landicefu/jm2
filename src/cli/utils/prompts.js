/**
 * Prompt utilities for JM2 CLI
 * Provides confirmation prompts and user interaction helpers
 */

import readline from 'node:readline';

/**
 * Ask for confirmation
 * @param {string} message - Confirmation message
 * @param {boolean} [defaultValue=false] - Default value if user just presses enter
 * @returns {Promise<boolean>} True if confirmed
 */
export async function confirm(message, defaultValue = false) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const defaultPrompt = defaultValue ? 'Y/n' : 'y/N';

  return new Promise((resolve) => {
    rl.question(`${message} [${defaultPrompt}] `, (answer) => {
      rl.close();

      const trimmed = answer.trim().toLowerCase();

      if (trimmed === '') {
        resolve(defaultValue);
      } else if (trimmed === 'y' || trimmed === 'yes') {
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
}

/**
 * Confirm destructive action
 * @param {string} action - Description of the action
 * @param {boolean} [force=false] - Skip confirmation if true
 * @returns {Promise<boolean>} True if confirmed or forced
 */
export async function confirmDestructive(action, force = false) {
  if (force) {
    return true;
  }

  return await confirm(`Are you sure you want to ${action}?`, false);
}

export default {
  confirm,
  confirmDestructive,
};
