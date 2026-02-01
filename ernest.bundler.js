// ernest.bundler.js - Default configuration
export default {
  // Project type
  mode: 'ui', // 'ui' | 'docs' | 'fullstack'
  
  // Auto-detected if not specified
  input: 'jsx',    // 'jsx' | 'tsx' | 'md'
  entry: 'src',    // Source directory
  output: 'dist',  // Output directory
  
  // UI Mode options
  serverIslands: true,   // Auto-detect Server Islands
  minify: true,          // Minify JS/CSS in production
  sourcemap: true,       // Generate source maps
  splitting: true,       // Code splitting
  
  // Docs Mode options
  template: 'default',   // Template name or path
  navigation: true,      // Auto-generate sidebar
  baseUrl: '',           // For GitHub Pages deployment
  
  // Dev server
  port: 3000,            // Development server port
  open: false,           // Open browser on start
  
  // Advanced
  alias: {},             // Import aliases
  define: {},            // Global defines
  external: [],          // External dependencies
  
  // Build optimizations
  target: 'browser',     // browser | node
  format: 'esm',         // esm | cjs | iife
  
  // CSS handling
  css: {
    minify: true,
    nesting: true,       // Enable CSS nesting
    targets: {
      chrome: 90,
      firefox: 88,
      safari: 14,
      edge: 90
    }
  }
};