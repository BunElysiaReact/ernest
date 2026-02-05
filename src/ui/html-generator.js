// src/ui/html-generator.js - COMPLETE FIXED VERSION

import { join } from 'path';
import {
  existsSync,
  mkdirSync,
  cpSync,
  readdirSync,
  readFileSync
} from 'fs';
import { extractMetaFromSource } from '../utils/meta-extractor.js';

export async function generateHTML(
  routes,
  serverIslands,
  bundleResult,
  outDir,
  config,
  logger,
  islandProcessor
) {
  const root = process.cwd();

  const mainBundle = bundleResult.outputs.find(
    o => o.path.includes('main') && o.kind === 'entry-point'
  );

  if (!mainBundle) {
    logger.error('❌ Could not find main bundle');
    return;
  }

  const bundlePath = mainBundle.path
    .replace(outDir + '/', '')
    .replace(/\\/g, '/');

  // Copy bertui packages
  logger.info('📦 Copying packages to dist/...');
  const bertuiPackages = await copyBertuiPackagesToProduction(
    root,
    outDir,
    logger
  );

  // Generate import map
  logger.info('🗺️  Generating import map...');
  const importMap = await generateImportMap(root, logger);

  logger.info(`📄 Generating HTML for ${routes.length} routes...`);

  const BATCH_SIZE = 5;

  for (let i = 0; i < routes.length; i += BATCH_SIZE) {
    const batch = routes.slice(i, i + BATCH_SIZE);

    for (const route of batch) {
      await processSingleRoute(
        route,
        serverIslands,
        config,
        bundlePath,
        outDir,
        logger,
        islandProcessor,
        bertuiPackages,
        importMap
      );
    }

    if (logger.progress) {
      logger.progress(i + batch.length, routes.length, 'Generating HTML...');
    }
  }

  logger.success(`✅ HTML generation complete for ${routes.length} routes`);
}

async function copyBertuiPackagesToProduction(root, outDir, logger) {
  const nodeModulesDir = join(root, 'node_modules');
  const packages = {};

  if (!existsSync(nodeModulesDir)) {
    logger.debug('node_modules not found, skipping package copy');
    return packages;
  }

  try {
    const allPackages = readdirSync(nodeModulesDir);

    for (const pkg of allPackages) {
      if (!pkg.startsWith('bertui-')) continue;
      if (pkg.startsWith('.')) continue;

      const src = join(nodeModulesDir, pkg);
      const dest = join(outDir, 'node_modules', pkg);

      if (!existsSync(src)) continue;

      mkdirSync(dest, { recursive: true });
      cpSync(src, dest, { recursive: true });

      packages[pkg] = true;
      logger.success(`✅ Copied ${pkg} to dist/node_modules/`);
    }
  } catch (err) {
    logger.error(`Failed copying bertui packages: ${err.message}`);
  }

  // bertui-animate CSS
  const animateCSS = join(
    nodeModulesDir,
    'bertui-animate',
    'dist',
    'bertui-animate.min.css'
  );

  if (existsSync(animateCSS)) {
    const cssOut = join(outDir, 'css');
    mkdirSync(cssOut, { recursive: true });
    cpSync(animateCSS, join(cssOut, 'bertui-animate.min.css'));
    packages.bertuiAnimate = true;
    logger.success('✅ Copied bertui-animate.min.css');
  }

  return packages;
}

async function generateImportMap(root, logger) {
  const importMap = {
    react: 'https://esm.sh/react@18.2.0',
    'react-dom': 'https://esm.sh/react-dom@18.2.0',
    'react-dom/client': 'https://esm.sh/react-dom@18.2.0/client',
    'react/jsx-runtime': 'https://esm.sh/react@18.2.0/jsx-runtime'
  };

  const nodeModulesDir = join(root, 'node_modules');
  if (!existsSync(nodeModulesDir)) return importMap;

  try {
    const packages = readdirSync(nodeModulesDir);

    for (const pkg of packages) {
      if (!pkg.startsWith('bertui-')) continue;
      if (pkg.startsWith('.')) continue;

      const pkgDir = join(nodeModulesDir, pkg);
      const pkgJsonPath = join(pkgDir, 'package.json');
      if (!existsSync(pkgJsonPath)) continue;

      try {
        const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
        let mainFile =
          pkgJson.exports?.['.']?.default ||
          pkgJson.exports?.['.'] ||
          pkgJson.module ||
          pkgJson.main ||
          'index.js';

        mainFile = mainFile.replace(/^\.\//, '');
        const fullPath = join(pkgDir, mainFile);

        if (!existsSync(fullPath)) continue;

        importMap[pkg] = `/node_modules/${pkg}/${mainFile}`;
        logger.debug(`Mapped ${pkg}`);
      } catch (err) {
        logger.warn(`⚠️ ${pkg} import map failed: ${err.message}`);
      }
    }

    // bertui/router manual export
    const bertuiRouterJS = join(
      nodeModulesDir,
      'bertui',
      'src',
      'router',
      'Router.js'
    );
    const bertuiRouterJSX = join(
      nodeModulesDir,
      'bertui',
      'src',
      'router',
      'Router.jsx'
    );

    if (existsSync(bertuiRouterJS)) {
      importMap['bertui/router'] =
        '/node_modules/bertui/src/router/Router.js';
      logger.success('✅ Added bertui/router');
    } else if (existsSync(bertuiRouterJSX)) {
      importMap['bertui/router'] =
        '/node_modules/bertui/src/router/Router.jsx';
      logger.success('✅ Added bertui/router (JSX)');
    }
  } catch (err) {
    logger.error(`Import map generation failed: ${err.message}`);
  }

  return importMap;
}

async function processSingleRoute(
  route,
  serverIslands,
  config,
  bundlePath,
  outDir,
  logger,
  islandProcessor,
  bertuiPackages,
  importMap
) {
  try {
    const source = await Bun.file(route.path).text();
    const meta = {
      title: config.siteName || 'Ernest App',
      description: 'Built with Ernest',
      lang: 'en',
      ...extractMetaFromSource(source)
    };

    const island = serverIslands.find(si => si.route === route.route);
    let staticHTML = '';

    if (island) {
      staticHTML = await islandProcessor.extractStaticHTML(
        source,
        route.path
      );
    }

    const html = generateHTMLTemplate(
      meta,
      route,
      bundlePath,
      staticHTML,
      !!island,
      bertuiPackages,
      config,
      importMap
    );

    const htmlPath =
      route.route === '/'
        ? join(outDir, 'index.html')
        : join(outDir, route.route.replace(/^\//, ''), 'index.html');

    mkdirSync(join(htmlPath, '..'), { recursive: true });
    await Bun.write(htmlPath, html);

    logger.success(`✅ ${route.route}`);
  } catch (err) {
    logger.error(`HTML failed for ${route.route}: ${err.message}`);
  }
}

function generateHTMLTemplate(
  meta,
  route,
  bundlePath,
  staticHTML,
  isServerIsland,
  bertuiPackages,
  config,
  importMap
) {
  return `<!DOCTYPE html>
<html lang="${meta.lang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${meta.title}</title>
  <meta name="description" content="${meta.description}" />

  <link rel="stylesheet" href="/styles/bertui.min.css" />
  ${
    bertuiPackages.bertuiAnimate
      ? '<link rel="stylesheet" href="/css/bertui-animate.min.css" />'
      : ''
  }

  <script type="importmap">
${JSON.stringify({ imports: importMap }, null, 2)}
  </script>
</head>
<body>
  ${isServerIsland ? '<!-- 🏝️ Server Island -->' : '<!-- ⚡ Client -->'}
  <div id="root">${staticHTML || ''}</div>
  <script type="module" src="/${bundlePath}"></script>
</body>
</html>`;
}
