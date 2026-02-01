# Ernest Testing Checklist 🧪

## Setup
```bash
cd /path/to/ernest
bun link
cd /path/to/test-project
bun link ernest
```

## Test 1: Help & Version
```bash
ernest --help
ernest --version
```
**Expected:** Should show help text and version

---

## Test 2: Init Command
```bash
mkdir test-ernest && cd test-ernest
ernest init
```
**Expected:** Creates `ernest.bundler.js` with default config

---

## Test 3: UI Mode - Build
```bash
# Setup test project
mkdir -p src/pages src/styles
cat > src/pages/index.jsx << 'EOF'
export default function Home() {
  return (
    <div>
      <h1>Home Page</h1>
      <p>Welcome to Ernest!</p>
    </div>
  );
}
EOF

cat > src/pages/about.jsx << 'EOF'
export const render = "server";

export default function About() {
  return (
    <div>
      <h1>About Page</h1>
      <p>This is a Server Island!</p>
    </div>
  );
}
EOF

cat > src/styles/app.css << 'EOF'
body {
  font-family: system-ui;
  padding: 2rem;
}
h1 { color: #667eea; }
EOF

# Build
ernest build --mode ui
```

**Expected:**
- ✅ Compiles 2 routes
- ✅ Detects 1 Server Island (`/about`)
- ✅ Minifies CSS
- ✅ Bundles JavaScript
- ✅ Generates HTML for both routes
- ✅ Creates `dist/sitemap.xml` and `dist/robots.txt`
- ✅ Shows build summary

**Check dist/ folder:**
```bash
ls -la dist/
ls -la dist/about/
cat dist/index.html
cat dist/about/index.html  # Should have pre-rendered HTML
```

---

## Test 4: UI Mode - Dev Server
```bash
ernest dev --mode ui
```

**Expected:**
- ✅ Starts server on port 3000
- ✅ Shows compilation success
- ✅ HMR WebSocket at ws://localhost:3000/__hmr
- ✅ Watch mode enabled

**Browser tests:**
- Open http://localhost:3000
- Check home page renders
- Navigate to /about
- Edit `src/pages/index.jsx` and save
- Browser should auto-reload

---

## Test 5: Serve Command
```bash
# After building
ernest serve
```

**Expected:**
- ✅ Starts on port 8080
- ✅ Serves files from dist/
- ✅ Routes work (http://localhost:8080, http://localhost:8080/about)
- ✅ 404 page shows for invalid routes

**Browser tests:**
- http://localhost:8080 → Home page
- http://localhost:8080/about → About page (instant load!)
- http://localhost:8080/nonexistent → Beautiful 404

---

## Test 6: Custom Port
```bash
ernest dev --port 5000
ernest serve --port 9000
```

**Expected:**
- ✅ Dev server on port 5000
- ✅ Static server on port 9000

---

## Test 7: Dynamic Routes
```bash
mkdir -p src/pages/blog
cat > src/pages/blog/[slug].jsx << 'EOF'
export default function BlogPost({ params }) {
  return (
    <div>
      <h1>Blog Post: {params.slug}</h1>
      <p>Dynamic route!</p>
    </div>
  );
}
EOF

ernest build --mode ui
```

**Expected:**
- ✅ Detects dynamic route `/blog/[slug]`
- ✅ Builds successfully
- ✅ Router handles dynamic params

---

## Test 8: Server Island Validation
```bash
cat > src/pages/invalid-island.jsx << 'EOF'
export const render = "server";
import { useState } from 'react';

export default function Invalid() {
  const [count, setCount] = useState(0);
  
  return (
    <div>
      <button onClick={() => setCount(count + 1)}>
        Count: {count}
      </button>
    </div>
  );
}
EOF

ernest build --mode ui
```

**Expected:**
- ⚠️ Should warn about React hooks in Server Island
- ❌ Should fail to extract static HTML
- ✅ Fallback to client-only rendering

---

## Test 9: CSS Processing
```bash
cat > src/styles/test.css << 'EOF'
.container {
  padding: 2rem;
  
  .nested {
    color: red;
  }
}
EOF

ernest build --mode ui
```

**Expected:**
- ✅ CSS nesting processed
- ✅ Minified output in `dist/styles/bertui.min.css`
- ✅ Shows size reduction stats

---

## Test 10: Multiple Pages
```bash
# Add more pages
cat > src/pages/contact.jsx << 'EOF'
export default function Contact() {
  return <div><h1>Contact</h1></div>;
}
EOF

cat > src/pages/services.jsx << 'EOF'
export default function Services() {
  return <div><h1>Services</h1></div>;
}
EOF

ernest build --mode ui
```

**Expected:**
- ✅ Builds all 5 routes
- ✅ Sitemap contains all static routes
- ✅ Each route has its own HTML file

---

## Test 11: Config File
```bash
cat > ernest.bundler.js << 'EOF'
export default {
  mode: 'ui',
  output: 'build',
  port: 4000,
  minify: true,
  baseUrl: 'https://example.com',
  meta: {
    title: 'My Ernest App',
    description: 'Built with Ernest'
  }
};
EOF

ernest build --mode ui
ernest dev --mode ui
```

**Expected:**
- ✅ Uses `build/` instead of `dist/`
- ✅ Dev server on port 4000
- ✅ Sitemap uses https://example.com
- ✅ HTML has custom meta tags

---

## Test 12: Hot Module Replacement
```bash
ernest dev --mode ui
# Open browser to http://localhost:3000
# Edit src/pages/index.jsx and save
```

**Expected:**
- ✅ Browser console shows "Recompiling..."
- ✅ Page auto-reloads
- ✅ Changes appear immediately

---

## Test 13: Error Handling
```bash
# Invalid JSX syntax
cat > src/pages/broken.jsx << 'EOF'
export default function Broken() {
  return (
    <div>
      <h1>Unclosed div
    </div>
  );
}
EOF

ernest build --mode ui
```

**Expected:**
- ❌ Shows syntax error
- ❌ Identifies file and line number
- ❌ Build fails gracefully

---

## Test 14: Clean Build
```bash
rm -rf dist/
rm -rf .ernestbuild/
ernest build --mode ui
```

**Expected:**
- ✅ Creates fresh `dist/` folder
- ✅ No leftover files from previous builds
- ✅ Build completes successfully

---

## Test 15: Sitemap & Robots.txt
```bash
ernest build --mode ui
cat dist/sitemap.xml
cat dist/robots.txt
```

**Expected:**
- ✅ sitemap.xml contains all static routes
- ✅ Uses baseUrl from config
- ✅ robots.txt references sitemap
- ✅ Current date in lastmod

---

## Test 16: Server Island HTML Extraction
```bash
cat dist/about/index.html | grep "<h1>About Page</h1>"
```

**Expected:**
- ✅ Static HTML present in file
- ✅ No loading state needed
- ✅ Instant content on page load

---

## Performance Benchmarks
```bash
time ernest build --mode ui
```

**Expected:**
- ✅ Build time < 100ms for small projects
- ✅ Dev server startup < 200ms

---

## Final Checklist

### Core Commands
- [ ] `ernest --help` works
- [ ] `ernest --version` works
- [ ] `ernest init` creates config
- [ ] `ernest build --mode ui` builds successfully
- [ ] `ernest dev --mode ui` starts dev server
- [ ] `ernest serve` serves built files

### Features
- [ ] Server Islands detected and rendered
- [ ] CSS minification works
- [ ] JavaScript bundling succeeds
- [ ] Sitemap generated
- [ ] robots.txt generated
- [ ] Dynamic routes work
- [ ] HMR works
- [ ] Custom ports work

### Error Handling
- [ ] Invalid syntax shows errors
- [ ] Missing files handled gracefully
- [ ] Server Island validation works

### Output Quality
- [ ] HTML is valid
- [ ] CSS is minified
- [ ] JavaScript is bundled
- [ ] File sizes are reasonable
- [ ] No console errors in browser

---

## Stress Test
```bash
# Create 50 pages
for i in {1..50}; do
  cat > src/pages/page-$i.jsx << EOF
export default function Page$i() {
  return <div><h1>Page $i</h1></div>;
}
EOF
done

time ernest build --mode ui
```

**Expected:**
- ✅ Handles 50+ pages
- ✅ Build time still reasonable
- ✅ All pages in sitemap

---

## Report Results
Document any failures with:
- Command used
- Error message
- Expected vs actual behavior
- Console output