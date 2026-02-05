// src/ui/compiler.js - COMPLETE FIXED VERSION
import { join, dirname, relative, extname } from 'path';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'fs';

export class UICompiler {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.root = process.cwd();
  }
  
  async compileForBuild(root, buildDir) {
    const srcDir = join(root, this.config.entry);
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
    
    // Step 3: Actually compile the source files to buildDir
    await this.compileSrcToBuild(srcDir, buildDir);
    
    return { routes, serverIslands, clientRoutes };
  }
  
  async compileSrcToBuild(srcDir, buildDir) {
    this.logger.info('Compiling source files to build directory...');
    
    // Create bunfig.toml for production JSX
    const bunfigContent = `
[build]
jsx = "react"
jsxFactory = "React.createElement"
jsxFragment = "React.Fragment"
`.trim();
    
    writeFileSync(join(buildDir, 'bunfig.toml'), bunfigContent);
    
    await this.compileDirectory(srcDir, buildDir);
    this.logger.info('✓ Source files compiled');
  }
  
  async compileDirectory(srcDir, outDir) {
    const entries = readdirSync(srcDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = join(srcDir, entry.name);
      const outPath = join(outDir, entry.name);
      
      if (entry.isDirectory()) {
        // Skip templates directory
        if (entry.name === 'templates') continue;
        
        mkdirSync(outPath, { recursive: true });
        await this.compileDirectory(srcPath, outPath);
      } else {
        const ext = extname(entry.name);
        
        // Skip CSS files
        if (ext === '.css') continue;
        
        // Compile JSX/TSX/TS files
        if (['.jsx', '.tsx', '.ts'].includes(ext)) {
          await this.compileFile(srcPath, outPath);
        } 
        // Copy JS files (with minor processing)
        else if (ext === '.js') {
          await this.processJSFile(srcPath, outPath);
        }
      }
    }
  }
  
  async compileFile(srcPath, outPath) {
    const ext = extname(srcPath);
    const outFile = outPath.replace(/\.(jsx|tsx|ts)$/, '.js');
    
    try {
      let code = await Bun.file(srcPath).text();
      
      // ✅ FIX: Transform bertui/router imports BEFORE compilation
      code = this.fixBertuiImports(code, srcPath, outFile);
      
      // Remove CSS imports
      code = code.replace(/import\s+['"][^'"]*\.css['"];?\s*/g, '');
      code = code.replace(/import\s+['"]bertui\/styles['"]\s*;?\s*/g, '');
      
      // Add React import if missing and needed
      if (!code.includes('import React') && this.usesJSX(code)) {
        code = `import React from 'react';\n${code}`;
      }
      
      // Transpile with Bun
      const transpiler = new Bun.Transpiler({
        loader: ext === '.tsx' ? 'tsx' : ext === '.ts' ? 'ts' : 'jsx',
        target: 'browser',
        define: {
          'process.env.NODE_ENV': '"production"'
        },
        tsconfig: {
          compilerOptions: {
            jsx: 'react',
            jsxFactory: 'React.createElement',
            jsxFragmentFactory: 'React.Fragment',
            target: 'ES2020'
          }
        }
      });
      
      let compiled = await transpiler.transform(code);
      
      // Fix relative imports to add .js extension
      compiled = this.fixRelativeImports(compiled);
      
      await Bun.write(outFile, compiled);
      
    } catch (error) {
      this.logger.error(`Failed to compile ${srcPath}: ${error.message}`);
      throw error;
    }
  }
  
  async processJSFile(srcPath, outPath) {
    let code = await Bun.file(srcPath).text();
    
    // ✅ FIX: Transform bertui/router imports
    code = this.fixBertuiImports(code, srcPath, outPath);
    
    // Remove CSS imports
    code = code.replace(/import\s+['"][^'"]*\.css['"];?\s*/g, '');
    
    // Add React import if missing and needed
    if (!code.includes('import React') && this.usesJSX(code)) {
      code = `import React from 'react';\n${code}`;
    }
    
    await Bun.write(outPath, code);
  }
  
  // ✅ NEW METHOD: Fix bertui/router imports (like bertui does)
  fixBertuiImports(code, srcPath, outPath) {
    const root = this.root;
    const buildDir = join(root, '.ernestbuild');
    
    // Transform bertui/router to point to local router.js
    const routerPath = join(buildDir, 'router.js');
    
    if (existsSync(routerPath)) {
      // Calculate relative path from compiled file to router.js
      const relativeToRouter = relative(dirname(outPath), routerPath).replace(/\\/g, '/');
      const routerImport = relativeToRouter.startsWith('.') ? relativeToRouter : './' + relativeToRouter;
      
      // Replace all bertui/router imports
      code = code.replace(/from\s+['"]bertui\/router['"]/g, `from '${routerImport}'`);
      
      // Also handle import { Link } from 'bertui/router' patterns
      code = code.replace(/import\s+\{([^}]+)\}\s+from\s+['"]bertui\/router['"]/g, `import {$1} from '${routerImport}'`);
    } else {
      this.logger.warn(`⚠️  router.js not found in build directory, bertui/router imports may fail`);
    }
    
    return code;
  }
  
  usesJSX(code) {
    return code.includes('React.createElement') || 
           code.includes('React.Fragment') ||
           /<[A-Z]/.test(code);
  }
  
  fixRelativeImports(code) {
    const importRegex = /from\s+['"](\.\.[\/\\]|\.\/)((?:[^'"]+?)(?<!\.js|\.jsx|\.ts|\.tsx|\.json))['"];?/g;
    
    code = code.replace(importRegex, (match, prefix, path) => {
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
    routes.sort((a, b) => a.type === b.type ? a.route.localeCompare(b.route) : a.type === 'static' ? -1 : 1);
    
    return routes;
  }
  
  async transpileFile(srcPath, outDir, envVars = {}) {
    const ext = extname(srcPath);
    const filename = srcPath.split('/').pop();
    const outFilename = filename.replace(/\.(jsx|tsx|ts)$/, '.js');
    const outPath = join(outDir, outFilename);
    
    try {
      let code = await Bun.file(srcPath).text();
      
      // ✅ FIX: Transform bertui/router imports
      code = this.fixBertuiImports(code, srcPath, outPath);
      
      // Remove CSS imports
      code = this.removeCSSImports(code);
      
      // Replace environment variables
      code = this.replaceEnvInCode(code, envVars);
      
      // Add React import if missing
      if (!code.includes('import React') && (code.includes('React.createElement') || /<[A-Z]/.test(code))) {
        code = `import React from 'react';\n${code}`;
      }
      
      // Transpile with Bun
      const transpiler = new Bun.Transpiler({
        loader: ext === '.tsx' ? 'tsx' : ext === '.ts' ? 'ts' : 'jsx',
        target: 'browser',
        define: {
          'process.env.NODE_ENV': '"production"',
          ...Object.fromEntries(
            Object.entries(envVars).map(([key, value]) => [
              `process.env.${key}`,
              JSON.stringify(value)
            ])
          )
        },
        tsconfig: {
          compilerOptions: {
            jsx: 'react',
            jsxFactory: 'React.createElement',
            jsxFragmentFactory: 'React.Fragment',
            target: 'ES2020'
          }
        }
      });
      
      let compiled = await transpiler.transform(code);
      
      // Fix relative imports
      compiled = this.fixRelativeImports(compiled);
      
      await Bun.write(outPath, compiled);
      return { success: true, path: outPath };
    } catch (error) {
      this.logger.error(`Failed to transpile ${filename}: ${error.message}`);
      return { success: false, error };
    }
  }
  
  removeCSSImports(code) {
    code = code.replace(/import\s+['"][^'"]*\.css['"];?\s*/g, '');
    code = code.replace(/import\s+['"]bertui\/styles['"]\s*;?\s*/g, '');
    return code;
  }
  
  replaceEnvInCode(code, envVars) {
    for (const [key, value] of Object.entries(envVars)) {
      const regex = new RegExp(`process\\.env\\.${key}`, 'g');
      code = code.replace(regex, JSON.stringify(value));
    }
    return code;
  }
}