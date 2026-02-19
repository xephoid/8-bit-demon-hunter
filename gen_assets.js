
const fs = require('fs');

let output = {};
for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 4; y++) {
        let key = `character_${x}_${y}`;
        // The files are in textures/sliced? No, the list_dir said client/public/sprites/sliced
        // assets.json uses "textures/sliced/..." for terrain and "sprites/sliced/..." for enemies.
        // So it should be "sprites/sliced/character_${x}_${y}.png"
        output[key] = `sprites/sliced/character_${x}_${y}.png`;
    }
}

console.log(JSON.stringify(output, null, 4));
