// src/md/compiler.js
import { join, dirname, basename, extname } from 'path';
import { existsSync, mkdirSync, readdirSync } from 'fs';

export class MarkdownCompiler {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.root = process.cwd();
    this.docsDir = join(this.root, config.entry || 'docs');
    this.outDir = join(this.root, config.output || 'dist/docs');
    this.navigation = [];
  }
  
  async compile() {
    this.logger.info(`📚 Compiling markdown documentation...`);
    
    if (!existsSync(this.docsDir)) {
      throw new Error(`Docs directory not found: ${this.docsDir}`);
    }
    
    // Clean output directory
    if (existsSync(this.outDir)) {
      // Clean will be handled by main bundler
    }
    mkdirSync(this.outDir, { recursive: true });
    
    // Build navigation
    this.navigation = this.buildNavigation(this.docsDir);
    this.logger.info(`Discovered ${this.navigation.length} pages`);
    
    // Get all markdown files
    const files = this.getMarkdownFiles(this.docsDir);
    this.logger.info(`Processing ${files.length} markdown files...`);
    
    // Process files in batches
    const BATCH_SIZE = 10;
    let processed = 0;
    
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      
      for (const file of batch) {
        await this.processMarkdownFile(file);
        processed++;
        
        // Update progress
        const percent = Math.round((processed / files.length) * 100);
        this.logger.progress(processed, files.length, `Compiling markdown...`);
      }
    }
    
    // Copy assets
    await this.copyAssets();
    
    return {
      files: files.length,
      navigation: this.navigation
    };
  }
  
  buildNavigation(dir, basePath = '') {
    const nav = [];
    const entries = readdirSync(dir, { withFileTypes: true });
    
    // Sort: directories first, then files
    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });
    
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'assets') continue;
      
      const fullPath = join(dir, entry.name);
      const relativePath = join(basePath, entry.name);
      
      if (entry.isDirectory()) {
        const children = this.buildNavigation(fullPath, relativePath);
        if (children.length > 0) {
          nav.push({
            type: 'directory',
            name: this.formatTitle(entry.name),
            path: relativePath.replace(/\\/g, '/'),
            children
          });
        }
      } else if (entry.name.endsWith('.md')) {
        const markdown = readFileSync(fullPath, 'utf-8');
        const title = this.extractTitle(markdown) || this.formatTitle(entry.name.replace('.md', ''));
        
        nav.push({
          type: 'file',
          name: title,
          path: relativePath.replace(/\\/g, '/').replace('.md', '.html'),
          fullPath: fullPath
        });
      }
    }
    
    return nav;
  }
  
  formatTitle(filename) {
    return filename
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  }
  
  getMarkdownFiles(dir) {
    const files = [];
    const entries = readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'assets') continue;
      
      const fullPath = join(dir, entry.name);
      
      if (entry.isDirectory()) {
        files.push(...this.getMarkdownFiles(fullPath));
      } else if (entry.name.endsWith('.md') || entry.name.endsWith('.markdown')) {
        files.push(fullPath);
      }
    }
    
    return files;
  }
  
  async processMarkdownFile(filepath) {
    try {
      const markdown = await Bun.file(filepath).text();
      
      // Extract frontmatter if present
      const { content, frontmatter } = this.extractFrontmatter(markdown);
      
      // Convert markdown to HTML using Bun's native function
      let html;
      try {
        // Try Bun.markdown.html() if available
        if (typeof Bun?.markdown?.html === 'function') {
          html = Bun.markdown.html(content);
        } else {
          // Fallback to simple conversion (can add marked later if needed)
          html = this.simpleMarkdownToHTML(content);
        }
      } catch (error) {
        this.logger.warn(`Markdown conversion failed for ${filepath}, using fallback`);
        html = this.simpleMarkdownToHTML(content);
      }
      
      // Generate final HTML with template
      const finalHTML = this.applyTemplate(html, frontmatter, filepath);
      
      // Determine output path
      const outPath = this.getOutputPath(filepath);
      const outDir = dirname(outPath);
      
      if (!existsSync(outDir)) {
        mkdirSync(outDir, { recursive: true });
      }
      
      // Write file
      await Bun.write(outPath, finalHTML);
      
      const relativePath = filepath.replace(this.docsDir + '/', '');
      this.logger.success(`Built: ${relativePath}`);
      
      return { success: true, path: outPath };
    } catch (error) {
      this.logger.error(`Failed to process ${filepath}: ${error.message}`);
      return { success: false, error };
    }
  }
  
  extractFrontmatter(markdown) {
    const frontmatter = {};
    let content = markdown;
    
    // Check for YAML frontmatter
    if (markdown.startsWith('---')) {
      const end = markdown.indexOf('---', 3);
      if (end !== -1) {
        const frontmatterText = markdown.substring(3, end).trim();
        content = markdown.substring(end + 3).trim();
        
        // Parse simple key-value pairs
        const lines = frontmatterText.split('\n');
        for (const line of lines) {
          const match = line.match(/^(\w+):\s*(.+)$/);
          if (match) {
            const [, key, value] = match;
            frontmatter[key] = value.trim();
          }
        }
      }
    }
    
    // Extract title from first h1 if not in frontmatter
    if (!frontmatter.title) {
      const titleMatch = content.match(/^#\s+(.+)$/m);
      if (titleMatch) {
        frontmatter.title = titleMatch[1].trim();
      }
    }
    
    return { content, frontmatter };
  }
  
  extractTitle(markdown) {
    const { frontmatter } = this.extractFrontmatter(markdown);
    return frontmatter.title;
  }
  
  simpleMarkdownToHTML(markdown) {
    // Basic markdown to HTML conversion
    let html = markdown
      // Headers
      .replace(/^# (.*$)/gm, '<h1>$1</h1>')
      .replace(/^## (.*$)/gm, '<h2>$1</h2>')
      .replace(/^### (.*$)/gm, '<h3>$1</h3>')
      .replace(/^#### (.*$)/gm, '<h4>$1</h4>')
      .replace(/^##### (.*$)/gm, '<h5>$1</h5>')
      .replace(/^###### (.*$)/gm, '<h6>$1</h6>')
      
      // Bold
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.*?)__/g, '<strong>$1</strong>')
      
      // Italic
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/_(.*?)_/g, '<em>$1</em>')
      
      // Code blocks
      .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      
      // Lists
      .replace(/^\s*\*\s+(.*$)/gm, '<li>$1</li>')
      .replace(/^\s*-\s+(.*$)/gm, '<li>$1</li>')
      .replace(/^\s*\d+\.\s+(.*$)/gm, '<li>$1</li>')
      
      // Links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      
      // Images
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')
      
      // Paragraphs (simple version)
      .split('\n\n')
      .map(para => {
        if (!para.match(/^<[a-z]/i) && para.trim()) {
          return `<p>${para}</p>`;
        }
        return para;
      })
      .join('\n\n');
    
    // Wrap loose list items in ul/ol
    html = html.replace(/(<li>.*?<\/li>\n?)+/g, match => {
      const items = match.split('</li>').filter(item => item.includes('<li>'));
      if (items.length > 0) {
        // Check if first item starts with a number
        const firstItem = items[0];
        const isOrdered = firstItem.match(/<li>\d+\./);
        const tag = isOrdered ? 'ol' : 'ul';
        return `<${tag}>\n${items.map(item => item + '</li>').join('\n')}\n</${tag}>`;
      }
      return match;
    });
    
    return html;
  }
  
  applyTemplate(content, frontmatter, filepath) {
    const title = frontmatter.title || 'Documentation';
    const description = frontmatter.description || this.config.description || 'Documentation powered by Ernest';
    
    // Get template
    const template = this.getTemplate();
    
    // Calculate depth for navigation highlighting
    const outPath = this.getOutputPath(filepath);
    const relativeFromOut = outPath.replace(this.outDir + '/', '');
    const depth = relativeFromOut.split('/').length - 1;
    
    // Render navigation
    const navigationHTML = this.renderNavigation(outPath, depth);
    
    // Apply template replacements
    return template
      .replace(/\{\{title\}\}/g, title)
      .replace(/\{\{siteTitle\}\}/g, this.config.title || 'Documentation')
      .replace(/\{\{description\}\}/g, description)
      .replace(/\{\{logo\}\}/g, this.config.logo || '📚')
      .replace(/\{\{themeColor\}\}/g, this.config.themeColor || '#667eea')
      .replace(/\{\{github\}\}/g, this.config.github || '')
      .replace('{{content}}', content)
      .replace('{{navigation}}', navigationHTML)
      .replace('{{config}}', JSON.stringify(this.config));
  }
  
  getTemplate() {
    // Default template (similar to BertUI-Press)
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{title}} - {{siteTitle}}</title>
  <meta name="description" content="{{description}}">
  <meta name="theme-color" content="{{themeColor}}">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      line-height: 1.7;
      color: #333;
      background: #fafafa;
    }

    .container {
      display: grid;
      grid-template-columns: 280px 1fr;
      min-height: 100vh;
    }

    .sidebar {
      background: white;
      border-right: 1px solid #e5e7eb;
      padding: 2rem;
      position: sticky;
      top: 0;
      height: 100vh;
      overflow-y: auto;
    }

    .sidebar-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 2px solid #e5e7eb;
    }

    .logo {
      font-size: 2rem;
    }

    .site-title {
      font-size: 1.25rem;
      font-weight: 700;
      color: {{themeColor}};
    }

    .content {
      max-width: 900px;
      padding: 3rem;
      background: white;
      margin: 2rem;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    h1, h2, h3, h4 {
      margin-top: 2rem;
      margin-bottom: 1rem;
      font-weight: 700;
      line-height: 1.3;
    }

    h1 {
      font-size: 2.5rem;
      color: {{themeColor}};
      border-bottom: 3px solid {{themeColor}};
      padding-bottom: 0.5rem;
      margin-top: 0;
    }

    h2 {
      font-size: 2rem;
      color: #764ba2;
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 0.5rem;
    }

    h3 { font-size: 1.5rem; color: #555; }
    h4 { font-size: 1.25rem; color: #666; }

    p { margin-bottom: 1.25rem; font-size: 1.05rem; }

    code {
      background: #f4f4f4;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      font-size: 0.9em;
      color: #e83e8c;
    }

    pre {
      background: #1a1a1a;
      color: #4ade80;
      padding: 1.5rem;
      border-radius: 8px;
      overflow-x: auto;
      margin: 1.5rem 0;
      border: 1px solid #333;
    }

    pre code {
      background: none;
      padding: 0;
      color: #4ade80;
      font-size: 0.95rem;
    }

    a {
      color: {{themeColor}};
      text-decoration: none;
      font-weight: 500;
    }

    a:hover {
      text-decoration: underline;
    }

    ul, ol {
      margin-left: 1.5rem;
      margin-bottom: 1.25rem;
    }

    li {
      margin-bottom: 0.5rem;
    }

    blockquote {
      border-left: 4px solid {{themeColor}};
      padding-left: 1.5rem;
      margin: 1.5rem 0;
      color: #666;
      font-style: italic;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1.5rem 0;
    }

    th, td {
      border: 1px solid #e5e7eb;
      padding: 0.75rem;
      text-align: left;
    }

    th {
      background: #f9fafb;
      font-weight: 600;
    }

    .github-link {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: #333;
      color: white;
      border-radius: 6px;
      margin-top: 1rem;
      font-size: 0.9rem;
    }

    @media (max-width: 768px) {
      .container {
        grid-template-columns: 1fr;
      }
      
      .sidebar {
        position: static;
        height: auto;
        border-right: none;
        border-bottom: 1px solid #e5e7eb;
      }
      
      .content {
        margin: 1rem;
        padding: 1.5rem;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="logo">{{logo}}</div>
        <div class="site-title">{{siteTitle}}</div>
      </div>
      
      <nav>
        {{navigation}}
      </nav>

      {{#if github}}
      <a href="{{github}}" class="github-link" target="_blank">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
        </svg>
        GitHub
      </a>
      {{/if}}
    </aside>

    <main class="content">
      {{content}}
    </main>
  </div>
</body>
</html>`;
  }
  
  renderNavigation(currentPath, currentDepth) {
    const baseUrl = this.config.baseUrl || '';
    
    const renderItems = (items, level = 0) => {
      return items.map(item => {
        if (item.type === 'directory') {
          return `
            <div style="margin-left: ${level * 1}rem;">
              <div style="font-weight: 600; margin: 0.5rem 0; color: #667eea;">
                📁 ${item.name}
              </div>
              ${renderItems(item.children, level + 1)}
            </div>
          `;
        } else {
          // Create absolute URL with baseUrl
          let href;
          if (baseUrl) {
            const cleanPath = item.path.startsWith('/') ? item.path.slice(1) : item.path;
            href = `${baseUrl}/${cleanPath}`;
          } else {
            href = `/${item.path}`;
          }
          
          // Check if this is the current page
          const targetPath = this.getOutputPath(item.fullPath);
          const isActive = currentPath === targetPath;
          
          return `
            <a href="${href}" 
               style="
                 display: block;
                 padding: 0.5rem;
                 margin-left: ${level * 1}rem;
                 color: ${isActive ? '#667eea' : '#666'};
                 text-decoration: none;
                 border-left: 3px solid ${isActive ? '#667eea' : 'transparent'};
                 background: ${isActive ? 'rgba(102, 126, 234, 0.1)' : 'transparent'};
                 border-radius: 4px;
                 transition: all 0.2s;
               "
               onmouseover="this.style.background='rgba(102, 126, 234, 0.1)'"
               onmouseout="this.style.background='${isActive ? 'rgba(102, 126, 234, 0.1)' : 'transparent'}'"
            >
              📄 ${item.name}
            </a>
          `;
        }
      }).join('');
    };
    
    return renderItems(this.navigation);
  }
  
  getOutputPath(filepath) {
    const relative = filepath.replace(this.docsDir, '').replace(/^[\\/]/, '');
    return join(this.outDir, relative.replace(/\.md$|\.markdown$/, '.html'));
  }
  
  async copyAssets() {
    const assetsDir = join(this.docsDir, 'assets');
    
    if (existsSync(assetsDir)) {
      const outAssetsDir = join(this.outDir, 'assets');
      mkdirSync(outAssetsDir, { recursive: true });
      
      // Simple recursive copy
      const copyRecursive = (src, dest) => {
        const entries = readdirSync(src, { withFileTypes: true });
        
        for (const entry of entries) {
          const srcPath = join(src, entry.name);
          const destPath = join(dest, entry.name);
          
          if (entry.isDirectory()) {
            mkdirSync(destPath, { recursive: true });
            copyRecursive(srcPath, destPath);
          } else {
            const content = readFileSync(srcPath);
            writeFileSync(destPath, content);
          }
        }
      };
      
      copyRecursive(assetsDir, outAssetsDir);
      this.logger.info(`Copied assets to ${outAssetsDir}`);
    }
  }
}