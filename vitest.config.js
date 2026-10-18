import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test file patterns
    include: ['tests/**/*.test.js'],

    // Exclude patterns
    exclude: ['node_modules', 'dist'],

    // Enable globals (describe, it, expect, etc.)
    globals: true,

    // Environment
    environment: 'node',

    // Keep tests away from the real ~/.jm2
    setupFiles: ['tests/setup.js'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.js'],
      exclude: ['src/**/*.test.js'],
    },

    // Timeout for tests
    testTimeout: 10000,

    // Reporter
    reporters: ['verbose'],
  },
});
