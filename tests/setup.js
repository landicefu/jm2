/**
 * Global test setup
 *
 * Point JM2_DATA_DIR at a throwaway directory so no test can ever read or
 * write the real ~/.jm2 (jobs.json, history.db, daemon socket, ...).
 * Tests that need their own directory still override this per test.
 */

import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

process.env.JM2_DATA_DIR = mkdtempSync(join(tmpdir(), 'jm2-test-data-'));
