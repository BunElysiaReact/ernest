import { join, dirname, relative, extname } from 'path';
import { existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { generateRouter } from '../components/router.js';
import { RouteCache } from '../components/route-cache.js';

// --- CACHE LAYER ---
const fileCache = new Map();

async function getFileHash(filePath) {
  try {
    const stat = await Bun.file(filePath).stat();
    return `${filePath}:${stat.size}:${stat.mtimeMs}`;
  } catch (e) {
    return `${filePath}:0:0`;
  }
}

async function compileFileWithCache(srcPath, outDir, filename, relativePath, root, logger, stats) {
  const cacheKey = await getFileHash(srcPath);
  const cached = fileCache.get(cacheKey);
  const outPath = join(outDir, filename.replace(/\.(jsx|tsx|ts)$/, '.js'));

  if (cached) {
    await Bun.write(outPath, cached);
    stats.cached++;
    return;
  }

  // New or changed file - compile it
  await compileFile(srcPath, outDir, filename, relativePath, root, logger);

  // Cache the result
  if (existsSync(outPath)) {
    const compiled = await Bun.file(outPath).text();
    fileCache.set(cacheKey, compiled);
    stats.files++;
  }
}

// --- MAIN EXPORT ---
export async function compileProject(root, config = {}, logger) {
  const srcDir = join(root, config.entry || 'src');
  const pagesDir = join(srcDir, 'pages');
  const outDir = join(root, '.ernest', 'compiled');

  if (!existsSync(srcDir)) {
    throw new Error('src/ directory not found!');
  }

  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  logger.info('Compiling project for development...');

  let routes = [];
  if (existsSync(pagesDir)) {
    routes = await discoverRoutes(pagesDir);
    logger.info(`Discovered ${routes.length} routes`);
  }

  const startTime = Date.now();

  // ✅ Step 1: Initialize Route Cache
  const routeCache = new RouteCache(root);
  const changedRoutes = routeCache.getChangedRoutes(routes);

  // ✅ Step 2: Compile directory (Parallel & File-cached)
  const stats = await compileDirectory(srcDir, outDir, root, logger);
  const duration = Date.now() - startTime;

  // ✅ Step 3: Only generate router if routes changed or router.js is missing
  if (changedRoutes.length > 0 || !existsSync(join(outDir, 'router.js'))) {
    await generateRouter(routes, outDir, logger);
    logger.info(`Generated router.js (${changedRoutes.length} changes detected)`);
  } else {
    logger.debug('Routes unchanged, using cached router');
  }

  logger.success(`Compiled ${stats.files} files (${stats.cached || 0} cached) in ${duration}ms`);
  return { outDir, stats, routes };
}

export async function discoverRoutes(pagesDir) {
  const routes = [];
  async function scanDirectory(dir, basePath = '') {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relativePath = join(basePath, entry.name);
      if (entry.isDirectory()) {
        await scanDirectory(fullPath, relativePath);
      } else if (entry.isFile()) {
        const ext = extname(entry.name);
        if (ext === '.css') continue;
        if (['.jsx', '.tsx', '.js', '.ts'].includes(ext)) {
          const fileName = entry.name.replace(ext, '');
          let route = '/' + relativePath.replace(/\\/g, '/').replace(ext, '');
          if (fileName === 'index') route = route.replace('/index', '') || '/';
          const isDynamic = fileName.includes('[') && fileName.includes(']');
          routes.push({
            route: route === '' ? '/' : route,
            file: relativePath.replace(/\\/g, '/'),
            path: fullPath,
            type: isDynamic ? 'dynamic' : 'static'
          });
        }
      }
    }
  }
  await scanDirectory(pagesDir);
  return routes;
}

async function compileDirectory(srcDir, outDir, root, logger) {
  const stats = { files: 0, skipped: 0, cached: 0 };
  const entries = readdirSync(srcDir, { withFileTypes: true });
  const promises = [];

  for (const entry of entries) {
    const srcPath = join(srcDir, entry.name);
    
    if (entry.isDirectory()) {
      if (entry.name === 'templates') {
        logger.debug('⏭️  Skipping templates directory');
        continue;
      }
      const subOutDir = join(outDir, entry.name);
      if (!existsSync(subOutDir)) mkdirSync(subOutDir, { recursive: true });
      
      promises.push((async () => {
        const subStats = await compileDirectory(srcPath, subOutDir, root, logger);
        stats.files += subStats.files;
        stats.skipped += subStats.skipped;
        stats.cached += subStats.cached;
      })());
    } else {
      const ext = extname(entry.name);
      const relativePath = relative(join(root, 'src'), srcPath);

      if (ext === '.css') {
        const stylesOutDir = join(root, '.ernest', 'styles');
        if (!existsSync(stylesOutDir)) mkdirSync(stylesOutDir, { recursive: true });
        const cssOutPath = join(stylesOutDir, entry.name);
        promises.push(Bun.write(cssOutPath, Bun.file(srcPath)).then(() => stats.files++));
      } 
      else if (['.jsx', '.tsx', '.ts'].includes(ext)) {
        promises.push(compileFileWithCache(srcPath, outDir, entry.name, relativePath, root, logger, stats));
      } 
      else if (ext === '.js') {
        promises.push((async () => {
          const cacheKey = await getFileHash(srcPath);
          const cached = fileCache.get(cacheKey);
          const outPath = join(outDir, entry.name);

          if (cached) {
            await Bun.write(outPath, cached);
            stats.cached++;
          } else {
            let code = await Bun.file(srcPath).text();
            code = code.replace(/import\s+['"][^'"]*\.css['"];?\s*/g, '');

            const buildDir = join(root, '.ernest', 'compiled');
            const routerPath = join(buildDir, 'router.js');
            if (existsSync(routerPath)) {
              const relativeToRouter = relative(dirname(outPath), routerPath).replace(/\\/g, '/');
              const routerImport = relativeToRouter.startsWith('.') ? relativeToRouter : './' + relativeToRouter;
              code = code.replace(/from\s+['"]bertui\/router['"]/g, `from '${routerImport}'`);
            }

            if (usesJSX(code) && !code.includes('import React')) {
              code = `import React from 'react';\n${code}`;
            }

            await Bun.write(outPath, code);
            fileCache.set(cacheKey, code);
            stats.files++;
          }
        })());
      } else {
        stats.skipped++;
      }
    }
  }

  await Promise.all(promises);
  return stats;
}

export async function compileFile(srcPath, outDir, filename, relativePath, root, logger) {
  const ext = extname(filename);
  const loader = ext === '.tsx' ? 'tsx' : ext === '.ts' ? 'ts' : 'jsx';

  try {
    let code = await Bun.file(srcPath).text();
    code = code.replace(/import\s+['"][^'"]*\.css['"];?\s*/g, '');

    const outPath = join(outDir, filename.replace(/\.(jsx|tsx|ts)$/, '.js'));
    const buildDir = join(root, '.ernest', 'compiled');
    const routerPath = join(buildDir, 'router.js');

    if (existsSync(routerPath)) {
      const relativeToRouter = relative(dirname(outPath), routerPath).replace(/\\/g, '/');
      const routerImport = relativeToRouter.startsWith('.') ? relativeToRouter : './' + relativeToRouter;
      code = code.replace(/from\s+['"]bertui\/router['"]/g, `from '${routerImport}'`);
    }

    const transpiler = new Bun.Transpiler({
      loader,
      tsconfig: {
        compilerOptions: {
          jsx: 'react',
          jsxFactory: 'React.createElement',
          jsxFragmentFactory: 'React.Fragment'
        }
      }
    });

    let compiled = await transpiler.transform(code);
    if (usesJSX(compiled) && !compiled.includes('import React')) {
      compiled = `import React from 'react';\n${compiled}`;
    }

    compiled = fixRelativeImports(compiled);
    await Bun.write(outPath, compiled);
  } catch (error) {
    logger.error(`Failed to compile ${relativePath}: ${error.message}`);
    throw error;
  }
}

export function usesJSX(code) {
  return code.includes('React.createElement') || code.includes('React.Fragment') || /<[A-Z]/.test(code);
}

export function fixRelativeImports(code) {
  const importRegex = /from\s+['"](\.\.?\/[^'"]+?)(?<!\.js|\.jsx|\.ts|\.tsx|\.json)['"]/g;
  return code.replace(importRegex, (match, path) => {
    if (path.endsWith('/') || /\.\w+$/.test(path)) return match;
    return `from '${path}.js'`;
  });
}