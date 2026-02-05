import { join, dirname, relative, extname } from 'path';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'fs';

export class UICompiler {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.root = process.cwd();
    
    // ✅ SINGLE TRANSPILER INSTANCE - REUSE THIS!
    // This is significantly faster than creating a new transpiler per file.
    this.transpiler = new Bun.Transpiler({
      loader: 'jsx', // Default, will be overridden in specific calls if needed
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
    
    if (!existsSync(buildDir)) mkdirSync(buildDir, { recursive: true });
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
        if (entry.name === 'templates') continue;
        
        if (!existsSync(outPath)) mkdirSync(outPath, { recursive: true });
        await this.compileDirectory(srcPath, outPath);
      } else {
        const ext = extname(entry.name);
        if (ext === '.css') continue;
        
        if (['.jsx', '.tsx', '.ts'].includes(ext)) {
          await this.compileFile(srcPath, outPath);
        } 
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
      
      // Remove CSS and style imports
      code = code.replace(/import\s+['"][^'"]*\.css['"];?\s*/g, '');
      code = code.replace(/import\s+['"]bertui\/styles['"]\s*;?\s*/g, '');
      
      // Add React import if missing and needed
      if (!code.includes('import React') && this.usesJSX(code)) {
        code = `import React from 'react';\n${code}`;
      }
      
      // ✅ USE THE SINGLE TRANSPILER INSTANCE
      // We pass the code to the pre-configured transpiler
      let compiled = await this.transpiler.transform(code, ext.substring(1));
      
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
  
  fixBertuiImports(code, srcPath, outPath) {
    const root = this.root;
    // Note: Development uses .ernest/compiled, Build uses .ernestbuild
    const isBuild = outPath.includes('.ernestbuild');
    const buildDir = isBuild ? join(root, '.ernestbuild') : join(root, '.ernest', 'compiled');
    
    const routerPath = join(buildDir, 'router.js');
    
    if (existsSync(routerPath)) {
      const relativeToRouter = relative(dirname(outPath), routerPath).replace(/\\/g, '/');
      const routerImport = relativeToRouter.startsWith('.') ? relativeToRouter : './' + relativeToRouter;
      
      // Replace all bertui/router import patterns
      code = code.replace(/from\s+['"]bertui\/router['"]/g, `from '${routerImport}'`);
      code = code.replace(/import\s+\{([^}]+)\}\s+from\s+['"]bertui\/router['"]/g, `import {$1} from '${routerImport}'`);
    } else {
      // Don't warn on every file during dev if router is still generating
      if (isBuild) this.logger.warn(`⚠️  router.js not found in ${buildDir}`);
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
      code = this.fixBertuiImports(code, srcPath, outPath);
      code = code.replace(/import\s+['"][^'"]*\.css['"];?\s*/g, '');
      code = code.replace(/import\s+['"]bertui\/styles['"]\s*;?\s*/g, '');
      
      // Environment variable replacement
      for (const [key, value] of Object.entries(envVars)) {
        const regex = new RegExp(`process\\.env\\.${key}`, 'g');
        code = code.replace(regex, JSON.stringify(value));
      }
      
      if (!code.includes('import React') && this.usesJSX(code)) {
        code = `import React from 'react';\n${code}`;
      }
      
      // Single transpiler use with custom defines for this specific file
      const compiled = await this.transpiler.transform(code, ext.substring(1));
      let finalCode = this.fixRelativeImports(compiled);
      
      await Bun.write(outPath, finalCode);
      return { success: true, path: outPath };
    } catch (error) {
      this.logger.error(`Failed to transpile ${filename}: ${error.message}`);
      return { success: false, error };
    }
  }
}