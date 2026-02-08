// src/utils/env.js
import { join } from 'path';
import { existsSync } from 'fs';

export function loadEnvVariables(root) {
  const env = {};
  const envFiles = [
    join(root, '.env.local'),
    join(root, '.env.development'),
    join(root, '.env.production'),
    join(root, '.env')
  ];
  
  for (const envFile of envFiles) {
    if (existsSync(envFile)) {
      try {
        const content = Bun.file(envFile).text();
        const lines = content.split('\n');
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const equalsIndex = trimmed.indexOf('=');
            if (equalsIndex !== -1) {
              const key = trimmed.substring(0, equalsIndex).trim();
              const value = trimmed.substring(equalsIndex + 1).trim();
              env[key] = value;
            }
          }
        }
      } catch (error) {
        // Ignore errors reading env files
      }
    }
  }
  
  // Add process.env variables (but don't override file ones)
  for (const key in process.env) {
    if (!(key in env)) {
      env[key] = process.env[key];
    }
  }
  
  return env;
}

export function replaceEnvInCode(code, envVars) {
  let result = code;
  
  // Replace process.env.VAR_NAME
  for (const [key, value] of Object.entries(envVars)) {
    const regex = new RegExp(`process\\.env\\.${key}\\b`, 'g');
    result = result.replace(regex, JSON.stringify(value));
  }
  
  // Replace import.meta.env.VAR_NAME (Vite style)
  for (const [key, value] of Object.entries(envVars)) {
    const regex = new RegExp(`import\\.meta\\.env\\.${key}\\b`, 'g');
    result = result.replace(regex, JSON.stringify(value));
  }
  
  return result;
}

export function generateEnvCode(envVars) {
  const assignments = Object.entries(envVars)
    .map(([key, value]) => `process.env.${key} = ${JSON.stringify(value)};`)
    .join('\n');
  
  return `// Auto-generated environment variables
${assignments}

// Make env variables available globally
if (typeof window !== 'undefined') {
  window.process = window.process || {};
  window.process.env = window.process.env || {};
  ${Object.entries(envVars)
    .map(([key, value]) => `window.process.env.${key} = ${JSON.stringify(value)};`)
    .join('\n  ')}
}
`;
}