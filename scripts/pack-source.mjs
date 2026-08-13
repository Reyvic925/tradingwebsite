import { mkdirSync, writeFileSync, rmSync, existsSync, cpSync, createWriteStream, statSync } from 'fs';
import { join, relative } from 'path';
import { readdirSync } from 'fs';
import { spawnSync } from 'child_process';

const root = process.cwd();
const staging = join(root, '.pack-staging');
const outDir = join(root, 'public', 'downloads');
const zipPath = join(outDir, 'apex-prime-broker.zip');

const files = [
  'api',
  'src',
  'public',
  '.github',
  'scripts',
  'package.json',
  'package-lock.json',
  'index.html',
  'vite.config.ts',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'eslint.config.js',
  'README.md',
  'LICENSE',
  'CONTRIBUTING.md',
  'PUSH.md',
  'schema.sql',
  '.env.example',
  '.gitignore',
  '.editorconfig',
  '.gitattributes',
];

function walk(dir, acc = []) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });
mkdirSync(outDir, { recursive: true });

for (const item of files) {
  const from = join(root, item);
  if (!existsSync(from)) continue;
  cpSync(from, join(staging, item), {
    recursive: true,
    filter: (src) => !src.includes(`${join('public', 'downloads')}`),
  });
}

writeFileSync(
  join(staging, 'vercel.json'),
  `${JSON.stringify(
    {
      rewrites: [
        {
          source: '/((?!api/|videos/|images/|logos/|downloads/|favicon.svg|assets/).*)',
          destination: '/index.html',
        },
      ],
    },
    null,
    2
  )}\n`
);

writeFileSync(
  join(staging, 'README.FIRST.txt'),
  `Apex Prime Broker — FULL WEBSITE source

This archive is the complete product:
- Cinematic landing (video hero, ticker, partners, plans, testimonials)
- Authenticated terminal (trade, wallet, investments, social, KYC)
- Global markets: USA, Japan, Canada, UK, Europe, Germany, France, India
- API routes, schema.sql, logos, videos

1. unzip apex-prime-broker.zip
2. npm install
3. cp .env.example .env
4. Run schema.sql in the Supabase SQL editor
5. npm run dev

Push to GitHub: see PUSH.md
Never commit .env
`
);

rmSync(zipPath, { force: true });

const py = `
import zipfile, os
root = r'''${staging}'''
out = r'''${zipPath}'''
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for dirpath, _, filenames in os.walk(root):
        for name in filenames:
            full = os.path.join(dirpath, name)
            arc = os.path.relpath(full, root)
            z.write(full, arc)
print('ok', os.path.getsize(out))
`;

const result = spawnSync('python3', ['-c', py], { encoding: 'utf8' });
if (result.status !== 0) {
  console.error(result.stdout);
  console.error(result.stderr);
  process.exit(1);
}

rmSync(staging, { recursive: true, force: true });
const mb = (statSync(zipPath).size / 1024 / 1024).toFixed(1);
console.log(`Wrote ${zipPath} (${mb} MB)`);
