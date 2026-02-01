// src/ui/compiler.js
import { join, dirname, relative, extname } from 'path';
import { existsSync, mkdirSync, readdirSync, statSync } from 'fs';

export class UICompiler {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.root = process.cwd();
  }
  
  async compileForBuild() {
    const srcDir = join(this.root, this.config.entry);
    const pagesDir = join(srcDir, 'pages');
    
    if (!existsSync(srcDir)) {
      throw new Error(`${this.config.entry} directory not found!`);
    }
    
    const routes = existsSync(pagesDir) 
      ? await this.discoverRoutes(pagesDir)
      : [];
    
    const serverIslands = [];
    const clientRoutes = [];
    
    // Detect Server Islands
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
  
  fixRelativeImports(code) {
    const importRegex = /from\s+['"](\.\.[\/\\]|\.\/)((?:[^'"]+?)(?<!\.js|\.jsx|\.ts|\.tsx|\.json))['"];?/g;
    code = code.replace(importRegex, (match, prefix, path) => {
      if (path.endsWith('/') || /\.\w+$/.test(path)) return match;
      return `from '${prefix}${path}.js';`;
    });
    return code;
  }
}