// src/ui/compiler-dev.js - COMPLETE FIXED VERSION
import { join, dirname, relative, extname } from 'path';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'fs';
import { buildCSS } from '../components/assets.js';
import { generateRouter } from '../components/router.js';

export async function compileProject(root, config, logger) {
  const compiledDir = join(root, '.ernest', 'compiled');
  const stylesDir = join(root, '.ernest', 'styles');
  const srcDir = join(root, config.entry || 'src');
  
  // Clean compiled directory
  if (existsSync(compiledDir)) rmSync(compiledDir, { recursive: true });
  mkdirSync(compiledDir, { recursive: true });
  mkdirSync(stylesDir, { recursive: true });
  
  // 1. Discover routes
  const pagesDir = join(srcDir, 'pages');
  const routes = existsSync(pagesDir) 
    ? await discoverRoutes(pagesDir, logger)
    : [];
  
  logger.info(`Discovered ${routes.length} routes`);
  
  // 2. Generate router if routes exist
  if (routes.length > 0) {
    await generateRouter(routes, compiledDir, logger);
  }
  
  // 3. Copy and transpile files
  await copyAndTranspileFiles(srcDir, compiledDir, routes, logger);
  
  // 4. Generate main entry point
  const { generateDevEntry } = await import('../components/entry-generator.js');
  await generateDevEntry(compiledDir, routes.length > 0, logger);
  
  // 5. Build CSS for dev
  await buildCSS(root, stylesDir, config, logger);
  
  return { outDir: compiledDir, routes };
}

async function discoverRoutes(pagesDir, logger) {
  const routes = [];
  
  if (!existsSync(pagesDir)) {
    return routes;
  }
  
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
          
          if (fileName === 'index') {
            route = route.replace('/index', '') || '/';
          }
          
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
  
  // Sort routes: static first, then dynamic
  routes.sort((a, b) => {
    if (a.type === b.type) return a.route.localeCompare(b.route);
    return a.type === 'static' ? -1 : 1;
  });
  
  return routes;
}

async function copyAndTranspileFiles(srcDir, outDir, routes, logger) {
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  
  // Create transpilers
  const jsxTranspiler = new Bun.Transpiler({
    loader: 'jsx',
    target: 'browser',
    minifyWhitespace: false,
    jsxOptimizationInline: false
  });
  
  const tsxTranspiler = new Bun.Transpiler({
    loader: 'tsx',
    target: 'browser',
    minifyWhitespace: false,
    jsxOptimizationInline: false
  });
  
  // Process all files in src directory
  async function processDirectory(source, target) {
    if (!existsSync(source)) return;
    
    const entries = readdirSync(source, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = join(source, entry.name);
      const destPath = join(target, entry.name);
      
      if (entry.isDirectory()) {
        // Skip certain directories
        if (['node_modules', 'dist', '.git', '.github'].includes(entry.name)) continue;
        
        mkdirSync(destPath, { recursive: true });
        await processDirectory(srcPath, destPath);
        
      } else if (entry.isFile()) {
        const ext = extname(entry.name);
        
        // Skip CSS files (handled separately)
        if (ext === '.css') continue;
        
        try {
          // For JSX/TSX files, transpile
          if (['.jsx', '.tsx'].includes(ext)) {
            const content = await Bun.file(srcPath).text();
            
            // Remove CSS imports
            let cleanContent = content
              .replace(/import\s*['"][^'"]*\.css['"]\s*;?\s*/g, '')
              .replace(/import\s+.*from\s*['"][^'"]*\.css['"]\s*;?\s*/g, '');
            
            // Transpile JSX/TSX to JS
            const transpiled = ext === '.jsx' 
              ? jsxTranspiler.transformSync(cleanContent)
              : tsxTranspiler.transformSync(cleanContent);
            
            // Save as .js file
            const jsPath = destPath.replace(/\.(jsx|tsx)$/, '.js');
            await Bun.write(jsPath, transpiled);
            
          } 
          // For .js and .ts files, just copy (remove CSS imports)
          else if (['.js', '.ts'].includes(ext)) {
            const content = await Bun.file(srcPath).text();
            const cleanContent = content
              .replace(/import\s*['"][^'"]*\.css['"]\s*;?\s*/g, '')
              .replace(/import\s+.*from\s*['"][^'"]*\.css['"]\s*;?\s*/g, '');
            
            await Bun.write(destPath, cleanContent);
          }
          // Copy other files as-is
          else {
            const content = await Bun.file(srcPath).text();
            await Bun.write(destPath, content);
          }
        } catch (error) {
          logger.error(`Failed to process ${srcPath}: ${error.message}`);
          throw error;
        }
      }
    }
  }
  
  await processDirectory(srcDir, outDir);
  logger.info(`Copied and transpiled files to ${outDir}`);
}