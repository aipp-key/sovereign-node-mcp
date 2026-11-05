#!/usr/bin/env node
import dotenv from 'dotenv';
import { createSovereignMcpServer } from './server.js';

dotenv.config();

const { start } = createSovereignMcpServer();

start().catch((err) => {
  console.error('[Sovereign MCP Server] Fatal error:', err);
  process.exit(1);
});
