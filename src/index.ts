#!/usr/bin/env node

import { GodotServer } from './server/GodotServer.js';

const server = new GodotServer();

server.run().catch((error: unknown) => {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  console.error('Failed to run server:', errorMessage);
  process.exit(1);
});
