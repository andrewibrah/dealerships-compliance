/**
 * Static frontend build for GitHub Pages.
 * Runs Vite and outputs to dist/public/.
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

console.log('[1/1] Building frontend...');
execSync(path.join(root, 'node_modules', '.bin', 'vite') + ' build', {
  stdio: 'inherit',
  cwd: root,
});

console.log('\nBuild complete → dist/public/ ✓');
