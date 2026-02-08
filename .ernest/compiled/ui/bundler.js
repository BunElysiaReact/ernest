// src/ui/bundler.js - FIXED VERSION with safe Bun.build approach
import { join } from 'path';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { UICompiler } from './compiler.js';
import { ServerIslandProcessor } from './islands.js';
import { buildCSS, copyStaticAssets } from '../components/assets.js';
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
      this.bigLog('⚡ ERNEST by Ernest Tech House', { color: 'brightCyan' });
      this.info('🔧 powers: bertui • bunny • bertuimarked');
    };
  }
  
  logger.banner();
  logger.bigLog('BUILDING WITH SERVER ISLANDS 🏝️', { color: 'green' });
  logger.info('🔥 OPTIONAL SERVER CONTENT - THE GAME CHANGER');
  
  // Clean directories
  if (existsSync(buildDir)) rmSync(buildDir, { recursive: true });
  if (existsSync(outDir)) rmSync(outDir, { recursive: true });
  mkdirSync(buildDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });
  
  const startTime = Date.now();
  
  try {
    const compiler = new UICompiler(config, logger);
    const islandProcessor = new ServerIslandProcessor(logger);
    
    const srcDir = join(root, config.entry || 'src');
    
    // Step 1: Discover routes and detect Server Islands
    logger.info('Step 1: Discovering routes and detecting Server Islands...');
    const { routes, serverIslands, clientRoutes } = await compiler.compileForBuild(root, buildDir);
    
    // Step 2: Generate router FIRST (before copying files)
    if (routes.length > 0) {
      logger.info('Step 2: Generating router...');
      await generateRouter(routes, buildDir, logger);
    }
    
    // Step 3: Copy and prepare source files (router exists now, so imports can be fixed)
    logger.info('Step 3: Preparing source files...');
    await compiler.compileSrcToBuild(srcDir, buildDir);
    
    // Step 4: Build CSS
    logger.info('Step 4: Combining CSS...');
    await buildCSS(root, outDir, config, logger);
    
    // Step 5: Copy static assets
    logger.info('Step 5: Copying static assets...');
    await copyStaticAssets(root, outDir, logger);
    
    // Step 6: Generate main entry point
    logger.info('Step 6: Generating main entry point...');
    const { generateMainEntry } = await import('../components/entry-generator.js');
    await generateMainEntry(buildDir, routes.length > 0, logger);
    
    // Step 7: Bundle JavaScript with Bun.build (handles all transpilation)
    logger.info('Step 7: Bundling JavaScript...');
    const bundleResult = await bundleJavaScript(buildDir, outDir, config, logger);
    
    // Step 8: Generate HTML with Server Islands
    logger.info('Step 8: Generating HTML with Server Islands...');
    await generateHTML(routes, serverIslands, bundleResult, outDir, config, logger, islandProcessor);
    
    // Step 9: Generate sitemap.xml
    logger.info('Step 9: Generating sitemap.xml...');
    await generateSitemap(routes, outDir, config, logger);
    
    // Step 10: Generate robots.txt
    logger.info('Step 10: Generating robots.txt...');
    await generateRobots(outDir, config, logger);
    
    // Clean up build directory
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
    logger.info('🔧 Bundling with Bun.build (handles all transpilation)...');
    
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
      external: ['react', 'react-dom', 'react-dom/client', ...(config.external || [])],
      define: {
        'process.env.NODE_ENV': '"production"',
        ...(config.define || {})
      }
    };
    
    let result;
    
    try {
      result = await Bun.build(buildConfig);
    } catch (buildError) {
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
  
  const baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
  
  function calculatePriority(route) {
    if (route === '/') return 1.0;
    if (route.includes(':')) return 0.6;
    const depth = route.split('/').filter(Boolean).length;
    if (depth === 1) return 0.8;
    if (depth === 2) return 0.7;
    return 0.6;
  }
  
  const sitemapUrls = staticRoutes.map(route => {
    const url = `${baseUrl}${route.route}`;
    const priority = calculatePriority(route.route);
    
    return `  <url>
    <loc>${url}</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
  </url>`;
  }).join('\n');
  
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls}
</urlset>`;
  
  await Bun.write(join(outDir, 'sitemap.xml'), sitemap);
  logger.success(`✅ Sitemap generated: ${staticRoutes.length} URLs`);
  logger.info(`   Location: ${join(outDir, 'sitemap.xml')}`);
}

async function generateRobots(outDir, config, logger) {
  if (!config.baseUrl) {
    logger.warn('⚠️  No baseUrl specified, skipping robots.txt generation');
    return;
  }
  
  const baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
  const sitemapUrl = `${baseUrl}/sitemap.xml`;
  
  let robotsTxt = `# Ernest Generated robots.txt
User-agent: *
Allow: /

# Sitemap
Sitemap: ${sitemapUrl}
`;
  
  // Add custom disallow rules if specified in config
  if (config?.robots?.disallow && Array.isArray(config.robots.disallow) && config.robots.disallow.length > 0) {
    robotsTxt += '\n# Custom Disallow Rules\n';
    config.robots.disallow.forEach(path => {
      robotsTxt += `Disallow: ${path}\n`;
    });
    logger.info(`   Blocked ${config.robots.disallow.length} path(s)`);
  }
  
  // Add crawl delay if specified
  if (config?.robots?.crawlDelay && typeof config.robots.crawlDelay === 'number') {
    robotsTxt += `\nCrawl-delay: ${config.robots.crawlDelay}\n`;
    logger.info(`   Crawl delay: ${config.robots.crawlDelay}s`);
  }
  
  await Bun.write(join(outDir, 'robots.txt'), robotsTxt);
  logger.success('✅ robots.txt generated');
  logger.info(`   Location: ${join(outDir, 'robots.txt')}`);
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