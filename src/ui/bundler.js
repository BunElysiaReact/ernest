// src/ui/bundler.js - COMPLETE VERSION
import { join } from 'path';
import { existsSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { UICompiler } from './compiler.js';
import { ServerIslandProcessor } from './islands.js';
import { buildCSS } from '../components/assets.js';
import { generateRouter } from '../components/router.js';
import { generateHTML } from './html-generator.js';

export async function buildUI(config, logger) {
  const root = process.cwd();
  const buildDir = join(root, '.ernestbuild');
  const outDir = join(root, config.output);
  
  // Force production environment
  process.env.NODE_ENV = 'production';
  
  // Safety check: ensure logger has banner method
  if (!logger.banner) {
    logger.banner = function() {
      this.bigLog('⚡ ERNEST by Ernest Tech House(beta)', { color: 'brightCyan' });
      this.info('🔧 powers: bertui • bunny • bertuimarked');
    };
  }
  
  logger.banner();
  logger.bigLog('BUILDING WITH SERVER ISLANDS 🏝️', { color: 'green' });
  
  // Clean directories
  if (existsSync(buildDir)) rmSync(buildDir, { recursive: true });
  if (existsSync(outDir)) rmSync(outDir, { recursive: true });
  mkdirSync(buildDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });
  
  const startTime = Date.now();
  
  try {
    const compiler = new UICompiler(config, logger);
    const islandProcessor = new ServerIslandProcessor(logger);
    
    // Step 1: Compile and detect Server Islands
    logger.info('Step 1: Compiling and detecting Server Islands...');
    const { routes, serverIslands, clientRoutes } = await compiler.compileForBuild(root, buildDir);
    
    if (serverIslands.length > 0) {
      logger.bigLog('SERVER ISLANDS DETECTED 🏝️', { color: 'cyan' });
      serverIslands.forEach(route => {
        logger.info(`Route: ${route.route} → ${route.file}`);
      });
    }
    
    // Step 2: Build CSS
    logger.info('Step 2: Building CSS...');
    await buildCSS(root, outDir, config, logger);
    
    // Step 3: Generate router
    if (routes.length > 0) {
      logger.info('Step 3: Generating router...');
      await generateRouter(routes, buildDir, logger);
    }
    
    // Step 4: Generate main entry point
    logger.info('Step 4: Generating main entry point...');
    const { generateMainEntry } = await import('../components/entry-generator.js');
    await generateMainEntry(buildDir, routes.length > 0, logger);
    
    // Step 5: Bundle JavaScript
    logger.info('Step 5: Bundling JavaScript...');
    const bundleResult = await bundleJavaScript(buildDir, outDir, config, logger);
    
    // Step 6: Generate HTML
    logger.info('Step 6: Generating HTML with Server Islands...');
    await generateHTML(routes, serverIslands, bundleResult, outDir, config, logger, islandProcessor);
    
    // Step 7: Generate sitemap and robots.txt
    logger.info('Step 7: Generating sitemap and robots.txt...');
    await generateSitemap(routes, outDir, config, logger);
    await generateRobots(outDir, config, logger);
    
    // Clean up
    if (existsSync(buildDir)) rmSync(buildDir, { recursive: true });
    
    // Show summary
    const duration = Date.now() - startTime;
    showBuildSummary(routes, serverIslands, clientRoutes, duration, logger);
    
  } catch (error) {
    logger.error(`Build failed: ${error.message}`);
    if (error.stack) logger.debug(error.stack);
    if (existsSync(buildDir)) rmSync(buildDir, { recursive: true });
    process.exit(1);
  }
}

async function bundleJavaScript(buildDir, outDir, config, logger) {
  const buildEntry = join(buildDir, 'main.js');
  
  if (!existsSync(buildEntry)) {
    logger.error('❌ main.js not found in build directory!');
    throw new Error('Build entry point missing');
  }
  
  try {
    // Change working directory to buildDir
    const originalCwd = process.cwd();
    process.chdir(buildDir);
    
    logger.info('🔧 Bundling with production JSX...');
    
    const buildConfig = {
      entrypoints: [buildEntry],
      outdir: join(outDir, 'assets'),
      target: 'browser',
      minify: config.minify,
      splitting: config.splitting,
      sourcemap: config.sourcemap ? 'external' : 'none',
      naming: {
        entry: '[name]-[hash].js',
        chunk: 'chunks/[name]-[hash].js',
        asset: '[name]-[hash].[ext]'
      },
      external: ['react', 'react-dom', 'react-dom/client', ...config.external],
      define: {
        'process.env.NODE_ENV': '"production"',
        ...config.define
      }
    };
    
    let result;
    
    try {
      result = await Bun.build(buildConfig);
    } catch (buildError) {
      // Handle AggregateError from Bun.build
      process.chdir(originalCwd);
      
      logger.error('❌ Bun.build threw an error!');
      logger.error(`   Type: ${buildError.name}`);
      logger.error(`   Message: ${buildError.message}`);
      
      // AggregateError has an 'errors' property
      if (buildError.errors && Array.isArray(buildError.errors)) {
        logger.error(`\n📋 Individual errors (${buildError.errors.length} total):`);
        buildError.errors.forEach((err, i) => {
          logger.error(`\n${i + 1}. ${err.message}`);
          if (err.position) {
            logger.error(`   File: ${err.position.file || 'unknown'}`);
            logger.error(`   Line: ${err.position.line || 'unknown'}`);
            logger.error(`   Column: ${err.position.column || 'unknown'}`);
          }
        });
      }
      
      if (buildError.stack) {
        logger.debug(`Stack trace:\n${buildError.stack}`);
      }
      
      throw new Error('JavaScript bundling failed - see errors above');
    }
    
    process.chdir(originalCwd);
    
    if (!result.success) {
      logger.error('❌ JavaScript build failed!');
      
      if (result.logs && result.logs.length > 0) {
        logger.error(`\n📋 Build errors:`);
        result.logs.forEach((log, i) => {
          logger.error(`\n${i + 1}. ${log.message}`);
          if (log.position) {
            logger.error(`   File: ${log.position.file || 'unknown'}`);
            logger.error(`   Line: ${log.position.line || 'unknown'}`);
            logger.error(`   Column: ${log.position.column || 'unknown'}`);
          }
        });
      }
      
      throw new Error('JavaScript bundling failed');
    }
    
    logger.success('✅ JavaScript bundled successfully');
    
    const entryPoints = result.outputs.filter(o => o.kind === 'entry-point').length;
    const chunks = result.outputs.filter(o => o.kind === 'chunk').length;
    const totalSize = result.outputs.reduce((sum, o) => sum + (o.size || 0), 0);
    
    logger.info(`   Entry points: ${entryPoints}`);
    logger.info(`   Chunks: ${chunks}`);
    logger.info(`   Total size: ${(totalSize / 1024).toFixed(2)} KB`);
    
    return result;
    
  } catch (error) {
    logger.error('❌ Bundling error: ' + error.message);
    if (error.stack) {
      logger.debug(error.stack);
    }
    throw error;
  }
}

async function generateSitemap(routes, outDir, config, logger) {
  if (!config.baseUrl) {
    logger.warn('⚠️  No baseUrl specified, skipping sitemap generation');
    return;
  }
  
  const staticRoutes = routes.filter(r => r.type === 'static');
  const currentDate = new Date().toISOString().split('T')[0];
  
  const sitemapUrls = staticRoutes.map(route => {
    const url = `${config.baseUrl}${route.route}`;
    return `  <url>
    <loc>${url}</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${route.route === '/' ? '1.0' : '0.8'}</priority>
  </url>`;
  }).join('\n');
  
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls}
</urlset>`;
  
  await Bun.write(join(outDir, 'sitemap.xml'), sitemap);
  logger.success(`✅ Sitemap generated: ${staticRoutes.length} URLs`);
}

async function generateRobots(outDir, config, logger) {
  if (!config.baseUrl) {
    logger.warn('⚠️  No baseUrl specified, skipping robots.txt generation');
    return;
  }
  
  const robotsTxt = `# Generated by Ernest
User-agent: *
Allow: /

Sitemap: ${config.baseUrl}/sitemap.xml`;
  
  await Bun.write(join(outDir, 'robots.txt'), robotsTxt);
  logger.success('✅ robots.txt generated');
}

function showBuildSummary(routes, serverIslands, clientRoutes, duration, logger) {
  logger.success(`✨ Build complete in ${duration}ms`);
  logger.bigLog('BUILD SUMMARY', { color: 'green' });
  logger.info(`📄 Total routes: ${routes.length}`);
  logger.info(`🏝️  Server Islands (SSG): ${serverIslands.length}`);
  logger.info(`⚡ Client-only: ${clientRoutes.length}`);
  logger.info(`🗺️  Sitemap: dist/sitemap.xml`);
  logger.info(`🤖 robots.txt: dist/robots.txt`);
  
  if (serverIslands.length > 0) {
    logger.success('✅ Server Islands enabled - INSTANT content delivery!');
  }
  
  logger.bigLog('READY TO DEPLOY 🚀', { color: 'green' });
}