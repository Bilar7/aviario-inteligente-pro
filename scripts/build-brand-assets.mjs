import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'public', 'assets', 'aviario-inteligente-pro-logo.png');
const outputs = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'favicon.png', size: 48 }
];

for (const { name, size } of outputs) {
  await sharp(source)
    .resize(size, size, { fit: 'contain' })
    .png()
    .toFile(path.join(root, 'public', 'assets', name));
}

const iconDictionaryPath = path.join(root, 'src', 'services', 'icons.js');
const iconDictionary = await readFile(iconDictionaryPath, 'utf8');
const cleanedIconDictionary = iconDictionary.replace(/^  logo: '<svg.*<\/svg>',\r?$/m, "  logo: '',");
if (cleanedIconDictionary !== iconDictionary) {
  await writeFile(iconDictionaryPath, cleanedIconDictionary);
}

console.log(`Generated ${outputs.length} brand icons from the original PNG.`);
