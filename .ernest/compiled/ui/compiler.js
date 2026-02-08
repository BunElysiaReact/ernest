// src/ui/compiler.js - Production compiler with JSX transpilation
import { join, dirname, relative, extname } from 'path';
import { existsSync, mkdirSync, readdirSync } from 'fs';

export class UICompiler {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.root = process.cwd();
  }
  
  async compileForBuild(root, buildDir) {
    const srcDir = join(root, this.config.entry || 'src');
    const pagesDir = join(srcDir, 'pages');
    
    if (!existsSync(srcDir)) {
      throw new Error(`${this.config.entry} directory not found!`);
    }
    
    // Step 1: Discover routes
    const routes = existsSync(pagesDir) 
      ? await this.discoverRoutes(pagesDir)
      : [];
    
    const serverIslands = [];
    const clientRoutes = [];
    
    // Step 2: Detect Server Islands
    for (const route of routes) {
      const sourceCode = await Bun.file(route.path).text();
      const isServerIsland = sourceCode.includes('export const render = "server"');
      
      if (isServerIsland) {
        serverIslands.push(route);
        this.logger.info(`Server Island: ${route.route}`);
      } else {
        clientRoutes.push(route);
      }
    }
    
    this.logger.info(`Discovered ${routes.length} routes (${serverIslands.length} Server Islands)`);
    
    return { routes, serverIslands, clientRoutes };
  }
  
  async compileSrcToBuild(srcDir, buildDir) {
    this.logger.info('Preparing source files for bundling...');
    
    if (!existsSync(buildDir)) mkdirSync(buildDir, { recursive: true });
    
    await this.copyAndFixImports(srcDir, buildDir);
    this.logger.info('✓ Source files ready for bundling');
  }
  
  async copyAndFixImports(srcDir, outDir) {
    const entries = readdirSync(srcDir, { withFileTypes: true });
    // Configure transpiler for production - no dev helpers
    const transpiler = new Bun.Transpiler({ 
      loader: 'tsx',
      target: 'browser',
      minifyWhitespace: false,
      jsxOptimizationInline: false
    });
    
    for (const entry of entries) {
      const srcPath = join(srcDir, entry.name);
      const ext = extname(entry.name);
      
      // Rename .jsx/.tsx/.ts files to .js
      let outFileName = entry.name;
      if (['.jsx', '.tsx', '.ts'].includes(ext)) {
        outFileName = entry.name.replace(/\.(jsx|tsx|ts)$/, '.js');
      }
      const outPath = join(outDir, outFileName);
      
      if (entry.isDirectory()) {
        if (entry.name === 'templates') {
          this.logger.debug(`Skipping templates directory`);
          continue;
        }
        
        if (!existsSync(outPath)) mkdirSync(outPath, { recursive: true });
        await this.copyAndFixImports(srcPath, outPath);
      } else {
        if (ext === '.css') continue; // Skip CSS files
        
        if (['.jsx', '.tsx', '.ts', '.js'].includes(ext)) {
          try {
            let code = await Bun.file(srcPath).text();
            
            // CRITICAL: Transpile JSX/TSX to JS FIRST
            if (['.jsx', '.tsx', '.ts'].includes(ext)) {
              code = transpiler.transformSync(code);
              
              // Replace jsxDEV with React.createElement
              code = code.replace(/jsxDEV[_a-zA-Z0-9]*/g, 'React.createElement');
              code = code.replace(/jsxs[_a-zA-Z0-9]*/g, 'React.createElement');
              code = code.replace(/jsx[_a-zA-Z0-9]*/g, 'React.createElement');
            }
            
            // Remove ALL CSS imports - FIXED to handle no-space case: code = code.replace(/import\s*['"][^'"]*\.css['"]\s*;?\s*/g, '');
            code = code.replace(/import\s*['"][^'"]*\/styles\/[^'"]*\.css['"]\s*;?\s*/g, '');
            code = code.replace(/import\s*['"]bertui\/styles['"]\s*;?\s*/g, '');
            code = code.replace(/import\s+.*from\s*['"][^'"]*\.css['"]\s*;?\s*/g, '');
            
            // Fix bertui/router imports
            code = this.fixBertuiImports(code, srcPath, outPath);
            
            // Add React import if needed (after transpilation)
            if (!code.includes('import React')) {
              code = `import React from 'react';\n${code}`;
            }
            
            // Fix relative imports
            code = this.fixRelativeImports(code);
            
            await Bun.write(outPath, code);
          } catch (error) {
            this.logger.error(`Failed to process ${entry.name}: ${error.message}`);
            throw error;
          }
        }
      }
    }
  }
  
  fixBertuiImports(code, srcPath, outPath) {
    const root = this.root;
    const isBuild = outPath.includes('.ernestbuild');
    const buildDir = isBuild ? join(root, '.ernestbuild') : join(root, '.ernest', 'compiled');
    
    const routerPath = join(buildDir, 'router.js');
    
    if (existsSync(routerPath)) {
      const relativeToRouter = relative(dirname(outPath), routerPath).replace(/\\/g, '/');
      const routerImport = relativeToRouter.startsWith('.') ? relativeToRouter : './' + relativeToRouter;
      
      // Replace all bertui/router import patterns
      code = code.replace(/from\s+['"]bertui\/router['"]/g, `from '${routerImport}'`);
      code = code.replace(/import\s+\{([^}]+)\}\s+from\s+['"]bertui\/router['"]/g, `import {$1} from '${routerImport}'`);
    }
    
    return code;
  }
  
  fixRelativeImports(code) {
    // Fix imports to add .js extension for ES modules
    const importRegex = /from\s+['"](\.\.[\/\\]|\.\/)((?:[^'"]+?)(?<!\.js|\.jsx|\.ts|\.tsx|\.json))['"];?/g;
    
    code = code.replace(importRegex, (match, prefix, path) => {
      // Don't modify if already has extension or is a directory import
      if (path.endsWith('/') || /\.\w+$/.test(path)) return match;
      return `from '${prefix}${path}.js';`;
    });
    
    return code;
  }
  
  async discoverRoutes(pagesDir) {
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
    
    // Sort routes: static first, then dynamic
    routes.sort((a, b) => {
      if (a.type === b.type) return a.route.localeCompare(b.route);
      return a.type === 'static' ? -1 : 1;
    });
    
    return routes;
  }
}