import { join } from 'path';
import { existsSync } from 'fs';

export async function generateMainEntry(buildDir, hasRouter, logger) {
  const mainEntry = join(buildDir, 'main.js');
  
  let mainCode = '';
  
  if (hasRouter) {
    // Project uses file-based routing
    mainCode = `import React from 'react';
import { createRoot } from 'react-dom/client';
import { Router, routes } from './router.js';

const container = document.getElementById('root');
const root = createRoot(container);

root.render(React.createElement(Router, { routes }));

// Enable hot module replacement
if (import.meta.hot) {
  import.meta.hot.accept();
}
`;
  } else {
    // Simple React app without routing
    mainCode = `import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';

const container = document.getElementById('root');
const root = createRoot(container);

root.render(React.createElement(App));

// Enable hot module replacement
if (import.meta.hot) {
  import.meta.hot.accept();
}
`;
  }
  
  await Bun.write(mainEntry, mainCode);
  logger.info('Generated main.js entry point');
  
  return mainEntry;
}

// Keep it simple - just React.createElement

export async function generateDevEntry(compiledDir, hasRouter, logger) {
  const devEntry = join(compiledDir, 'main.js');
  
  let devCode = '';
  
  if (hasRouter) {
    devCode = `import React from 'react';
import { createRoot } from 'react-dom/client';
import { Router, routes } from './router.js';

const container = document.getElementById('root');
const root = createRoot(container);

root.render(React.createElement(Router, { routes }));
`;
  } else {
    devCode = `import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';

const container = document.getElementById('root');
const root = createRoot(container);

root.render(React.createElement(App));
`;
  }
  
  await Bun.write(devEntry, devCode);
  logger.info('Generated dev main.js');
  
  return devEntry;
}