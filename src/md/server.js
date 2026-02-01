// src/md/server.js
import { join, extname } from 'path';
import { existsSync, watch } from 'fs';
import { MarkdownCompiler } from './compiler.js';

export async function startDevServerDocs(config, logger) {
  const port = config.port || 3000;
  const root = process.cwd();
  const docsDir = join(root, config.entry || 'docs');
  const outDir = join(root, '.ernest', 'docs-temp');
  
  logger.info(`🚀 Starting documentation server on port ${port}...`);
  
  if (!existsSync(docsDir)) {
    logger.error(`❌ Docs directory not found: ${docsDir}`);
    process.exit(1);
  }
  
  // Initial build
  try {
    const compiler = new MarkdownCompiler(config, logger);
    await compiler.compile();
    logger.success('✅ Initial documentation build complete');
  } catch (error) {
    logger.error(`❌ Initial build failed: ${error.message}`);
    process.exit(1);
  }
  
  const clients = new Set();
  
  const server = Bun.serve({
    port,
    
    async fetch(req, server) {
      const url = new URL(req.url);
      
      // WebSocket for live reload
      if (url.pathname === '/__hmr') {
        const success = server.upgrade(req);
        if (success) return undefined;
        return new Response('WebSocket upgrade failed', { status: 500 });
      }
      
      // Serve HTML files
      if (url.pathname === '/') {
        return new Response(await serveIndexHTML(docsDir, config, logger), {
          headers: { 'Content-Type': 'text/html' }
        });
      }
      
      // Serve compiled HTML files
      const filepath = join(outDir, url.pathname.slice(1));
      const file = Bun.file(filepath);
      
      if (await file.exists()) {
        return new Response(file, {
          headers: { 
            'Content-Type': 'text/html',
            'Cache-Control': 'no-store, no-cache, must-revalidate'
          }
        });
      }
      
      // Serve assets
      if (url.pathname.startsWith('/assets/')) {
        const assetPath = join(docsDir, 'assets', url.pathname.replace('/assets/', ''));
        const assetFile = Bun.file(assetPath);
        
        if (await assetFile.exists()) {
          const contentType = getContentType(extname(assetPath));
          return new Response(assetFile, {
            headers: { 'Content-Type': contentType }
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
        // Handle incoming messages
      },
      
      close(ws) {
        clients.delete(ws);
        logger.info(`Client disconnected (${clients.size} remaining)`);
      }
    }
  });
  
  logger.success(`🎉 Documentation server running at http://localhost:${port}`);
  logger.info(`📁 Serving from: ${docsDir}`);
  logger.info(`⚡ Live reload enabled at ws://localhost:${port}/__hmr`);
  
  setupDocsWatcher(docsDir, clients, config, logger);
  
  return server;
}

async function serveIndexHTML(docsDir, config, logger) {
  const compiler = new MarkdownCompiler(config, logger);
  const navigation = compiler.buildNavigation(docsDir);
  
  // Find first markdown file to serve as index
  const files = compiler.getMarkdownFiles(docsDir);
  let indexContent = '<h1>Documentation</h1><p>Select a page from the navigation.</p>';
  
  if (files.length > 0) {
    try {
      const firstFile = files[0];
      const markdown = await Bun.file(firstFile).text();
      const { content } = compiler.extractFrontmatter(markdown);
      
      // Convert to HTML
      if (typeof Bun?.markdown?.html === 'function') {
        indexContent = Bun.markdown.html(content);
      } else {
        indexContent = compiler.simpleMarkdownToHTML(content);
      }
    } catch (error) {
      logger.warn(`Could not load first page: ${error.message}`);
    }
  }
  
  const template = compiler.getTemplate();
  const navigationHTML = compiler.renderNavigation(join(docsDir, 'index.html'), 0);
  
  return template
    .replace(/\{\{title\}\}/g, 'Documentation')
    .replace(/\{\{siteTitle\}\}/g, config.title || 'Documentation')
    .replace(/\{\{description\}\}/g, config.description || 'Documentation powered by Ernest')
    .replace(/\{\{logo\}\}/g, config.logo || '📚')
    .replace(/\{\{themeColor\}\}/g, config.themeColor || '#667eea')
    .replace(/\{\{github\}\}/g, config.github || '')
    .replace('{{content}}', indexContent)
    .replace('{{navigation}}', navigationHTML);
}

function getContentType(ext) {
  const types = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf'
  };
  return types[ext.toLowerCase()] || 'text/plain';
}

function setupDocsWatcher(docsDir, clients, config, logger) {
  logger.info(`👀 Watching for changes: ${docsDir}`);
  
  let isRebuilding = false;
  let rebuildTimeout = null;
  
  function notifyClients(message) {
    for (const client of clients) {
      try {
        client.send(JSON.stringify(message));
      } catch (e) {
        clients.delete(client);
      }
    }
  }
  
  watch(docsDir, { recursive: true }, async (eventType, filename) => {
    if (!filename) return;
    
    const ext = extname(filename);
    if (!['.md', '.markdown', '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg'].includes(ext)) {
      return;
    }
    
    logger.info(`📝 File changed: ${filename}`);
    
    clearTimeout(rebuildTimeout);
    
    rebuildTimeout = setTimeout(async () => {
      if (isRebuilding) return;
      
      isRebuilding = true;
      notifyClients({ type: 'recompiling' });
      logger.info('Rebuilding documentation...');
      
      try {
        const compiler = new MarkdownCompiler(config, logger);
        await compiler.compile();
        
        logger.success('✅ Rebuilt successfully');
        notifyClients({ type: 'compiled' });
        
        // Trigger reload after a short delay
        setTimeout(() => {
          notifyClients({ type: 'reload' });
        }, 100);
        
      } catch (error) {
        logger.error(`Rebuild failed: ${error.message}`);
      } finally {
        isRebuilding = false;
      }
    }, 300);
  });
  
  const configPath = join(process.cwd(), 'ernest.bundler.js');
  if (existsSync(configPath)) {
    watch(configPath, async () => {
      logger.info('📝 Config changed, rebuilding...');
      notifyClients({ type: 'reload' });
    });
  }
}