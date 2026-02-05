// src/components/router.js - FIXED VERSION
import { join } from 'path';

export async function generateRouter(routes, buildDir, logger) {
  const imports = routes.map((route, i) => {
    const componentName = `Page${i}`;
    const importPath = `./pages/${route.file.replace(/\.(jsx|tsx|ts)$/, '.js')}`;
    return `import ${componentName} from '${importPath}';`;
  }).join('\n');
  
  const routeConfigs = routes.map((route, i) => {
    const componentName = `Page${i}`;
    return `  { path: '${route.route}', component: ${componentName}, type: '${route.type}' }`;
  }).join(',\n');
  
  // ✅ FIX: Use React.createElement instead of JSX
  const routerCode = `import React, { useState, useEffect, createContext, useContext } from 'react';

const RouterContext = createContext(null);

export function useRouter() {
  const context = useContext(RouterContext);
  
  // During SSR (when window doesn't exist), return a mock router
  if (typeof window === 'undefined') {
    return {
      pathname: '/',
      params: {},
      navigate: () => {},
      currentRoute: null,
      isSSR: true
    };
  }
  
  if (!context) {
    throw new Error('useRouter must be used within a Router component');
  }
  
  return context;
}

export function Router({ routes }) {
  const [currentRoute, setCurrentRoute] = useState(null);
  const [params, setParams] = useState({});

  useEffect(() => {
    matchAndSetRoute(window.location.pathname);

    const handlePopState = () => {
      matchAndSetRoute(window.location.pathname);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [routes]);

  function matchAndSetRoute(pathname) {
    // Try static routes first
    for (const route of routes) {
      if (route.type === 'static' && route.path === pathname) {
        setCurrentRoute(route);
        setParams({});
        return;
      }
    }

    // Try dynamic routes
    for (const route of routes) {
      if (route.type === 'dynamic') {
        const pattern = route.path.replace(/\\[([^\\]]+)\\]/g, '([^/]+)');
        const regex = new RegExp('^' + pattern + '$');
        const match = pathname.match(regex);

        if (match) {
          const paramNames = [...route.path.matchAll(/\\[([^\\]]+)\\]/g)].map(m => m[1]);
          const extractedParams = {};
          paramNames.forEach((name, i) => {
            extractedParams[name] = match[i + 1];
          });

          setCurrentRoute(route);
          setParams(extractedParams);
          return;
        }
      }
    }

    // No match found
    setCurrentRoute(null);
    setParams({});
  }

  function navigate(path) {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', path);
      matchAndSetRoute(path);
    }
  }

  const routerValue = {
    currentRoute,
    params,
    navigate,
    pathname: typeof window !== 'undefined' ? window.location.pathname : '/',
    isSSR: typeof window === 'undefined'
  };

  const Component = currentRoute?.component;

  return React.createElement(
    RouterContext.Provider,
    { value: routerValue },
    Component ? React.createElement(Component, { params }) : React.createElement(NotFound)
  );
}

export function Link({ to, children, ...props }) {
  let router;
  try {
    router = useRouter();
  } catch (e) {
    router = null;
  }

  function handleClick(e) {
    if (typeof window === 'undefined') return;
    
    if (!router || !router.navigate) return;
    
    e.preventDefault();
    router.navigate(to);
  }

  return React.createElement('a', {
    href: to,
    onClick: handleClick,
    ...props
  }, children);
}

function NotFound() {
  return React.createElement('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      fontFamily: 'system-ui'
    }
  },
    React.createElement('h1', { style: { fontSize: '6rem', margin: 0 } }, '404'),
    React.createElement('p', { style: { fontSize: '1.5rem', color: '#666' } }, 'Page not found'),
    React.createElement('a', {
      href: '/',
      style: { color: '#10b981', textDecoration: 'none', fontSize: '1.2rem' }
    }, 'Go home')
  );
}

${imports}

export const routes = [
${routeConfigs}
];`;
  
  await Bun.write(join(buildDir, 'router.js'), routerCode);
  
  // Safe logging
  if (logger && typeof logger.info === 'function') {
    logger.info(`Generated router with ${routes.length} routes`);
  } else if (logger && typeof logger.log === 'function') {
    logger.log(`Generated router with ${routes.length} routes`);
  } else {
    console.log(`Generated router with ${routes.length} routes`);
  }
}