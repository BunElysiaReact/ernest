#!/usr/bin/env bun
import { createLogger } from './components/logger.js';
import { program } from './components/cli-program.js';

const logger = createLogger({
  time: true,
  emoji: true,
  level: 'info',
  prefix: '[ERNEST]'
});

// Display banner
logger.banner();

// Parse CLI arguments
const args = process.argv.slice(2);
const command = args[0];

try {
  await program(command, args.slice(1), logger);
} catch (error) {
  logger.error(`Command failed: ${error.message}`);
  if (error.stack) logger.debug(error.stack);
  process.exit(1);
}
