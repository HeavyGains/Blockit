// Cache-buster: raises the ?v=N on every CSS/JS link in index.html and on the
// imports between js/*.js files, so a phone never mixes a new page with old
// code after a merge. Run before each PR: npm run bump
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const files = ['index.html', ...readdirSync('js').filter(f => f.endsWith('.js')).map(f => `js/${f}`)];
const texts = files.map(f => readFileSync(f, 'utf8'));
const current = Math.max(0, ...texts.flatMap(t => [...t.matchAll(/\?v=(\d+)/g)].map(m => Number(m[1]))));
const next = current + 1;
files.forEach((f, i) => {
  const out = texts[i]
    .replace(/((?:href|src)="(?:css|js)\/[\w.-]+\.(?:css|js))(?:\?v=\d+)?"/g, `$1?v=${next}"`)
    .replace(/(from '\.\/[\w.-]+\.js)(?:\?v=\d+)?'/g, `$1?v=${next}'`);
  if (out !== texts[i]) writeFileSync(f, out);
});
console.log(`version ${next}`);
