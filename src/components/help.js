// src/components/help.js
export function showHelp() {
  console.log(`
⚡ ERNEST by Ernest Tech House
🔧 powers: bertui • bunny • bertuimarked

Usage:
  ernest <command> [options]

Commands:
  dev                    Start development server
  build                  Build for production
  init                   Create ernest.bundler.js
  migrate                Migrate from old BertUI
  --version, -v         Show version
  --help, -h            Show this help

Options:
  --mode, -m <mode>     Project mode (ui, docs, fullstack)
  --port, -p <port>     Dev server port (default: 3000)
  --output, -o <dir>    Output directory (default: dist)
  --entry, -e <dir>     Entry directory (default: src)
  --config, -c <file>   Config file (default: ernest.bundler.js)

Examples:
  ernest dev --mode ui
  ernest build --mode docs
  ernest init
  ernest migrate

Documentation: https://ernest.ernest-tech.house
`);
}

export function showVersion() {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'));
  console.log(`Ernest v${pkg.version}`);
}