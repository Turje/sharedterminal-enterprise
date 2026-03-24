#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const clientDir = path.join(__dirname, '..', 'src', 'client');
const jsDir = path.join(clientDir, 'js');

// Clean old hashed bundles
for (const f of fs.readdirSync(jsDir)) {
  if (f.startsWith('main-') && f.endsWith('.js')) fs.unlinkSync(path.join(jsDir, f));
}

// Build with esbuild
execSync(
  `npx esbuild src/client/js/main.ts --bundle --outdir=src/client/js --entry-names=[name]-[hash] --platform=browser --format=iife`,
  { stdio: 'inherit', cwd: path.join(__dirname, '..') }
);

// Find the generated main-[hash].js
const bundleFile = fs.readdirSync(jsDir).find(f => f.startsWith('main-') && f.endsWith('.js'));
if (!bundleFile) {
  console.error('ERROR: No main-*.js found after esbuild');
  process.exit(1);
}
console.log(`Generated: ${bundleFile}`);

// Update index.html to reference the hashed bundle
const htmlPath = path.join(clientDir, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');
html = html.replace(/js\/(?:bundle|main)[^"]*\.js/, `js/${bundleFile}`);
fs.writeFileSync(htmlPath, html);

// Also add cache-bust param to CSS references
const cssHash = crypto.createHash('md5')
  .update(fs.readFileSync(path.join(clientDir, 'css', 'terminal.css')))
  .update(fs.readFileSync(path.join(clientDir, 'css', 'xterm.css')))
  .digest('hex').slice(0, 8);

html = fs.readFileSync(htmlPath, 'utf8');
html = html.replace(/href="css\/xterm\.css[^"]*"/, `href="css/xterm.css?v=${cssHash}"`);
html = html.replace(/href="css\/terminal\.css[^"]*"/, `href="css/terminal.css?v=${cssHash}"`);
fs.writeFileSync(htmlPath, html);

console.log(`CSS cache-bust: ?v=${cssHash}`);
