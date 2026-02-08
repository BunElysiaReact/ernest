// src/utils/bertui-deps.js
import { join } from 'path';
import { existsSync } from 'fs';

// BERTUI PACKAGES THAT ERNEST SUPPORTS
const BERTUI_PACKAGES = {
  // Core BertUI framework
  'bertui': {
    router: 'src/router/Router.js',  // Actual file in bertui package
    styles: 'src/styles/bertui.css'
  },
  // BertUI ecosystem packages
  'bertui-icons': {
    entry: 'generated/index.js'
  },
  'bertui-vicons': {
    entry: 'generated/index.js'
  },
  'bertui-animate': {
    entry: 'dist/bertui-animate.css',
    type: 'css'
  },
  'bertui-code': {
    entry: 'dist/index.js'
  }
  // Add new BertUI packages here as they're created
};

export class BertuiDeps {
  constructor(root, logger) {
    this.root = root;
    this.logger = logger;
    this.importMap = {};
    this.stylesheets = [];
  }
  
  scan() {
    const nodeModulesDir = join(this.root, 'node_modules');
    
    if (!existsSync(nodeModulesDir)) {
      this.logger.warn('⚠️  node_modules not found');
      return { importMap: this.buildImportMap(), stylesheets: [] };
    }
    
    // Scan for BertUI packages
    for (const [pkgName, config] of Object.entries(BERTUI_PACKAGES)) {
      const pkgPath = join(nodeModulesDir, pkgName);
      
      if (existsSync(pkgPath)) {
        this.logger.debug(`✅ Found BertUI package: ${pkgName}`);
        this.registerPackage(pkgName, config, pkgPath);
      }
    }
    
    // Warn about unsupported packages
    this.checkForUnsupportedPackages(nodeModulesDir);
    
    return {
      importMap: this.buildImportMap(),
      stylesheets: this.stylesheets
    };
  }
  
  registerPackage(pkgName, config, pkgPath) {
    // Handle bertui/router import
    if (pkgName === 'bertui' && config.router) {
      const routerPath = join(pkgPath, config.router);
      if (existsSync(routerPath)) {
        this.importMap['bertui/router'] = `/node_modules/bertui/${config.router}`;
        this.logger.debug(`  ✓ Mapped bertui/router → ${config.router}`);
      } else {
        this.logger.warn(`  ⚠️  Router file not found: ${config.router}`);
      }
    }
    
    // Register main entry for other packages
    if (config.entry && pkgName !== 'bertui') {
      const entryPath = join(pkgPath, config.entry);
      if (existsSync(entryPath)) {
        this.importMap[pkgName] = `/node_modules/${pkgName}/${config.entry}`;
        this.logger.debug(`  ✓ Mapped ${pkgName} → ${config.entry}`);
      }
    }
    
    // Add CSS files
    if (config.type === 'css' && config.entry) {
      const cssPath = join(pkgPath, config.entry);
      if (existsSync(cssPath)) {
        this.stylesheets.push(`/node_modules/${pkgName}/${config.entry}`);
        this.logger.debug(`  ✓ Added CSS: ${pkgName}/${config.entry}`);
      }
    }
  }
  
  checkForUnsupportedPackages(nodeModulesDir) {
    try {
      const { readdirSync } = require('fs');
      const allPackages = readdirSync(nodeModulesDir);
      
      for (const pkg of allPackages) {
        if (pkg.startsWith('bertui-') && !(pkg in BERTUI_PACKAGES)) {
          this.logger.warn(`⚠️  Unsupported BertUI package: ${pkg}`);
          this.logger.info(`   This package exists but isn't configured in Ernest yet.`);
          this.logger.info(`   Please add it to BERTUI_PACKAGES in bertui-deps.js`);
          this.logger.info(`   Or open an issue to request official support.`);
        }
      }
    } catch (err) {
      // Ignore scan errors
    }
  }
  
  buildImportMap() {
    // Core dependencies (always included)
    const baseMap = {
      'react': 'https://esm.sh/react@18.2.0',
      'react-dom': 'https://esm.sh/react-dom@18.2.0',
      'react-dom/client': 'https://esm.sh/react-dom@18.2.0/client',
      'react/jsx-runtime': 'https://esm.sh/react@18.2.0/jsx-runtime'
    };
    
    // Add BertUI packages
    return { ...baseMap, ...this.importMap };
  }
}