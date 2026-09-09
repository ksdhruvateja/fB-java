/**
 * Safe Angular feature-folder restructure.
 * - API services → core/services
 * - Feature UIs → features/*
 * Updates relative imports by rewriting known path segments.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(__dirname, '../frontend/src/app');

function exists(p) {
  return fs.existsSync(p);
}
function walk(dir, acc = []) {
  if (!exists(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}
function copyMerge(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyMerge(s, d);
    else fs.copyFileSync(s, d);
  }
}
function moveDir(fromRel, toRel) {
  const src = path.join(APP, fromRel);
  const dest = path.join(APP, toRel);
  if (!exists(src)) {
    console.log('skip', fromRel);
    return;
  }
  if (path.resolve(src) === path.resolve(dest)) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (exists(dest)) {
    copyMerge(src, dest);
    fs.rmSync(src, { recursive: true, force: true });
  } else {
    fs.renameSync(src, dest);
  }
  console.log(`${fromRel} → ${toRel}`);
}

// 1) API services into core
moveDir('services', 'core/services');

// 2) Features
const featureMoves = [
  ['auth', 'features/auth'],
  ['homeowner', 'features/homeowner'],
  ['contractor', 'features/contractor'],
  ['admin', 'features/admin'],
  ['marketing', 'features/marketing'],
  ['messaging', 'features/messaging'],
  ['notifications', 'features/notifications'],
  ['diy', 'features/fixa/diy'],
  ['ai', 'features/fixa/assessment'],
  ['jobs', 'features/homeowner/requests-jobs'],
  ['properties', 'features/homeowner/properties-extra'],
  ['payments', 'features/homeowner/payments-extra'],
  ['quotes', 'features/homeowner/quotes-extra'],
  ['profile', 'features/homeowner/profile-extra'],
  ['settings', 'features/admin/settings-extra'],
];
for (const [a, b] of featureMoves) moveDir(a, b);

// shared/utilities → shared/utils
if (exists(path.join(APP, 'shared/utilities'))) {
  moveDir('shared/utilities', 'shared/utils');
}

fs.mkdirSync(path.join(APP, 'core/config'), { recursive: true });
fs.mkdirSync(path.join(APP, 'shared/models'), { recursive: true });

// 3) Rewrite imports in all ts/html
const files = walk(APP).filter((f) => /\.(ts|html)$/.test(f));
let n = 0;
for (const file of files) {
  let t = fs.readFileSync(file, 'utf8');
  const o = t;
  const rel = path.relative(APP, file).replace(/\\/g, '/');

  // Root app.routes / app.config style ./X → ./features/X
  if (rel === 'app.routes.ts' || rel === 'app.config.ts' || rel === 'app.component.ts') {
    t = t
      .replace(/from '\.\/marketing\//g, "from './features/marketing/")
      .replace(/from '\.\/auth\//g, "from './features/auth/")
      .replace(/import\('\.\/homeowner\//g, "import('./features/homeowner/")
      .replace(/import\('\.\/contractor\//g, "import('./features/contractor/")
      .replace(/import\('\.\/admin\//g, "import('./features/admin/")
      .replace(/from "\.\/marketing\//g, 'from "./features/marketing/')
      .replace(/from "\.\/auth\//g, 'from "./features/auth/');
  }

  // Generic replacements for relative imports pointing at old top-level feature dirs
  // When a file is under features/, paths to sibling old names need features/ prefix if going up to app then down
  const replacers = [
    // ../services/ → ../core/services/  (or more ../)
    [/((?:\.\.\/)+)services\//g, '$1core/services/'],
    [/((?:\.\.\/)+)shared\/utilities\//g, '$1shared/utils/'],
  ];
  for (const [re, to] of replacers) t = t.replace(re, to);

  // Files under features/* that import ../auth or ../homeowner etc as siblings — now need correct path
  if (rel.startsWith('features/')) {
    // From features/homeowner/x → ../auth was wrong; was homeowner → ../auth; now features/homeowner → ../auth still works for features/auth!
    // features/homeowner/foo importing ../auth/ → features/auth ✓ (one level up from homeowner to features, then auth)
    // Wait: features/homeowner/tabs/x importing ../../auth → goes to app/auth (old). Need ../../../features/auth OR ../../auth if auth is under features
    // From features/homeowner/tabs (depth 3): ../../auth → features/auth ✓
    // From features/homeowner (depth 2): ../auth → features/auth ✓
    // Old from homeowner/tabs: ../../auth → app/auth
    // New from features/homeowner/tabs: ../../auth → features/auth — CORRECT if we use ../../auth
    
    // Old from homeowner/tabs to core: ../../core
    // New from features/homeowner/tabs to core: ../../../core
    t = t.replace(
      /from ['"](\.\.\/){2}core\//g,
      (m) => {
        // if we're 3+ levels deep under features, need 3 ups
        const depth = rel.split('/').length - 1;
        if (depth >= 3) return m.replace('../../core/', '../../../core/');
        return m;
      }
    );
    // More reliable: compute required ups to app root
    const depth = rel.split('/').length - 1;
    const ups = '../'.repeat(depth);
    t = t.replace(/from ['"]((?:\.\.\/)+)core\//g, (full, dots) => {
      const upCount = dots.length / 3;
      if (upCount !== depth) {
        return full.replace(dots + 'core/', ups + 'core/');
      }
      return full;
    });
    t = t.replace(/from ['"]((?:\.\.\/)+)shared\//g, (full, dots) => {
      const upCount = dots.length / 3;
      if (upCount !== depth) {
        return full.replace(dots + 'shared/', ups + 'shared/');
      }
      return full;
    });
    t = t.replace(/from ['"]((?:\.\.\/)+)layouts\//g, (full, dots) => {
      const upCount = dots.length / 3;
      if (upCount !== depth) {
        return full.replace(dots + 'layouts/', ups + 'layouts/');
      }
      return full;
    });
    t = t.replace(/from ['"]((?:\.\.\/)+)services\//g, (full, dots) => {
      return full.replace(dots + 'services/', ups + 'core/services/');
    });
  }

  // Also fix files still at app root depth that referenced ./services
  t = t.replace(/from ['"]\.\/services\//g, "from './core/services/");

  if (t !== o) {
    fs.writeFileSync(file, t);
    n++;
  }
}

console.log('Updated', n, 'files');
console.log('App root:', fs.readdirSync(APP).filter((x) => !x.includes('.')).join(', '));
