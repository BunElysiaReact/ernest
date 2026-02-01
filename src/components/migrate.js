// src/components/migrate.js
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, rmSync } from 'fs';

export async function migrateProject(logger) {
  const root = process.cwd();
  const packageJsonPath = join(root, 'package.json');
  const bertuiConfigPath = join(root, 'bertui.config.js');
  const ernestConfigPath = join(root, 'ernest.bundler.js');
  
  logger.bigLog('MIGRATING TO ERNEST 🚀', { color: 'cyan' });
  
  // Check if this is a BertUI project
  if (!existsSync(packageJsonPath)) {
    logger.error('❌ No package.json found. Are you in a BertUI project?');
    process.exit(1);
  }
  
  // Read package.json
  let packageJson;
  try {
    packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  } catch (error) {
    logger.error(`❌ Failed to read package.json: ${error.message}`);
    process.exit(1);
  }
  
  // Check if already using Ernest
  if (packageJson.dependencies?.ernest || packageJson.devDependencies?.ernest) {
    logger.warn('⚠️  Project already appears to use Ernest');
    const { confirm } = await import('prompt');
    const { answer } = await confirm('Continue migration anyway?');
    if (!answer) process.exit(0);
  }
  
  // Step 1: Add Ernest dependency
  logger.info('Step 1: Adding Ernest dependency...');
  packageJson.dependencies = packageJson.dependencies || {};
  packageJson.dependencies.ernest = 'latest';
  
  // Step 2: Update scripts
  logger.info('Step 2: Updating package.json scripts...');
  packageJson.scripts = packageJson.scripts || {};
  
  if (packageJson.scripts.dev === 'bertui dev') {
    packageJson.scripts.dev = 'ernest dev --mode ui';
    logger.info('  Updated dev script');
  }
  
  if (packageJson.scripts.build === 'bertui build') {
    packageJson.scripts.build = 'ernest build --mode ui';
    logger.info('  Updated build script');
  }
  
  // Step 3: Create ernest.bundler.js
  logger.info('Step 3: Creating ernest.bundler.js...');
  
  if (existsSync(ernestConfigPath)) {
    logger.warn('⚠️  ernest.bundler.js already exists, backing up...');
    const backupPath = ernestConfigPath + '.backup';
    writeFileSync(backupPath, readFileSync(ernestConfigPath, 'utf-8'));
  }
  
  // Create config based on existing bertui.config.js if it exists
  let ernestConfig = `// ernest.bundler.js
export default {
  mode: 'ui',
  input: 'jsx',
  entry: 'src',
  output: 'dist',
  serverIslands: true,
  minify: true,
  sourcemap: true,
  splitting: true,
  port: 3000,
  open: false,
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
};`;
  
  if (existsSync(bertuiConfigPath)) {
    try {
      const bertuiConfig = await import(bertuiConfigPath);
      const config = bertuiConfig.default || bertuiConfig;
      
      // Migrate bertui.config.js to ernest.bundler.js format
      ernestConfig = `// ernest.bundler.js (migrated from bertui.config.js)
export default {
  mode: 'ui',
  input: 'jsx',
  entry: 'src',
  output: 'dist',
  serverIslands: true,
  minify: true,
  sourcemap: true,
  splitting: true,
  port: 3000,
  open: false,
  
  // Migrated from bertui.config.js
  ${config.baseUrl ? `baseUrl: '${config.baseUrl}',` : ''}
  ${config.meta ? `meta: ${JSON.stringify(config.meta, null, 2)},` : ''}
  
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
};`;
      
      logger.info('  Migrated settings from bertui.config.js');
    } catch (error) {
      logger.warn(`  Could not read bertui.config.js: ${error.message}`);
    }
  }
  
  writeFileSync(ernestConfigPath, ernestConfig);
  
  // Step 4: Remove old BertUI build files
  logger.info('Step 4: Cleaning up old build files...');
  
  const oldBuildDir = join(root, 'node_modules', 'bertui', 'src', 'build');
  if (existsSync(oldBuildDir)) {
    logger.info('  Found old BertUI build directory');
    // Note: We don't delete node_modules files, just notify
  }
  
  // Step 5: Write updated package.json
  logger.info('Step 5: Updating package.json...');
  writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
  
  // Step 6: Show migration summary
  logger.success('\n✨ Migration complete!');
  logger.bigLog('MIGRATION SUMMARY', { color: 'green' });
  
  logger.info('\n📋 Changes made:');
  logger.info('  ✅ Added "ernest" dependency');
  logger.info('  ✅ Updated package.json scripts');
  logger.info('  ✅ Created ernest.bundler.js');
  
  logger.info('\n🚀 Next steps:');
  logger.info('  1. Install dependencies:');
  logger.info('     bun install');
  logger.info('  2. Test the new setup:');
  logger.info('     bun run dev');
  logger.info('     bun run build');
  
  logger.info('\n💡 Tips:');
  logger.info('  • Ernest uses the same file structure as BertUI');
  logger.info('  • Your routes and Server Islands will work the same');
  logger.info('  • Config is now in ernest.bundler.js');
  
  logger.bigLog('MIGRATION SUCCESSFUL 🎉', { color: 'green' });
}