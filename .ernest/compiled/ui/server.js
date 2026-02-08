// src/ui/server.js - COMPLETE FIXED VERSION
import { join, extname } from 'path';
import { existsSync, readdirSync } from 'fs';

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
    const { compileProject } = await import('./compiler-dev.js');
    const { outDir, routes } = await compileProject(root, config, logger);
    
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
      
      // Serve CSS - FIXED
      if (url.pathname === '/styles/bertui.min.css' || url.pathname.startsWith('/styles/')) {
        const filename = url.pathname === '/styles/bertui.min.css' ? 'bertui.min.css' : url.pathname.replace('/styles/', '');
        const filepath = join(stylesDir, filename);
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
      
      // Serve node_modules files
      if (url.pathname.startsWith('/node_modules/')) {
        const filepath = join(root, url.pathname);
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
      
      return new Response('Not found', { status: 404 });
    },
    
    websocket: {
      open(ws) {
        clients.add(ws);
        logger.debug(`Client connected (${clients.size} total)`);
      },
      
      message(ws, message) {
        // Handle incoming messages if needed
      },
      
      close(ws) {
        clients.delete(ws);
        logger.debug(`Client disconnected (${clients.size} remaining)`);
      }
    }
  });
  
  logger.success(`🎉 Server running at http://localhost:${port}`);
  logger.info(`📁 Serving from: ${root}`);
  logger.info(`⚡ HMR enabled at ws://localhost:${port}/__hmr`);
  
  setupFileWatcher(root, compiledDir, clients, config, logger);
  
  return server;
}

async function serveHTML(root, config, port, logger) {
  const meta = config.meta || {};
  
  // Build import map
  const importMap = {
    "react": "https://esm.sh/react@18.2.0",
    "react-dom": "https://esm.sh/react-dom@18.2.0",
    "react-dom/client": "https://esm.sh/react-dom@18.2.0/client",
    "react/jsx-runtime": "https://esm.sh/react@18.2.0/jsx-runtime"
  };
  
  // Scan node_modules for packages
  const nodeModulesDir = join(root, 'node_modules');
  if (existsSync(nodeModulesDir)) {
    try {
      const packages = readdirSync(nodeModulesDir);
      
      for (const pkg of packages) {
        if (pkg.startsWith('bertui-') || pkg === 'bertui') {
          const pkgDir = join(nodeModulesDir, pkg);
          const pkgJsonPath = join(pkgDir, 'package.json');
          
          if (!existsSync(pkgJsonPath)) continue;
          
          try {
            const pkgJsonContent = await Bun.file(pkgJsonPath).text();
            const pkgJson = JSON.parse(pkgJsonContent);
            
            // Find the main entry point
            let mainFile = pkgJson.module || pkgJson.main || 'index.js';
            mainFile = mainFile.replace(/^\.\//, '');
            const fullPath = join(pkgDir, mainFile);
            
            if (existsSync(fullPath)) {
              importMap[pkg] = `/node_modules/${pkg}/${mainFile}`;
            }
          } catch (error) {
            // Skip packages with invalid package.json
            continue;
          }
        }
      }
    } catch (error) {
      logger.warn(`Could not scan node_modules: ${error.message}`);
    }
  }
  
  return `<!DOCTYPE html>
<html lang="${meta.lang || 'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${meta.title || 'Ernest App'}</title>
  
  <link rel="stylesheet" href="/styles/bertui.min.css">
  
  <script type="importmap">
${JSON.stringify({ imports: importMap }, null, 2)}
  </script>
</head>
<body>
  <div id="root"></div>
  
  <script>
    const ws = new WebSocket('ws://localhost:${port}/__hmr');
    
    ws.onopen = () => {
      console.log('[HMR] Connected');
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'reload') {
        window.location.reload();
      }
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
    '.mjs': 'application/javascript',
    '.jsx': 'application/javascript',
    '.ts': 'application/typescript',
    '.tsx': 'application/typescript',
    '.css': 'text/css',
    '.html': 'text/html',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf'
  };
  return types[ext.toLowerCase()] || 'application/octet-stream';
}

function setupFileWatcher(root, compiledDir, clients, config, logger) {
  const srcDir = join(root, 'src');
  const configPath = join(root, 'ernest.bundler.js');
  
  if (!existsSync(srcDir)) {
    logger.warn('src/ directory not found');
    return;
  }
  
  logger.info(`👀 Watching for changes: ${srcDir}`);
  
  let isRecompiling = false;
  let pendingChanges = new Set();
  
  function notifyClients(message) {
    for (const client of clients) {
      try {
        client.send(JSON.stringify(message));
      } catch (e) {
        clients.delete(client);
      }
    }
  }
  
  // Use fs.watch
  import('fs').then(({ watch }) => {
    const watcher = watch(srcDir, { recursive: true }, async (eventType, filename) => {
      if (!filename) return;
      
      const ext = extname(filename);
      if (!['.js', '.jsx', '.ts', '.tsx', '.css'].includes(ext)) return;
      
      logger.info(`📝 File changed: ${filename}`);
      
      pendingChanges.add(filename);
      
      if (isRecompiling) return;
      
      isRecompiling = true;
      
      // Wait a bit to collect multiple changes
      await Bun.sleep(50);
      
      const changes = Array.from(pendingChanges);
      pendingChanges.clear();
      
      notifyClients({ type: 'recompiling' });
      logger.info(`Recompiling ${changes.length} file(s)...`);
      
      try {
        // Recompile project
        const { compileProject } = await import('./compiler-dev.js');
        await compileProject(root, config, logger);
        
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
    });
    
    if (existsSync(configPath)) {
      watch(configPath, async (eventType) => {
        if (eventType === 'change') {
          logger.info('📝 Config changed, reloading...');
          notifyClients({ type: 'reload' });
        }
      });
    }
  });
}