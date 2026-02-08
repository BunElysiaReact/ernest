// src/components/config.js
import { join, dirname } from 'path';
import { existsSync, readFileSync } from 'fs';
import { createLogger } from 'ernest-logger';

const defaultLogger = createLogger({
  time: false,
  emoji: true,
  level: 'info',
  prefix: '[ERNEST]'
});

// Import default config
const defaultConfig = {
  mode: 'ui',
  input: 'jsx',
  entry: 'src',
  output: 'dist',
  serverIslands: true,
  minify: true,
  sourcemap: true,
  splitting: true,
  template: 'default',
  navigation: true,
  baseUrl: '',
  port: 3000,
  open: false,
  alias: {},
  define: {},
  external: [],
  target: 'browser',
  format: 'esm',
  css: {
    minify: true,
    nesting: true,
    targets: { chrome: 90, firefox: 88, safari: 14, edge: 90 }
  }
};

export async function loadConfig(cliOptions = {}) {
  const root = process.cwd();
  let config = { ...defaultConfig };
  
  // Try to load ernest.bundler.js
  const configPath = cliOptions.config 
    ? join(root, cliOptions.config)
    : join(root, 'ernest.bundler.js');
  
  if (existsSync(configPath)) {
    try {
      const userConfig = await import(configPath);
      const userConfigObj = userConfig.default || userConfig;
      
      // Deep merge
      config = deepMerge(config, userConfigObj);
      defaultLogger.success('Loaded config from ernest.bundler.js');
    } catch (error) {
      defaultLogger.error(`Failed to load config: ${error.message}`);
    }
  } else {
    // Auto-detect mode based on files
    config.mode = await autoDetectMode(root);
    defaultLogger.info(`Auto-detected mode: ${config.mode}`);
  }
  
  // CLI options override config file
  config = { ...config, ...cliOptions };
  
  // Validate config
  validateConfig(config);
  
  return config;
}

async function autoDetectMode(root) {
  const srcDir = join(root, 'src');
  const docsDir = join(root, 'docs');
  
  // Check for React files
  if (existsSync(srcDir)) {
    const files = await scanForExtensions(srcDir, ['.jsx', '.tsx']);
    if (files.length > 0) return 'ui';
  }
  
  // Check for markdown files
  if (existsSync(docsDir)) {
    const files = await scanForExtensions(docsDir, ['.md', '.markdown']);
    if (files.length > 0) return 'docs';
  }
  
  // Default to UI mode
  return 'ui';
}

async function scanForExtensions(dir, extensions) {
  const files = [];
  
  async function scan(currentDir) {
    if (!existsSync(currentDir)) return;
    
    try {
      const entries = await Bun.readdir(currentDir);
      
      for (const entry of entries) {
        const fullPath = join(currentDir, entry);
        const stat = await Bun.file(fullPath).stat();
        
        if (stat.isDirectory()) {
          await scan(fullPath);
        } else if (stat.isFile()) {
          const ext = entry.slice(entry.lastIndexOf('.'));
          if (extensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      // Ignore errors
    }
  }
  
  await scan(dir);
  return files;
}

function deepMerge(target, source) {
  const result = { ...target };
  
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (key in target && target[key] && typeof target[key] === 'object') {
        result[key] = deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    } else {
      result[key] = source[key];
    }
  }
  
  return result;
}

function validateConfig(config) {
  const validModes = ['ui', 'docs', 'fullstack'];
  if (!validModes.includes(config.mode)) {
    throw new Error(`Invalid mode: ${config.mode}. Must be one of: ${validModes.join(', ')}`);
  }
  
  if (config.mode === 'ui' && !['jsx', 'tsx'].includes(config.input)) {
    throw new Error(`Invalid input for UI mode: ${config.input}. Must be 'jsx' or 'tsx'`);
  }
  
  if (config.mode === 'docs' && config.input !== 'md') {
    throw new Error(`Invalid input for docs mode: ${config.input}. Must be 'md'`);
  }
}

export async function writeConfig() {
  const configPath = join(process.cwd(), 'ernest.bundler.js');
  
  if (existsSync(configPath)) {
    defaultLogger.warn('ernest.bundler.js already exists');
    return;
  }
  
  const configContent = `// ernest.bundler.js
export default {
  // Project type
  mode: 'ui', // 'ui' | 'docs' | 'fullstack'
  
  // Auto-detected if not specified
  input: 'jsx',    // 'jsx' | 'tsx' | 'md'
  entry: 'src',    // Source directory
  output: 'dist',  // Output directory
  
  // UI Mode options
  serverIslands: true,   // Auto-detect Server Islands
  minify: true,          // Minify JS/CSS in production
  sourcemap: true,       // Generate source maps
  splitting: true,       // Code splitting
  
  // Docs Mode options
  template: 'default',   // Template name or path
  navigation: true,      // Auto-generate sidebar
  baseUrl: '',           // For GitHub Pages deployment
  
  // Dev server
  port: 3000,            // Development server port
  open: false,           // Open browser on start
  
  // Advanced
  alias: {},             // Import aliases
  define: {},            // Global defines
  external: [],          // External dependencies
  
  // CSS handling
  css: {
    minify: true,
    nesting: true,
    targets: {
      chrome: 90,
      firefox: 88,
      safari: 14,
      edge: 90
    }
  }
};
`;
  
  await Bun.write(configPath, configContent);
  defaultLogger.success('Created ernest.bundler.js');
}