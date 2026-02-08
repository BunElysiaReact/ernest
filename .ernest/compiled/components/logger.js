import { createLogger as createErnestLogger } from 'ernest-logger';

export function createLogger(config = {}) {
  const logger = createErnestLogger({
    time: true,
    emoji: true,
    level: config.level || 'info',
    prefix: '[ERNEST]',
    customLevels: {
      build: { color: 'brightCyan', emoji: '📦', priority: 2 },
      route: { color: 'brightMagenta', emoji: '🛣️', priority: 2 },
      asset: { color: 'brightYellow', emoji: '🖼️', priority: 2 },
      island: { color: 'brightGreen', emoji: '🏝️', priority: 2 },
      hmr: { color: 'brightBlue', emoji: '⚡', priority: 2 }
    },
    ...config
  });
  
  // Add Ernest-specific methods
  logger.banner = function() {
    this.bigLog('⚡ ERNEST by Ernest Tech House', { color: 'brightCyan' });
    this.info('🔧 powers: bertui • bunny • bertuimarked');
  };
  
  logger.progress = function(current, total, message = '') {
    const percent = Math.round((current / total) * 100);
    const filled = Math.round(percent / 10);
    const empty = 10 - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    
    // FIX: Use this.info() instead of this.log()
    this.info(`[${bar}] ${percent}% ${message}`);
  };
  
  logger.buildStats = function(stats) {
    this.success(`✨ Build complete: ${stats.duration}ms`);
    this.info(`📊 Stats: ${stats.files} files • ${stats.size} • ${stats.islands || 0} Server Islands`);
    if (stats.url) this.info(`🚀 Ready: ${stats.url}`);
  };
  
  // Ensure custom level methods exist
  const customMethods = ['build', 'route', 'asset', 'island', 'hmr'];
  customMethods.forEach(method => {
    if (!logger[method]) {
      logger[method] = function(message) {
        this.log({ level: method, message });
      };
    }
  });
  
  return logger;
}