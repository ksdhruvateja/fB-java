/**
 * One-off: remove black background from FixBridge logo and export web assets.
 */
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');

const SOURCE =
  process.argv[2] ||
  path.join(
    root,
    'assets',
    'brand',
    'fixbridge-logo-source.png'
  );

async function removeNearBlackBackground(inputPath, outputPath, { threshold = 32, soften = 72 } = {}) {
  const { data, info } = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const spread = max - min;
    // Matte / textured black studio background
    if (max <= threshold && spread < 18) {
      data[i + 3] = 0;
      continue;
    }
    if (max <= soften && spread < 28) {
      const t = (max - threshold) / Math.max(1, soften - threshold);
      data[i + 3] = Math.round(data[i + 3] * Math.min(1, Math.max(0, t)));
    }
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toFile(outputPath);
}

if (!fs.existsSync(SOURCE)) {
  console.error('Source logo not found:', SOURCE);
  console.error('Pass path: node scripts/process-brand-logo.mjs <source.png>');
  process.exit(1);
}

const tmpFull = path.join(publicDir, '_logo-full-tmp.png');
const tmpLockup = path.join(publicDir, '_logo-lockup-tmp.png');
const tmpMark = path.join(publicDir, '_logo-mark-tmp.png');

await removeNearBlackBackground(SOURCE, tmpFull);
await sharp(tmpFull).trim({ threshold: 1 }).toFile(path.join(publicDir, 'fixbridge-logo.png'));

const fullMeta = await sharp(path.join(publicDir, 'fixbridge-logo.png')).metadata();
console.log('Full logo:', fullMeta.width, 'x', fullMeta.height);

const markWidth = Math.max(64, Math.round(fullMeta.width * 0.22));
await sharp(path.join(publicDir, 'fixbridge-logo.png'))
  .extract({ left: 0, top: 0, width: markWidth, height: fullMeta.height })
  .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .toFile(path.join(publicDir, 'fixbridge-mark.png'));
console.log('Mark crop width:', markWidth);

const lockupHeight = Math.max(64, Math.round(fullMeta.height * 0.82));
await sharp(path.join(publicDir, 'fixbridge-logo.png'))
  .extract({ left: 0, top: 0, width: fullMeta.width, height: lockupHeight })
  .toFile(path.join(publicDir, 'fixbridge-logo-lockup.png'));

for (const [size, name] of [
  [64, 'favicon-64.png'],
  [180, 'favicon.png'],
  [512, 'apple-touch-icon.png'],
]) {
  await sharp(path.join(publicDir, 'fixbridge-mark.png'))
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toFile(path.join(publicDir, name));
}

// Clean temp
for (const f of [tmpFull, tmpLockup, tmpMark]) {
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

// Remove obsolete dark variant if present
const dark = path.join(publicDir, 'fixbridge-logo-dark.png');
if (fs.existsSync(dark)) fs.unlinkSync(dark);

console.log('Logo assets updated in public/');
