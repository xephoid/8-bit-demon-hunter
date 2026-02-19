
import json
import os

assets_path = r'c:\Users\zekes\Code\miniburger\miniburger-ts\client\src\data\assets.json'

with open(assets_path, 'r') as f:
    data = json.load(f)

textures = data.get('textures', {})

# Add characters 0-7, 0-3
for x in range(8):
    for y in range(4):
        key = f"character_{x}_{y}"
        # Only add if not present (although we know they aren't)
        if key not in textures:
            textures[key] = f"sprites/sliced/character_{x}_{y}.png"
            # Also need animation frames? 
            # The files are single frames usually?
            # actually looking at file list: character_0_0.png, character_0_1.png...
            # The list_dir showed `character_0_0.png`, `character_0_1.png`... 
            # Wait, `PersonGenerator` assigns `character_${x}_${y}`.
            # Does it expect animation? 
            # EntityManager expects `enemy_${type}_${direction}_${frame}`.
            # If I use `data.properties.sprite`, I should probably bypass the animation logic or 
            # map `direction/frame` to something else?
            # or just use the static sprite for now.
            pass

data['textures'] = textures

with open(assets_path, 'w') as f:
    json.dump(data, f, indent=4)

print("Updated assets.json")
