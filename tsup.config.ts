import { defineConfig } from 'tsup';

// Bundle the stdio MCP server into a single executable file so agents can run
// it with `node dist/index.js` (or via the `team-vault-mcp` bin) without a
// node_modules install.
export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  target: 'node20',
  clean: true,
  sourcemap: true,
  banner: { js: '#!/usr/bin/env node' },
});
