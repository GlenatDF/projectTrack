import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Node environment — sufficient for pure function tests that don't touch the DOM.
    // If DOM-dependent tests are added later, switch to 'jsdom' and install jsdom.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
