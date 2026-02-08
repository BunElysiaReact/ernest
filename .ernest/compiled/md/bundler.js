// src/md/bundler.js
import { join } from 'path';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { MarkdownCompiler } from './compiler.js';

export async function buildDocs(config, logger) {
  const root = process.cwd();
  const outDir = join(root, config.output || 'dist/docs');
  
  logger.banner();
  logger.bigLog('BUILDING DOCUMENTATION 📚', { color: 'blue' });
  
  // Clean output directory
  if (existsSync(outDir)) {
    rmSync(outDir, { recursive: true });
  }
  mkdirSync(outDir, { recursive: true });
  
  const startTime = Date.now();
  
  try {
    const compiler = new MarkdownCompiler(config, logger);
    
    // Compile markdown files
    const result = await compiler.compile();
    
    // Show summary
    const duration = Date.now() - startTime;
    showBuildSummary(result, duration, outDir, logger);
    
  } catch (error) {
    logger.error(`Build failed: ${error.message}`);
    if (error.stack) logger.debug(error.stack);
    process.exit(1);
  }
}

function showBuildSummary(result, duration, outDir, logger) {
  logger.success(`✨ Documentation build complete in ${duration}ms`);
  logger.bigLog('DOCS SUMMARY', { color: 'green' });
  logger.info(`📄 Pages built: ${result.files}`);
  logger.info(`📁 Navigation items: ${result.navigation.length}`);
  logger.info(`📦 Output: ${outDir}`);
  
  if (result.navigation.length > 0) {
    logger.info('\n📚 Navigation Structure:');
    const printNav = (items, indent = '') => {
      for (const item of items) {
        if (item.type === 'directory') {
          logger.info(`${indent}📁 ${item.name}/`);
          printNav(item.children, indent + '  ');
        } else {
          logger.info(`${indent}📄 ${item.name} (${item.path})`);
        }
      }
    };
    printNav(result.navigation);
  }
  
  logger.bigLog('READY TO DEPLOY 🚀', { color: 'green' });
}