// src/ui/html-generator.js
import { join, dirname } from 'path';
import { existsSync, mkdirSync, cpSync } from 'fs';
import { extractMetaFromSource } from '../utils/meta-extractor.js';

export async function generateHTML(routes, serverIslands, bundleResult, outDir, config, logger, islandProcessor) {
  const root = process.cwd();
  const mainBundle = bundleResult.outputs.find(o => 
    o.path.includes('main') && o.kind === 'entry-point'
  );
  
  if (!mainBundle) {
    logger.error('❌ Could not find main bundle');
    return;
  }
  
  const bundlePath = mainBundle.path.replace(outDir + '/', '').replace(/\\/g, '/');
  
  // Copy bertui packages to dist/
  const bertuiPackages = await copyBertuiPackagesToProduction(root, outDir, logger);
  
  logger.info(`📄 Generating HTML for ${routes.length} routes...`);
  
  const BATCH_SIZE = 5;
  
  for (let i = 0; i < routes.length; i += BATCH_SIZE) {
    const batch = routes.slice(i, i + BATCH_SIZE);
    
    for (const route of batch) {
      await processSingleRoute(route, serverIslands, config, bundlePath, outDir, logger, islandProcessor, bertuiPackages);
    }
    
    const percent = Math.round(((i + batch.length) / routes.length) * 100);
    logger.progress(i + batch.length, routes.length, `Generating HTML...`);
  }
  
  logger.success(`✅ HTML generation complete for ${routes.length} routes`);
}

async function copyBertuiPackagesToProduction(root, outDir, logger) {
  const nodeModulesDir = join(root, 'node_modules');
  const packages = {
    bertuiIcons: false,
    bertuiAnimate: false
  };
  
  if (!existsSync(nodeModulesDir)) {
    logger.debug('node_modules not found, skipping package copy');
    return packages;
  }
  
  // Copy bertui-icons
  const bertuiIconsSource = join(nodeModulesDir, 'bertui-icons');
  if (existsSync(bertuiIconsSource)) {
    try {
      const bertuiIconsDest = join(outDir, 'node_modules', 'bertui-icons');
      mkdirSync(join(outDir, 'node_modules'), { recursive: true });
      cpSync(bertuiIconsSource, bertuiIconsDest, { recursive: true });
      logger.success('✅ Copied bertui-icons to dist/node_modules/');
      packages.bertuiIcons = true;
    } catch (error) {
      logger.error(`Failed to copy bertui-icons: ${error.message}`);
    }
  }
  
  // Copy bertui-animate CSS
  const bertuiAnimateSource = join(nodeModulesDir, 'bertui-animate', 'dist');
  if (existsSync(bertuiAnimateSource)) {
    try {
      const bertuiAnimateDest = join(outDir, 'css');
      mkdirSync(bertuiAnimateDest, { recursive: true });
      
      const minCSSPath = join(bertuiAnimateSource, 'bertui-animate.min.css');
      if (existsSync(minCSSPath)) {
        cpSync(minCSSPath, join(bertuiAnimateDest, 'bertui-animate.min.css'));
        logger.success('✅ Copied bertui-animate.min.css to dist/css/');
        packages.bertuiAnimate = true;
      }
    } catch (error) {
      logger.error(`Failed to copy bertui-animate: ${error.message}`);
    }
  }
  
  return packages;
}

async function processSingleRoute(route, serverIslands, config, bundlePath, outDir, logger, islandProcessor, bertuiPackages) {
  try {
    const sourceCode = await Bun.file(route.path).text();
    const pageMeta = extractMetaFromSource(sourceCode);
    const meta = { 
      title: config.siteName || 'BertUI App',
      description: 'Built with BertUI',
      lang: 'en',
      ...pageMeta 
    };
    
    const isServerIsland = serverIslands.find(si => si.route === route.route);
    let staticHTML = '';
    
    if (isServerIsland) {
      logger.info(`Extracting static content: ${route.route}`);
      staticHTML = await islandProcessor.extractStaticHTML(sourceCode, route.path);
      
      if (staticHTML) {
        logger.success(`✅ Server Island rendered: ${route.route}`);
      } else {
        logger.warn(`⚠️  Could not extract HTML, falling back to client-only`);
      }
    }
    
    const html = generateHTMLTemplate(meta, route, bundlePath, staticHTML, isServerIsland, bertuiPackages, config);
    
    let htmlPath;
    if (route.route === '/') {
      htmlPath = join(outDir, 'index.html');
    } else {
      const routeDir = join(outDir, route.route.replace(/^\//, ''));
      mkdirSync(routeDir, { recursive: true });
      htmlPath = join(routeDir, 'index.html');
    }
    
    await Bun.write(htmlPath, html);
    
    if (isServerIsland) {
      logger.success(`✅ Server Island: ${route.route} (instant content!)`);
    } else {
      logger.success(`✅ Client-only: ${route.route}`);
    }
    
  } catch (error) {
    logger.error(`Failed HTML for ${route.route}: ${error.message}`);
  }
}

function generateHTMLTemplate(meta, route, bundlePath, staticHTML = '', isServerIsland = false, bertuiPackages = {}, config = {}) {
  const rootContent = staticHTML 
    ? `<div id="root">${staticHTML}</div>` 
    : '<div id="root"></div>';
  
  const comment = isServerIsland 
    ? '<!-- 🏝️ Server Island: Static content rendered at build time -->'
    : '<!-- ⚡ Client-only: Content rendered by JavaScript -->';
  
  const bertuiIconsImport = bertuiPackages.bertuiIcons 
    ? ',\n      "bertui-icons": "/node_modules/bertui-icons/generated/index.js"'
    : '';
  
  const bertuiAnimateCSS = bertuiPackages.bertuiAnimate
    ? '  <link rel="stylesheet" href="/css/bertui-animate.min.css">'
    : '';
  
  return `<!DOCTYPE html>
<html lang="${meta.lang || 'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${meta.title || 'BertUI App'}</title>
  
  <meta name="description" content="${meta.description || 'Built with BertUI'}">
  ${meta.keywords ? `<meta name="keywords" content="${meta.keywords}">` : ''}
  ${meta.author ? `<meta name="author" content="${meta.author}">` : ''}
  ${meta.themeColor ? `<meta name="theme-color" content="${meta.themeColor}">` : ''}
  
  <meta property="og:title" content="${meta.ogTitle || meta.title || 'BertUI App'}">
  <meta property="og:description" content="${meta.ogDescription || meta.description || 'Built with BertUI'}">
  ${meta.ogImage ? `<meta property="og:image" content="${meta.ogImage}">` : ''}
  
  <link rel="stylesheet" href="/styles/bertui.min.css">
${bertuiAnimateCSS}
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  
  <script type="importmap">
  {
    "imports": {
      "react": "https://esm.sh/react@18.2.0",
      "react-dom": "https://esm.sh/react-dom@18.2.0",
      "react-dom/client": "https://esm.sh/react-dom@18.2.0/client",
      "react/jsx-runtime": "https://esm.sh/react@18.2.0/jsx-runtime"${bertuiIconsImport}
    }
  }
  </script>
</head>
<body>
  ${comment}
  ${rootContent}
  <script type="module" src="/${bundlePath}"></script>
</body>
</html>`;
}