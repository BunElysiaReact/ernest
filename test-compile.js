// test-ernest.js
import { BertuiDeps } from './src/utils/bertui-deps.js';

const logger = {
  debug: console.log,
  warn: console.warn,
  info: console.log
};

console.log('🧪 Testing Ernest BertUI dependency scanner...\n');

const deps = new BertuiDeps(process.cwd(), logger);
const result = deps.scan();

console.log('📦 Import Map Generated:');
console.log(JSON.stringify(result.importMap, null, 2));

console.log('\n🎯 Key check:');
console.log('- bertui/router mapped:', '"bertui/router"' in result.importMap ? '✅ YES' : '❌ NO');
if ('bertui/router' in result.importMap) {
  console.log('  Value:', result.importMap['bertui/router']);
}

console.log('\n🎨 Stylesheets:');
result.stylesheets.forEach(s => console.log('  -', s));

console.log('\n✅ If bertui/router is mapped, Ernest should work!');