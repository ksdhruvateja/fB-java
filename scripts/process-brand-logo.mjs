/**
 * Export FixBridge web assets: centered mark, favicons, OG image, lockups.
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
  path.join(root, 'assets', 'brand', 'fixbridge-logo-source.png');

/** Left portion of horizontal lockup that contains the FB monogram only. */
const MARK_CROP_RATIO = 0.3;
const ICON_BG = { r: 12, g: 12, b: 12, alpha: 1 };
const ICON_PADDING = 0.12;

async function removeNearBlackBackground(inputPath, outputPath, { threshold = 32, soften = 72 } = {}) {
  const { data, info } = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const spread = max - min;
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

async function extractMarkBuffer(lockupPath) {
  const meta = await sharp(lockupPath).metadata();
  const cropW = Math.max(64, Math.round(meta.width * MARK_CROP_RATIO));
  return sharp(lockupPath)
    .extract({ left: 0, top: 0, width: Math.min(cropW, meta.width), height: meta.height })
    .trim({ threshold: 12 })
    .png()
    .toBuffer();
}

async function centerMarkIcon(markBuffer, size, { padding = ICON_PADDING, background = ICON_BG } = {}) {
  const inner = Math.max(8, Math.round(size * (1 - padding * 2)));
  const resized = await sharp(markBuffer).resize(inner, inner, { fit: 'inside' }).png().toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background },
  })
    .composite([{ input: resized, gravity: 'center' }])
    .png()
    .toBuffer();
}

async function writeOgImage(lockupPath, outputPath) {
  const OG_W = 1200;
  const OG_H = 630;
  const lockupTrimmed = await sharp(lockupPath).trim({ threshold: 12 }).png().toBuffer();
  const lockupMeta = await sharp(lockupTrimmed).metadata();
  const maxW = Math.round(OG_W * 0.72);
  const maxH = Math.round(OG_H * 0.42);
  const scale = Math.min(maxW / lockupMeta.width, maxH / lockupMeta.height, 1);
  const targetW = Math.max(1, Math.round(lockupMeta.width * scale));
  const targetH = Math.max(1, Math.round(lockupMeta.height * scale));
  const lockupResized = await sharp(lockupTrimmed).resize(targetW, targetH, { fit: 'inside' }).png().toBuffer();

  const taglineSvg = Buffer.from(`<svg width="${OG_W}" height="${OG_H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#141414"/>
        <stop offset="100%" stop-color="#0c0c0c"/>
      </linearGradient>
    </defs>
    <rect width="${OG_W}" height="${OG_H}" fill="url(#bg)"/>
    <text x="50%" y="78%" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="#a3a3a3" letter-spacing="0.02em">
      AI-powered property care and service coordination
    </text>
  </svg>`);

  const lockupTop = Math.round((OG_H - targetH) * 0.38);
  const lockupLeft = Math.round((OG_W - targetW) / 2);

  await sharp(taglineSvg)
    .composite([{ input: lockupResized, left: lockupLeft, top: lockupTop }])
    .png()
    .toFile(outputPath);
}

if (!fs.existsSync(SOURCE)) {
  console.error('Source logo not found:', SOURCE);
  console.error('Pass path: node scripts/process-brand-logo.mjs <source.png>');
  process.exit(1);
}

const tmpFull = path.join(publicDir, '_logo-full-tmp.png');

await removeNearBlackBackground(SOURCE, tmpFull);
await sharp(tmpFull).trim({ threshold: 1 }).toFile(path.join(publicDir, 'fixbridge-logo.png'));

const fullMeta = await sharp(path.join(publicDir, 'fixbridge-logo.png')).metadata();
console.log('Full logo:', fullMeta.width, 'x', fullMeta.height);

const lockupHeight = Math.max(64, Math.round(fullMeta.height * 0.82));
await sharp(path.join(publicDir, 'fixbridge-logo.png'))
  .extract({ left: 0, top: 0, width: fullMeta.width, height: lockupHeight })
  .toFile(path.join(publicDir, 'fixbridge-logo-lockup.png'));

const lockupPath = path.join(publicDir, 'fixbridge-logo-lockup.png');
const markBuffer = await extractMarkBuffer(lockupPath);
const markMeta = await sharp(markBuffer).metadata();
console.log('Mark trimmed:', markMeta.width, 'x', markMeta.height);

await sharp(await centerMarkIcon(markBuffer, 512)).toFile(path.join(publicDir, 'fixbridge-mark.png'));

const iconSizes = [
  [16, 'favicon-16.png'],
  [32, 'favicon-32.png'],
  [48, 'favicon-48.png'],
  [64, 'favicon-64.png'],
  [180, 'favicon.png'],
  [180, 'apple-touch-icon.png'],
  [192, 'icon-192.png'],
  [512, 'icon-512.png'],
];

for (const [size, name] of iconSizes) {
  const icon = await centerMarkIcon(markBuffer, size);
  await sharp(icon).toFile(path.join(publicDir, name));
}

await writeOgImage(lockupPath, path.join(publicDir, 'og-image.png'));
console.log('OG image: 1200 x 630');

if (fs.existsSync(tmpFull)) fs.unlinkSync(tmpFull);

const dark = path.join(publicDir, 'fixbridge-logo-dark.png');
if (fs.existsSync(dark)) fs.unlinkSync(dark);

console.log('Logo assets updated in public/');
