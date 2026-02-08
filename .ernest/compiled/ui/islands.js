// src/ui/islands.js
export class ServerIslandProcessor {
  constructor(logger) {
    this.logger = logger;
  }
  
  async extractStaticHTML(sourceCode, filePath) {
    try {
      // Check for Server Island marker
      if (!sourceCode.includes('export const render = "server"')) {
        return null;
      }
      
      // Validate no React hooks
      const hookPatterns = [
        'useState', 'useEffect', 'useContext', 'useReducer',
        'useCallback', 'useMemo', 'useRef', 'useImperativeHandle',
        'useLayoutEffect', 'useDebugValue'
      ];
      
      for (const hook of hookPatterns) {
        const regex = new RegExp(`\\b${hook}\\s*\\(`, 'g');
        if (regex.test(sourceCode)) {
          this.logger.error(`❌ Server Island at ${filePath} contains React hooks!`);
          this.logger.error(`   Server Islands must be pure HTML - no ${hook}, etc.`);
          return null;
        }
      }
      
      // Check for router imports (can't use Link in Server Islands)
      if (sourceCode.includes('from \'bertui/router\'') || 
          sourceCode.includes('from "bertui/router"')) {
        this.logger.error(`❌ Server Island imports from 'bertui/router'!`);
        this.logger.error(`   Server Islands cannot use Link - use <a> tags instead.`);
        return null;
      }
      
      // Extract JSX return statement
      const returnMatch = sourceCode.match(/return\s*\(([\s\S]*?)\);?\s*}/);
      if (!returnMatch) {
        this.logger.warn(`⚠️  Could not extract JSX from ${filePath}`);
        return null;
      }
      
      let html = returnMatch[1].trim();
      
      // Remove comments
      html = html.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
      
      // Convert React attributes to HTML
      html = html.replace(/className=/g, 'class=');
      
      // Convert style objects to strings
      html = html.replace(/style=\{\{([^}]+)\}\}/g, (match, styleObj) => {
        const props = [];
        let currentProp = '';
        let depth = 0;
        
        for (let i = 0; i < styleObj.length; i++) {
          const char = styleObj[i];
          if (char === '(') depth++;
          if (char === ')') depth--;
          
          if (char === ',' && depth === 0) {
            props.push(currentProp.trim());
            currentProp = '';
          } else {
            currentProp += char;
          }
        }
        if (currentProp.trim()) props.push(currentProp.trim());
        
        const cssString = props
          .map(prop => {
            const colonIndex = prop.indexOf(':');
            if (colonIndex === -1) return '';
            
            const key = prop.substring(0, colonIndex).trim();
            const value = prop.substring(colonIndex + 1).trim();
            
            if (!key || !value) return '';
            
            const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
            const cssValue = value.replace(/['"]/g, '');
            
            return `${cssKey}: ${cssValue}`;
          })
          .filter(Boolean)
          .join('; ');
        
        return `style="${cssString}"`;
      });
      
      // Handle void elements
      const voidElements = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 
                            'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'];
      
      html = html.replace(/<(\w+)([^>]*)\s*\/>/g, (match, tag, attrs) => {
        if (voidElements.includes(tag.toLowerCase())) {
          return match;
        } else {
          return `<${tag}${attrs}></${tag}>`;
        }
      });
      
      // Extract simple expressions
      html = html.replace(/\{`([^`]*)`\}/g, '$1');
      html = html.replace(/\{(['"])(.*?)\1\}/g, '$2');
      html = html.replace(/\{(\d+)\}/g, '$1');
      
      this.logger.info(`Extracted ${html.length} chars of static HTML`);
      return html;
      
    } catch (error) {
      this.logger.error(`Failed to extract HTML: ${error.message}`);
      return null;
    }
  }
  
  validateServerIsland(sourceCode, filePath) {
    const errors = [];
    
    // Check event handlers
    const eventHandlers = [
      'onClick=', 'onChange=', 'onSubmit=', 'onInput=', 'onFocus=',
      'onBlur=', 'onMouseEnter=', 'onMouseLeave=', 'onKeyDown=',
      'onKeyUp=', 'onScroll='
    ];
    
    for (const handler of eventHandlers) {
      if (sourceCode.includes(handler)) {
        errors.push(`❌ Uses event handler: ${handler.replace('=', '')}`);
      }
    }
    
    // Check for browser APIs
    const browserAPIs = [
      'window.', 'document.', 'localStorage.', 'sessionStorage.',
      'navigator.', 'location.', 'history.', 'fetch', 'addEventListener'
    ];
    
    for (const api of browserAPIs) {
      if (sourceCode.includes(api)) {
        errors.push(`❌ Uses browser API: ${api}`);
      }
    }
    
    return errors;
  }
}