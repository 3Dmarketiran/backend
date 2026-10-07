import fs from 'node:fs';
import path from 'node:path';

const srcDir = path.resolve('src');
const offenders = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) {
      const text = fs.readFileSync(full, 'utf8');
      if (/\$transaction\s*\(\s*async\s*\(/.test(text)) offenders.push(path.relative(process.cwd(), full));
    }
  }
}

walk(srcDir);
if (offenders.length) {
  console.error('Interactive Prisma transactions are incompatible with Cloudflare D1:', offenders);
  process.exit(1);
}
console.log('D1 transaction compatibility check passed: no interactive Prisma transactions found.');
