import { join, dirname, relative, extname } from 'path';
import { existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { generateRouter } from '../components/router.js';

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
  const stats = await compileDirectory(srcDir, outDir, root, logger);
  const duration = Date.now() - startTime;
  
  if (routes.length > 0) {
    await generateRouter(routes, outDir, logger);
    logger.info('Generated router.js');
  }
  
  logger.success(`Compiled ${stats.files} files in ${duration}ms`);
  return { outDir, stats, routes };
}

async function discoverRoutes(pagesDir) {
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
  return routes;
}

async function compileDirectory(srcDir, outDir, root, logger) {
  const stats = { files: 0, skipped: 0 };
  const files = readdirSync(srcDir);
  
  for (const file of files) {
    const srcPath = join(srcDir, file);
    const stat = statSync(srcPath);
    
    if (stat.isDirectory()) {
      if (file === 'templates') {
        logger.debug('⏭️  Skipping templates directory');
        continue;
      }
      
      const subOutDir = join(outDir, file);
      mkdirSync(subOutDir, { recursive: true });
      const subStats = await compileDirectory(srcPath, subOutDir, root, logger);
      stats.files += subStats.files;
      stats.skipped += subStats.skipped;
    } else {
      const ext = extname(file);
      const relativePath = relative(join(root, 'src'), srcPath);
      
      if (ext === '.css') {
        const stylesOutDir = join(root, '.ernest', 'styles');
        if (!existsSync(stylesOutDir)) {
          mkdirSync(stylesOutDir, { recursive: true });
        }
        const cssOutPath = join(stylesOutDir, file);
        await Bun.write(cssOutPath, Bun.file(srcPath));
        stats.files++;
      } else if (['.jsx', '.tsx', '.ts'].includes(ext)) {
        await compileFile(srcPath, outDir, file, relativePath, root, logger);
        stats.files++;
      } else if (ext === '.js') {
        const outPath = join(outDir, file);
        let code = await Bun.file(srcPath).text();
        
        code = code.replace(/import\s+['"][^'"]*\.css['"];?\s*/g, '');
        
        if (usesJSX(code) && !code.includes('import React')) {
          code = `import React from 'react';\n${code}`;
        }
        
        await Bun.write(outPath, code);
        stats.files++;
      } else {
        stats.skipped++;
      }
    }
  }
  
  return stats;
}

async function compileFile(srcPath, outDir, filename, relativePath, root, logger) {
  const ext = extname(filename);
  const loader = ext === '.tsx' ? 'tsx' : ext === '.ts' ? 'ts' : 'jsx';
  
  try {
    let code = await Bun.file(srcPath).text();
    
    code = code.replace(/import\s+['"][^'"]*\.css['"];?\s*/g, '');
    
    const outPath = join(outDir, filename.replace(/\.(jsx|tsx|ts)$/, '.js'));
    
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

function usesJSX(code) {
  return code.includes('React.createElement') || 
         code.includes('React.Fragment') ||
         /<[A-Z]/.test(code);
}

function fixRelativeImports(code) {
  const importRegex = /from\s+['"](\.\.?\/[^'"]+?)(?<!\.js|\.jsx|\.ts|\.tsx|\.json)['"]/g;
  
  code = code.replace(importRegex, (match, path) => {
    if (path.endsWith('/') || /\.\w+$/.test(path)) {
      return match;
    }
    return `from '${path}.js'`;
  });
  
  return code;
}
