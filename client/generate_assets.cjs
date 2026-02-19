const fs = require('fs');
const path = require('path');

const texturesDir = path.join(__dirname, 'public/textures');
const spritesDir = path.join(__dirname, 'public/sprites');

if (!fs.existsSync(texturesDir)) fs.mkdirSync(texturesDir, { recursive: true });
if (!fs.existsSync(spritesDir)) fs.mkdirSync(spritesDir, { recursive: true });

const writeImage = (dir, filename, base64Data) => {
    // Strip data:image/png;base64, prefix if present
    const data = base64Data.replace(/^data:image\/png;base64,/, "");
    const buffer = Buffer.from(data, 'base64');
    fs.writeFileSync(path.join(dir, filename), buffer);
    console.log(`Created ${filename}`);
};

// Valid 1x1 PNGs
const wall_gray = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mMsLS19DwAG0wGztophRAAAAABJRU5ErkJggg==";
const floor_green = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const slime_red = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

try {
    writeImage(texturesDir, 'wall_stone.png', wall_gray);
    writeImage(texturesDir, 'floor_grass.png', floor_green);
    writeImage(spritesDir, 'slime.png', slime_red);
    console.log("Restored valid 1x1 assets.");
} catch (error) {
    console.error("Error generating assets:", error);
}
