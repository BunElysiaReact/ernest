// src/utils/meta-extractor.js
export function extractMetaFromSource(sourceCode) {
  const meta = {};
  
  // Extract title from comment or first h1
  const titleMatch = sourceCode.match(/\/\/\s*title:\s*(.+)$/m) || 
                    sourceCode.match(/\/\*\s*title:\s*(.+?)\s*\*\//m);
  if (titleMatch) {
    meta.title = titleMatch[1].trim();
  }
  
  // Extract description
  const descMatch = sourceCode.match(/\/\/\s*description:\s*(.+)$/m) ||
                   sourceCode.match(/\/\*\s*description:\s*(.+?)\s*\*\//m);
  if (descMatch) {
    meta.description = descMatch[1].trim();
  }
  
  // Extract keywords
  const keywordsMatch = sourceCode.match(/\/\/\s*keywords:\s*(.+)$/m) ||
                       sourceCode.match(/\/\*\s*keywords:\s*(.+?)\s*\*\//m);
  if (keywordsMatch) {
    meta.keywords = keywordsMatch[1].trim();
  }
  
  // Extract author
  const authorMatch = sourceCode.match(/\/\/\s*author:\s*(.+)$/m) ||
                     sourceCode.match(/\/\*\s*author:\s*(.+?)\s*\*\//m);
  if (authorMatch) {
    meta.author = authorMatch[1].trim();
  }
  
  // Extract OG image
  const ogImageMatch = sourceCode.match(/\/\/\s*ogImage:\s*(.+)$/m) ||
                      sourceCode.match(/\/\*\s*ogImage:\s*(.+?)\s*\*\//m);
  if (ogImageMatch) {
    meta.ogImage = ogImageMatch[1].trim();
  }
  
  return meta;
}