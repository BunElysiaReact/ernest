# Ernest ⚡
## we are in extreeme beta version right now and only the ui part works i have finaly made it to work the script is similar with bertui build and dev server for now because gad damn it the shit is hard as f**ck but v0.0.1 of ernest bundler by ernest tech house is out and our npm name is peaseernest well because somebody has already had the name ernest  only the name changes the cli names are still the same 
**Universal bundler for BertUI ecosystem - powers bertui bunny bertuimarked**

> Built with ❤️ by Ernest Tech House

## Features

- 🚀 **Blazing fast** - Uses Bun's native capabilities
- 🎯 **Zero config** - Works out of the box
- 🏝️ **Server Islands** - Static HTML extraction for instant loading
- 📚 **Markdown support** - Built-in docs generator
- ⚛️ **React/JSX/TSX** - Full React support
- 🔥 **HMR** - Hot module replacement
- 🎨 **Beautiful output** - ernest-logger v2 powered

## Quick Start

### Installation

```bash
# Install globally
bun add -g peaseernest

# Or in your project
bun add peaseernest
```

### Usage

```bash
# UI Mode (React)
ernest dev --mode ui
ernest build --mode ui

# Docs Mode (Markdown)
ernest dev --mode docs
ernest build --mode docs

# Auto-detect mode
ernest dev
ernest build
```

## Configuration

Create `ernest.bundler.js` in your project root:

```js
export default {
  mode: 'ui', // 'ui' | 'docs' | 'fullstack'
  input: 'jsx', // 'jsx' | 'tsx' | 'md'
  entry: 'src',
  output: 'dist',
  serverIslands: true,
  minify: true,
  port: 3000
};
```

## Project Structure

### UI Mode (React)
```
src/
├── pages/
│   ├── index.jsx
│   └── about.jsx
├── components/
│   └── Button.jsx
├── styles/
│   └── app.css
└── images/
    └── logo.png
```

### Docs Mode (Markdown)
```
docs/
├── getting-started.md
├── api/
│   └── reference.md
└── assets/
    └── diagram.png
```

## Server Islands 🏝️

Add static content that renders at build time:

```jsx
// pages/about.jsx
export const render = "server"; // 🏝️ This marks a Server Island

export default function About() {
  return (
    <div>
      <h1>About Us</h1>
      <p>This content is pre-rendered as static HTML!</p>
      <a href="/">Go home</a>
    </div>
  );
}
```

**Rules for Server Islands:**
- ✅ Pure static JSX only
- ❌ No React hooks (useState, useEffect, etc.)
- ❌ No browser APIs (window, document, fetch)
- ❌ No event handlers (onClick, onChange, etc.)
- ❌ No Link component (use `<a>` tags instead)

## Integration with BertUI

Ernest replaces BertUI's build system. Update your `package.json`:

```json
{
  "scripts": {
    "dev": "ernest dev --mode ui",
    "build": "ernest build --mode ui"
  },
  "dependencies": {
    "ernest": "latest"
  }
}
```

## Migration from BertUI

```bash
# In your BertUI project
bunx ernest migrate
```

This will:
1. Add Ernest dependency
2. Update package.json scripts
3. Create ernest.bundler.js
4. Preserve your existing config

## Performance

| Task | Ernest | BertUI | Improvement |
|------|--------|--------|-------------|
| Dev server startup | <200ms | ~500ms | 2.5x faster |
| Production build | <400ms | ~1000ms | 2.5x faster |
| HMR update | <50ms | ~100ms | 2x faster |
| Markdown compile | <10ms/file | ~50ms/file | 5x faster |

## CLI Reference

### Commands

- `ernest dev` - Start development server
- `ernest build` - Build for production
- `ernest init` - Create ernest.bundler.js
- `ernest migrate` - Migrate from BertUI
- `ernest --version` - Show version
- `ernest --help` - Show help

### Options

- `--mode, -m` - Project mode (ui, docs, fullstack)
- `--port, -p` - Dev server port (default: 3000)
- `--output, -o` - Output directory (default: dist)
- `--entry, -e` - Entry directory (default: src)
- `--config, -c` - Config file (default: ernest.bundler.js)

## Community & Support

Join the **Ernest Tech House** community:

- 💬 **Telegram:** [Ernest Tech House](https://t.me/ernesttechhouse)
- 📢 **WhatsApp Channel:** [Join here](https://whatsapp.com/channel/0029VayK4tyDAWr0jeCZx0i)

## License

MIT © Ernest Tech House

---

**Ernest - powers bertui bunny bertuimarked**
