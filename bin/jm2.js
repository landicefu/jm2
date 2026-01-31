#!/usr/bin/env node

/**
 * jm2 CLI Entry Point
 * 
 * Usage:
 *   jm2 start              Start the daemon
 *   jm2 stop               Stop the daemon
 *   jm2 restart            Restart the daemon
 *   jm2 status             Show daemon status
 *   jm2 add <command>      Add a new job
 *   jm2 list               List all jobs
 *   jm2 show <id|name>     Show job details
 *   jm2 remove <id|name>   Remove a job
 *   jm2 pause <id|name>    Pause a job
 *   jm2 resume <id|name>   Resume a job
 *   jm2 run <id|name>      Run a job manually
 *   jm2 logs <id|name>     Show job logs
 *   jm2 history <id|name>  Show job history
 */

import { runCli } from '../src/cli/index.js';

runCli();
