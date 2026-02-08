// src/components/assets.js - COMPLETE VERSION
import { join } from 'path';
import { existsSync, mkdirSync, readdirSync, cpSync } from 'fs';
import { transform } from 'lightningcss';

export async function buildCSS(root, outDir, config, logger) {
  const srcStylesDir = join(root, 'src', 'styles');
  const stylesOutDir = join(outDir, 'styles');
  
  mkdirSync(stylesOutDir, { recursive: true });
  
  if (existsSync(srcStylesDir)) {
    const cssFiles = readdirSync(srcStylesDir).filter(f => f.endsWith('.css'));
    
    if (cssFiles.length === 0) {
      await Bun.write(join(stylesOutDir, 'bertui.min.css'), '/* No CSS */');
      return;
    }
    
    logger.info(`Processing ${cssFiles.length} CSS file(s)...`);
    
    let combinedCSS = '';
    for (const cssFile of cssFiles) {
      const srcPath = join(srcStylesDir, cssFile);
      const file = Bun.file(srcPath);
      const cssContent = await file.text();
      combinedCSS += `/* ${cssFile} */\n${cssContent}\n\n`;
    }
    
    const combinedPath = join(stylesOutDir, 'bertui.min.css');
    
    try {
      const minified = await minifyCSS(combinedCSS, config.css);
      await Bun.write(combinedPath, minified);
      
      const originalSize = Buffer.byteLength(combinedCSS);
      const minifiedSize = Buffer.byteLength(minified);
      const reduction = ((1 - minifiedSize / originalSize) * 100).toFixed(1);
      
      logger.success(`CSS minified: ${(originalSize/1024).toFixed(2)}KB → ${(minifiedSize/1024).toFixed(2)}KB (-${reduction}%)`);
    } catch (error) {
      logger.warn(`CSS minification failed: ${error.message}`);
      logger.info('Falling back to unminified CSS...');
      await Bun.write(combinedPath, combinedCSS);
    }
    
    logger.success(`✅ Combined ${cssFiles.length} CSS files`);
  } else {
    // No styles directory, create empty CSS
    await Bun.write(join(stylesOutDir, 'bertui.min.css'), '/* No custom styles */');
    logger.info('No styles directory found, created empty CSS');
  }
}

async function minifyCSS(css, cssConfig) {
  const { code } = transform({
    filename: 'styles.css',
    code: Buffer.from(css),
    minify: cssConfig.minify,
    sourceMap: false,
    targets: {
      chrome: (cssConfig.targets?.chrome || 90) << 16,
      firefox: (cssConfig.targets?.firefox || 88) << 16,
      safari: (cssConfig.targets?.safari || 14) << 16,
      edge: (cssConfig.targets?.edge || 90) << 16
    },
    drafts: {
      nesting: cssConfig.nesting !== false
    }
  });
  
  return code.toString();
}

export async function copyImages(srcDir, outDir, logger) {
  const imageExtensions = [
    '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', 
    '.avif', '.ico', '.bmp', '.tiff', '.tif'
  ];
  
  let copied = 0;
  let skipped = 0;

  if (!existsSync(srcDir)) {
    logger.warn(`⚠️  Source not found: ${srcDir}`);
    return 0;
  }

  mkdirSync(outDir, { recursive: true });

  function processDirectory(dir, targetDir) {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const srcPath = join(dir, entry.name);
        const destPath = join(targetDir, entry.name);

        if (entry.isDirectory()) {
          const subDestPath = join(targetDir, entry.name);
          mkdirSync(subDestPath, { recursive: true });
          processDirectory(srcPath, subDestPath);
        } else if (entry.isFile()) {
          const ext = entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase();

          if (imageExtensions.includes(ext)) {
            try {
              cpSync(srcPath, destPath);
              copied++;
            } catch (error) {
              logger.warn(`  Failed to copy ${entry.name}: ${error.message}`);
              skipped++;
            }
          } else {
            skipped++;
          }
        }
      }
    } catch (error) {
      logger.error(`Error processing ${dir}: ${error.message}`);
    }
  }

  processDirectory(srcDir, outDir);

  if (copied > 0) {
    logger.success(`✅ Copied ${copied} image(s)`);
  }
  
  if (skipped > 0) {
    logger.debug(`Skipped ${skipped} non-image file(s)`);
  }

  return copied;
}

export async function copyStaticAssets(root, outDir, logger) {
  const publicDir = join(root, 'public');
  const srcImagesDir = join(root, 'src', 'images');
  
  // Copy from public/ directory
  if (existsSync(publicDir)) {
    logger.info('Copying from public/...');
    await copyAllFiles(publicDir, outDir, logger);
  }
  
  // Copy images from src/images/
  if (existsSync(srcImagesDir)) {
    logger.info('Copying from src/images/...');
    const distImagesDir = join(outDir, 'images');
    mkdirSync(distImagesDir, { recursive: true });
    await copyImages(srcImagesDir, distImagesDir, logger);
  }
}

async function copyAllFiles(srcDir, outDir, logger) {
  if (!existsSync(srcDir)) {
    return;
  }
  
  let copied = 0;
  
  function processDirectory(dir, targetDir) {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const srcPath = join(dir, entry.name);
        const destPath = join(targetDir, entry.name);
        
        if (entry.isDirectory()) {
          mkdirSync(destPath, { recursive: true });
          processDirectory(srcPath, destPath);
        } else {
          try {
            cpSync(srcPath, destPath);
            copied++;
          } catch (error) {
            logger.warn(`Failed to copy ${entry.name}: ${error.message}`);
          }
        }
      }
    } catch (error) {
      logger.error(`Error processing ${dir}: ${error.message}`);
    }
  }
  
  processDirectory(srcDir, outDir);
  
  if (copied > 0) {
    logger.success(`✅ Copied ${copied} file(s) from public/`);
  }
}