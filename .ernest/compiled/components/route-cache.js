// src/components/route-cache.js
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';

const ROUTE_CACHE_PATH = '.ernest/route-cache.json';

export class RouteCache {
  constructor(root) {
    this.root = root;
    this.cachePath = join(root, ROUTE_CACHE_PATH);
    this.cache = this.loadCache();
  }
  
  loadCache() {
    if (existsSync(this.cachePath)) {
      try {
        return JSON.parse(readFileSync(this.cachePath, 'utf-8'));
      } catch {
        return {};
      }
    }
    return {};
  }
  
  saveCache() {
    const dir = join(this.root, '.ernest');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.cachePath, JSON.stringify(this.cache, null, 2));
  }
  
  // Alias for saveCache() to fix the error
  save() {
    this.saveCache();
  }
  
  getRouteHash(route) {
    try {
      const content = readFileSync(route.path, 'utf-8');
      return createHash('md5').update(content).digest('hex');
    } catch {
      return null;
    }
  }
  
  hasRouteChanged(route) {
    const currentHash = this.getRouteHash(route);
    if (!currentHash) return true;
    
    const cachedHash = this.cache[route.path];
    
    if (cachedHash !== currentHash) {
      this.cache[route.path] = currentHash;
      return true;
    }
    
    return false;
  }
  
  getChangedRoutes(routes) {
    const changed = routes.filter(route => this.hasRouteChanged(route));
    
    // Save cache after checking all routes
    if (changed.length > 0) {
      this.saveCache();
    }
    
    return changed;
  }
}