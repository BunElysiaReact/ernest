// src/ui/serve.js - Static file server for built output
import { join, extname } from 'path';
import { existsSync } from 'fs';

export async function serveUI(config, logger) {
  const root = process.cwd();
  const distDir = join(root, config.output || 'dist');
  const port = config.port || 8080;
  
  if (!existsSync(distDir)) {
    logger.error(`❌ ${config.output} directory not found!`);
    logger.info('💡 Run "ernest build --mode ui" first');
    process.exit(1);
  }
  
  logger.info(`🌐 Starting static server for ${config.output}/`);
  
  const server = Bun.serve({
    port,
    
    async fetch(req) {
      const url = new URL(req.url);
      let pathname = url.pathname;
      
      // Serve index.html for root
      if (pathname === '/') {
        pathname = '/index.html';
      }
      
      // If no extension, try to serve as directory with index.html
      if (!pathname.includes('.') && !pathname.endsWith('/')) {
        pathname = pathname + '/index.html';
      }
      
      const filepath = join(distDir, pathname);
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
      
      // 404 - Try to serve custom 404.html if it exists
      const notFoundPath = join(distDir, '404.html');
      const notFoundFile = Bun.file(notFoundPath);
      
      if (await notFoundFile.exists()) {
        return new Response(notFoundFile, {
          status: 404,
          headers: { 'Content-Type': 'text/html' }
        });
      }
      
      // Default 404
      return new Response(
        `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>404 - Not Found</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      text-align: center;
      padding: 2rem;
    }
    .container { max-width: 600px; }
    h1 { font-size: 8rem; margin-bottom: 1rem; opacity: 0.9; }
    h2 { font-size: 2rem; margin-bottom: 1rem; }
    p { font-size: 1.2rem; opacity: 0.8; margin-bottom: 2rem; }
    a {
      display: inline-block;
      padding: 1rem 2rem;
      background: white;
      color: #667eea;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      transition: transform 0.2s;
    }
    a:hover { transform: scale(1.05); }
  </style>
</head>
<body>
  <div class="container">
    <h1>404</h1>
    <h2>Page Not Found</h2>
    <p>The page you're looking for doesn't exist.</p>
    <a href="/">← Go Home</a>
  </div>
</body>
</html>`,
        { 
          status: 404,
          headers: { 'Content-Type': 'text/html' }
        }
      );
    }
  });
  
  logger.success(`🚀 Serving at http://localhost:${port}`);
  logger.info(`📁 Directory: ${distDir}`);
  logger.info(`\n💡 Press Ctrl+C to stop`);
  
  return server;
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
    '.avif': 'image/avif',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.eot': 'application/vnd.ms-fontobject',
    '.xml': 'application/xml',
    '.txt': 'text/plain',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg'
  };
  
  return types[ext.toLowerCase()] || 'application/octet-stream';
}