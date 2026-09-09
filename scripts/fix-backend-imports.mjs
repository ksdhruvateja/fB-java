/**
 * After domain move, add missing imports for FixBridge types that used to share a package.
 * Run: node scripts/fix-backend-imports.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../backend/src');

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (ent.name.endsWith('.java')) acc.push(p);
  }
  return acc;
}

function pkgOf(file) {
  const text = fs.readFileSync(file, 'utf8');
  const m = text.match(/^package\s+([\w.]+);/m);
  return m ? m[1] : null;
}

function main() {
  const files = [...walk(path.join(ROOT, 'main/java')), ...walk(path.join(ROOT, 'test/java'))];
  const nameToFqn = new Map();
  for (const f of files) {
    const name = path.basename(f, '.java');
    const pkg = pkgOf(f);
    if (pkg) nameToFqn.set(name, `${pkg}.${name}`);
  }

  const javaKeywords = new Set([
    'String', 'Integer', 'Long', 'Boolean', 'Object', 'Class', 'Override', 'Deprecated',
    'List', 'Map', 'Set', 'Optional', 'ArrayList', 'HashMap', 'Collections', 'Objects',
    'BigDecimal', 'LocalDate', 'LocalDateTime', 'Instant', 'UUID', 'OffsetDateTime',
  ]);

  let fixed = 0;
  for (const f of files) {
    let text = fs.readFileSync(f, 'utf8');
    const pkg = pkgOf(f);
    const self = path.basename(f, '.java');
    const existing = new Set();
    for (const m of text.matchAll(/import\s+(?:static\s+)?([\w.]+)\s*;/g)) {
      const fqn = m[1];
      existing.add(fqn);
      const simple = fqn.split('.').pop();
      existing.add(simple);
    }

    const needed = new Set();
    // Match PascalCase identifiers that are known classes
    for (const [name, fqn] of nameToFqn) {
      if (name === self) continue;
      if (javaKeywords.has(name)) continue;
      const targetPkg = fqn.slice(0, fqn.lastIndexOf('.'));
      if (targetPkg === pkg) continue; // same package
      if (existing.has(fqn) || existing.has(name)) continue;
      // word-boundary use of the class name
      const re = new RegExp(`\\b${name}\\b`);
      if (re.test(text)) needed.add(fqn);
    }

    if (needed.size === 0) continue;

    const importBlock = [...needed].sort().map((fqn) => `import ${fqn};`).join('\n');
    // Insert after package and existing imports
    const pkgMatch = text.match(/^package\s+[\w.]+;\s*/m);
    if (!pkgMatch) continue;
    let insertAt = pkgMatch.index + pkgMatch[0].length;
    // find end of import section
    const afterPkg = text.slice(insertAt);
    const importMatches = [...afterPkg.matchAll(/^import\s+.+;\s*\n/gm)];
    if (importMatches.length) {
      const last = importMatches[importMatches.length - 1];
      insertAt = insertAt + last.index + last[0].length;
      text = text.slice(0, insertAt) + importBlock + '\n' + text.slice(insertAt);
    } else {
      text = text.slice(0, insertAt) + '\n' + importBlock + '\n' + text.slice(insertAt);
    }
    fs.writeFileSync(f, text);
    fixed++;
  }
  console.log(`Updated imports in ${fixed} files. Known types: ${nameToFqn.size}`);
}

main();
