// Renders the PWA icons from web/public/icon.svg (full-bleed artwork).
// The favicon and "any" icons get rounded corners; the maskable icon stays square,
// because the platform applies its own mask.
import fs from 'node:fs/promises';
import sharp from 'sharp';
const src = 'web/public/icon.svg';
const svg = await fs.readFile(src, 'utf8');
const rounded = svg.replace('<rect width="512" height="512"', '<rect width="512" height="512" rx="112"');
await fs.writeFile('web/public/favicon.svg', rounded);
const roundedBuf = Buffer.from(rounded);
const out = (name) => `web/public/${name}`;
await sharp(roundedBuf, { density: 300 }).resize(192, 192).png().toFile(out('icon-192.png'));
await sharp(roundedBuf, { density: 300 }).resize(512, 512).png().toFile(out('icon-512.png'));
// iOS rounds the corners itself and dislikes transparency.
await sharp(Buffer.from(svg), { density: 300 }).resize(180, 180).flatten({ background: '#0b1426' }).png().toFile(out('apple-touch-icon.png'));
// Maskable: full-bleed background, motif shrunk into the central safe zone (80 %).
const motif = await sharp(Buffer.from(svg.replace(/<rect[^>]*\/>/, '')), { density: 300 }).resize(400, 400).png().toBuffer();
// Everything after the background rect is motif; the background alone is the rect with its gradient.
const background = await sharp(Buffer.from(svg.replace(/(<rect[^>]*\/>)[\s\S]*<\/svg>/, '$1</svg>')), { density: 300 }).resize(512, 512).png().toBuffer();
await sharp(background).composite([{ input: motif, gravity: 'center' }]).png().toFile(out('icon-maskable-512.png'));
