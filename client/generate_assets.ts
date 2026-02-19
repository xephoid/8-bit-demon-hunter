import fs from 'fs';
import path from 'path';

const texturesDir = path.join(__dirname, 'public/textures');
const spritesDir = path.join(__dirname, 'public/sprites');

// Helper to write base64 to file
const writeImage = (dir, filename, base64Data) => {
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(path.join(dir, filename), buffer);
    console.log(`Created ${filename}`);
};

// 1x1 Gray Pixel (Wall)
const wall = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNiYAAAAAkAAxkR2eQAAAAASUVORK5CYII=";
// 1x1 Green Pixel (Floor)
const floor = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAgAAgwD5c4O2WAAAAABJRU5ErkJggg==";
// 1x1 Red Pixel (Slime)
const slime = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGP6DwABBQECz6AznQAAAABJRU5ErkJggg==";

writeImage(texturesDir, 'wall_stone.png', wall);
writeImage(texturesDir, 'floor_grass.png', floor);
writeImage(spritesDir, 'slime.png', slime);
