// src/components/cli-program.js
import { buildUI } from '../ui/bundler.js';
import { buildDocs } from '../md/bundler.js';
import { startDevServerUI } from '../ui/server.js';
import { startDevServerDocs } from '../md/server.js';
import { loadConfig } from './config.js';
import { showHelp, showVersion } from './help.js';
import { migrateProject } from './migrate.js';

// REMOVE the duplicate export at the bottom and just export the function
export async function program(command, args, logger) {
  switch (command) {
    case 'dev':
      await handleDev(args, logger);
      break;
    
    case 'build':
      await handleBuild(args, logger);
      break;
    
    case 'init':
      await handleInit(args, logger);
      break;
    
    case 'migrate':
      await handleMigrate(args, logger);
      break;
    
    case '--version':
    case '-v':
      showVersion();
      break;
    
    case '--help':
    case '-h':
    case undefined:
      showHelp();
      break;
    
    default:
      logger.error(`Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
}

async function handleDev(args, logger) {
  const options = parseArgs(args);
  const config = await loadConfig(options);
  
  logger.info(`Starting ${config.mode} development server...`);
  
  if (config.mode === 'docs') {
    await startDevServerDocs(config, logger);
  } else {
    await startDevServerUI(config, logger);
  }
}

async function handleBuild(args, logger) {
  const options = parseArgs(args);
  const config = await loadConfig(options);
  
  logger.info(`Building ${config.mode} for production...`);
  
  if (config.mode === 'docs') {
    await buildDocs(config, logger);
  } else {
    await buildUI(config, logger);
  }
}

async function handleInit(args, logger) {
  const { writeConfig } = await import('./config.js');
  await writeConfig();
  logger.success('Created ernest.bundler.js with default settings');
}

async function handleMigrate(args, logger) {
  await migrateProject(logger);
}

function parseArgs(args) {
  const options = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--mode' || arg === '-m') {
      options.mode = args[++i];
    } else if (arg === '--port' || arg === '-p') {
      options.port = parseInt(args[++i]);
    } else if (arg === '--output' || arg === '-o') {
      options.output = args[++i];
    } else if (arg === '--entry' || arg === '-e') {
      options.entry = args[++i];
    } else if (arg === '--config' || arg === '-c') {
      options.config = args[++i];
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];
      
      if (nextArg && !nextArg.startsWith('--')) {
        options[key] = nextArg;
        i++;
      } else {
        options[key] = true;
      }
    }
  }
  
  return options;
}

