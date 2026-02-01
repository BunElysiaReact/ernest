// src/ui/server.js - COMPLETE FIXED VERSION
import { join, extname } from 'path';
import { existsSync, readdirSync } from 'fs';
import { compileProject } from './compiler-dev.js';
import { generateDevEntry } from '../components/entry-generator.js';

export async function startDevServerUI(config, logger) {
  const port = config.port || 3000;
  const root = process.cwd();
  const compiledDir = join(root, '.ernest', 'compiled');
  const stylesDir = join(root, '.ernest', 'styles');
  const srcDir = join(root, config.entry || 'src');
  const publicDir = join(root, 'public');
  
  logger.info(`🚀 Starting UI development server on port ${port}...`);
  
  // Initial compilation
  try {
    const { outDir, routes } = await compileProject(root, config, logger);
    
    // Generate main entry point
    const hasRouter = routes.length > 0;
    await generateDevEntry(outDir, hasRouter, logger);
    
    logger.success('✅ Initial compilation complete');
  } catch (error) {
    logger.error(`❌ Initial compilation failed: ${error.message}`);
    process.exit(1);
  }
  
  const clients = new Set();
  
  const server = Bun.serve({
    port,
    
    async fetch(req, server) {
      const url = new URL(req.url);
      
      // WebSocket for HMR
      if (url.pathname === '/__hmr') {
        const success = server.upgrade(req);
        if (success) return undefined;
        return new Response('WebSocket upgrade failed', { status: 500 });
      }
      
      // Serve HTML
      if (url.pathname === '/' || (!url.pathname.includes('.') && !url.pathname.startsWith('/compiled'))) {
        return new Response(await serveHTML(root, config, port, logger), {
          headers: { 'Content-Type': 'text/html' }
        });
      }
      
      // Serve compiled JavaScript
      if (url.pathname.startsWith('/compiled/')) {
        const filepath = join(compiledDir, url.pathname.replace('/compiled/', ''));
        const file = Bun.file(filepath);
        
        if (await file.exists()) {
          return new Response(file, {
            headers: { 
              'Content-Type': 'application/javascript; charset=utf-8',
              'Cache-Control': 'no-store, no-cache, must-revalidate'
            }
          });
        }
      }
      
      // Serve CSS
      if (url.pathname.startsWith('/styles/')) {
        const filepath = join(stylesDir, url.pathname.replace('/styles/', ''));
        const file = Bun.file(filepath);
        
        if (await file.exists()) {
          return new Response(file, {
            headers: { 
              'Content-Type': 'text/css',
              'Cache-Control': 'no-store'
            }
          });
        }
      }
      
      // Serve images
      if (url.pathname.startsWith('/images/')) {
        const filepath = join(srcDir, 'images', url.pathname.replace('/images/', ''));
        const file = Bun.file(filepath);
        
        if (await file.exists()) {
          const contentType = getImageContentType(extname(filepath));
          return new Response(file, {
            headers: { 
              'Content-Type': contentType,
              'Cache-Control': 'no-cache'
            }
          });
        }
      }
      
      // Serve public files
      if (url.pathname.startsWith('/public/')) {
        const filepath = join(publicDir, url.pathname.replace('/public/', ''));
        const file = Bun.file(filepath);
        
        if (await file.exists()) {
          return new Response(file, {
            headers: { 'Cache-Control': 'no-cache' }
          });
        }
      }
      
      // Serve node_modules
      if (url.pathname.startsWith('/node_modules/')) {
        const filepath = join(root, 'node_modules', url.pathname.replace('/node_modules/', ''));
        const file = Bun.file(filepath);
        
        if (await file.exists()) {
          const contentType = getContentType(extname(filepath));
          return new Response(file, {
            headers: { 
              'Content-Type': contentType,
              'Cache-Control': 'no-cache'
            }
          });
        }
      }
      
      return new Response('Not found', { status: 404 });
    },
    
    websocket: {
      open(ws) {
        clients.add(ws);
        logger.info(`Client connected (${clients.size} total)`);
      },
      
      message(ws, message) {
        // Handle incoming messages if needed
      },
      
      close(ws) {
        clients.delete(ws);
        logger.info(`Client disconnected (${clients.size} remaining)`);
      }
    }
  });
  
  logger.success(`🎉 Server running at http://localhost:${port}`);
  logger.info(`📁 Serving from: ${root}`);
  logger.info(`⚡ HMR enabled at ws://localhost:${port}/__hmr`);
  
  setupFileWatcher(root, compiledDir, clients, logger);
  
  return server;
}

async function serveHTML(root, config, port, logger) {
  const meta = config.meta || {};
  const srcStylesDir = join(root, 'src', 'styles');
  let userStylesheets = '';
  
  if (existsSync(srcStylesDir)) {
    try {
      const cssFiles = readdirSync(srcStylesDir).filter(f => f.endsWith('.css'));
      userStylesheets = cssFiles.map(f => `  <link rel="stylesheet" href="/styles/${f}">`).join('\n');
    } catch (error) {
      logger.warn(`Could not read styles directory: ${error.message}`);
    }
  }
  
  // Auto-detect bertui-animate
  let bertuiAnimateStylesheet = '';
  const bertuiAnimatePath = join(root, 'node_modules/bertui-animate/dist/bertui-animate.min.css');
  if (existsSync(bertuiAnimatePath)) {
    bertuiAnimateStylesheet = '  <link rel="stylesheet" href="/bertui-animate.css">';
  }
  
  // Build import map
  const importMap = {
    "react": "https://esm.sh/react@18.2.0",
    "react-dom": "https://esm.sh/react-dom@18.2.0",
    "react-dom/client": "https://esm.sh/react-dom@18.2.0/client"
  };
  
  // Auto-detect bertui packages
  const nodeModulesDir = join(root, 'node_modules');
  if (existsSync(nodeModulesDir)) {
    try {
      const packages = readdirSync(nodeModulesDir);
      
      for (const pkg of packages) {
        if (!pkg.startsWith('bertui-')) continue;
        
        const pkgDir = join(nodeModulesDir, pkg);
        const pkgJsonPath = join(pkgDir, 'package.json');
        
        if (!existsSync(pkgJsonPath)) continue;
        
        try {
          const pkgJsonContent = await Bun.file(pkgJsonPath).text();
          const pkgJson = JSON.parse(pkgJsonContent);
          
          let mainFile = pkgJson.main || 'index.js';
          const fullPath = join(pkgDir, mainFile);
          
          if (existsSync(fullPath)) {
            importMap[pkg] = `/node_modules/${pkg}/${mainFile}`;
          }
        } catch (error) {
          // Ignore parse errors
        }
      }
    } catch (error) {
      // Ignore scan errors
    }
  }
  
  return `<!DOCTYPE html>
<html lang="${meta.lang || 'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${meta.title || 'BertUI App'}</title>
  
  ${meta.description ? `<meta name="description" content="${meta.description}">` : ''}
  ${meta.keywords ? `<meta name="keywords" content="${meta.keywords}">` : ''}
  ${meta.author ? `<meta name="author" content="${meta.author}">` : ''}
  ${meta.themeColor ? `<meta name="theme-color" content="${meta.themeColor}">` : ''}
  
  <link rel="icon" type="image/svg+xml" href="/public/favicon.svg">
  
${userStylesheets}
${bertuiAnimateStylesheet}
  
  <script type="importmap">
  ${JSON.stringify({ imports: importMap }, null, 2)}
  </script>
  
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  </style>
</head>
<body>
  <div id="root"></div>
  
  <script type="module">
    const ws = new WebSocket('ws://localhost:${port}/__hmr');
    
    ws.onopen = () => {
      console.log('%c🔥 Ernest HMR connected', 'color: #10b981; font-weight: bold');
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'reload') {
        console.log('%c🔄 Reloading...', 'color: #f59e0b; font-weight: bold');
        window.location.reload();
      }
      
      if (data.type === 'recompiling') {
        console.log('%c⚙️ Recompiling...', 'color: #3b82f6');
      }
      
      if (data.type === 'compiled') {
        console.log('%c✅ Compilation complete', 'color: #10b981');
      }
    };
    
    ws.onerror = (error) => {
      console.error('%c❌ HMR connection error', 'color: #ef4444', error);
    };
    
    ws.onclose = () => {
      console.log('%c⚠️ HMR disconnected. Refresh to reconnect.', 'color: #f59e0b');
    };
  </script>
  
  <script type="module" src="/compiled/main.js"></script>
</body>
</html>`;
}

function getImageContentType(ext) {
  const types = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.ico': 'image/x-icon'
  };
  return types[ext.toLowerCase()] || 'application/octet-stream';
}

function getContentType(ext) {
  const types = {
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.html': 'text/html',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
  };
  return types[ext.toLowerCase()] || 'text/plain';
}

function setupFileWatcher(root, compiledDir, clients, logger) {
  const srcDir = join(root, 'src');
  const configPath = join(root, 'ernest.bundler.js');
  
  if (!existsSync(srcDir)) {
    logger.warn('src/ directory not found');
    return;
  }
  
  logger.info(`👀 Watching for changes: ${srcDir}`);
  
  let isRecompiling = false;
  let recompileTimeout = null;
  const watchedExtensions = ['.js', '.jsx', '.ts', '.tsx', '.css'];
  
  function notifyClients(message) {
    for (const client of clients) {
      try {
        client.send(JSON.stringify(message));
      } catch (e) {
        clients.delete(client);
      }
    }
  }
  
  const { watch } = require('fs');
  
  watch(srcDir, { recursive: true }, async (eventType, filename) => {
    if (!filename) return;
    
    const ext = extname(filename);
    if (!watchedExtensions.includes(ext)) return;
    
    logger.info(`📝 File changed: ${filename}`);
    
    clearTimeout(recompileTimeout);
    
    recompileTimeout = setTimeout(async () => {
      if (isRecompiling) return;
      
      isRecompiling = true;
      notifyClients({ type: 'recompiling' });
      logger.info('Recompiling...');
      
      try {
        // Recompile project
        await compileProject(root, {}, logger);
        
        logger.success('✅ Recompiled successfully');
        notifyClients({ type: 'compiled' });
        
        // Trigger reload after a short delay
        setTimeout(() => {
          notifyClients({ type: 'reload' });
        }, 100);
        
      } catch (error) {
        logger.error(`Recompilation failed: ${error.message}`);
      } finally {
        isRecompiling = false;
      }
    }, 150);
  });
  
  if (existsSync(configPath)) {
    watch(configPath, async (eventType) => {
      if (eventType === 'change') {
        logger.info('📝 Config changed, reloading...');
        notifyClients({ type: 'reload' });
      }
    });
  }
}
