// src/components/error-handler.js
export class ErrorHandler {
  constructor(logger) {
    this.logger = logger;
  }
  
  handleBuildError(error, filePath = null) {
    this.logger.error(`❌ Build failed: ${error.message}`);
    
    if (error.stack) {
      // Parse stack trace for better error messages
      const stackLines = error.stack.split('\n');
      const relevantLines = stackLines.slice(0, 3).join('\n');
      this.logger.debug(relevantLines);
    }
    
    if (filePath) {
      this.logger.info(`   File: ${filePath}`);
      
      // Try to read file and show context
      try {
        const content = Bun.file(filePath).text();
        const lines = content.split('\n');
        
        // Find line with error (simplified)
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes('error') || lines[i].includes('Error')) {
            this.logger.info(`   Line ${i + 1}: ${lines[i].trim()}`);
            break;
          }
        }
      } catch (e) {
        // Ignore file read errors
      }
    }
    
    process.exit(1);
  }
  
  handleSyntaxError(error, filePath, code) {
    this.logger.error(`❌ Syntax error in ${filePath}`);
    
    if (error.loc) {
      const { line, column } = error.loc;
      const lines = code.split('\n');
      
      this.logger.info(`   Line ${line}, Column ${column}`);
      
      // Show context
      const start = Math.max(0, line - 3);
      const end = Math.min(lines.length, line + 2);
      
      for (let i = start; i < end; i++) {
        const lineNum = i + 1;
        const prefix = lineNum === line ? '❌' : '  ';
        const lineContent = lines[i];
        
        if (lineNum === line) {
          // Highlight the error column
          const before = lineContent.substring(0, column - 1);
          const atError = lineContent.substring(column - 1, column);
          const after = lineContent.substring(column);
          this.logger.info(`${prefix} ${lineNum} | ${before}${this.logger.colors.red(atError)}${after}`);
        } else {
          this.logger.info(`${prefix} ${lineNum} | ${lineContent}`);
        }
      }
      
      this.logger.info(`\n💡 ${error.message}`);
    }
    
    process.exit(1);
  }
  
  handleMissingImport(importName, filePath, suggestions = []) {
    this.logger.error(`❌ Cannot find module '${importName}' in ${filePath}`);
    
    if (suggestions.length > 0) {
      this.logger.info('\n💡 Did you mean:');
      suggestions.forEach(suggestion => {
        this.logger.info(`   • ${suggestion}`);
      });
    }
    
    this.logger.info(`\n🔧 Try: bun add ${importName}`);
    
    process.exit(1);
  }
  
  handleServerIslandValidation(errors, filePath) {
    this.logger.error(`❌ Server Island validation failed: ${filePath}`);
    this.logger.info('\nViolations:');
    errors.forEach(error => this.logger.info(`  ${error}`));
    
    this.logger.info('\n📖 Server Island Rules:');
    this.logger.info('  ✅ Pure static JSX only');
    this.logger.info('  ❌ No React hooks (useState, useEffect, etc.)');
    this.logger.info('  ❌ No Link component (use <a> tags)');
    this.logger.info('  ❌ No browser APIs (window, document, fetch)');
    this.logger.info('  ❌ No event handlers (onClick, onChange, etc.)');
    
    this.logger.info('\n💡 Tip: Remove "export const render = \\"server\\"" if you need these features.');
    
    process.exit(1);
  }
}