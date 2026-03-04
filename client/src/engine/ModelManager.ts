import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const GLB_BASE = '/models';

interface LandmarkConfig {
    file: string;
    scale: number;
    yOffset?: number;
}

/** One landmark per town slot, cycling if there are more towns than entries.
 *  Ordered so the first 5 entries (matching roomCount) are all visually distinct. */
const TOWN_LANDMARKS: LandmarkConfig[] = [
    { file: 'fountain-round-detail.glb',  scale: 4 },
    { file: 'stall-green.glb',            scale: 4 },
    { file: 'cart.glb',                   scale: 4 },
    { file: 'fountain-square-detail.glb', scale: 4 },
    { file: 'stall-red.glb',              scale: 4 },
    { file: 'cart-high.glb',              scale: 4 },
    { file: 'stall.glb',                  scale: 4 },
];

export class ModelManager {
    private loader = new GLTFLoader();
    private cache = new Map<string, THREE.Group>();
    private currentLandmark: THREE.Object3D | null = null;
    private scene: THREE.Scene;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
    }

    private async loadGLB(path: string): Promise<THREE.Group> {
        if (this.cache.has(path)) {
            return this.cache.get(path)!.clone();
        }
        return new Promise((resolve, reject) => {
            this.loader.load(
                path,
                gltf => {
                    this.cache.set(path, gltf.scene);
                    resolve(gltf.scene.clone());
                },
                undefined,
                reject
            );
        });
    }

    public clearLandmark() {
        if (this.currentLandmark) {
            this.scene.remove(this.currentLandmark);
            this.currentLandmark = null;
        }
    }

    /**
     * Load and place the landmark for a given town.
     * @param townId  e.g. "town_0", "town_3"
     * @param walls   town wall grid — used to find a clear centre tile
     */
    public async placeTownLandmark(townId: string, walls: boolean[][]) {
        this.clearLandmark();

        const match = townId.match(/(\d+)$/);
        const idx = match ? parseInt(match[1]) % TOWN_LANDMARKS.length : 0;
        const config = TOWN_LANDMARKS[idx];
        const path = `${GLB_BASE}/${config.file}`;

        // Find the open tile closest to centre (20, 20) that has no wall
        // within a 5-tile Chebyshev radius.
        const tileSize = 2;
        const clearance = 5;
        const W = walls.length;
        const H = walls[0].length;
        const centreX = 20, centreZ = 20;

        let tx = centreX, tz = centreZ;
        let bestDist = Infinity;

        for (let cx = clearance; cx < W - clearance; cx++) {
            for (let cz = clearance; cz < H - clearance; cz++) {
                if (walls[cx][cz]) continue;

                // Reject if any tile within the clearance square is a wall
                let clear = true;
                outer: for (let dx = -clearance; dx <= clearance; dx++) {
                    for (let dz = -clearance; dz <= clearance; dz++) {
                        if (walls[cx + dx][cz + dz]) { clear = false; break outer; }
                    }
                }
                if (!clear) continue;

                const dist = Math.abs(cx - centreX) + Math.abs(cz - centreZ);
                if (dist < bestDist) { bestDist = dist; tx = cx; tz = cz; }
            }
        }

        const worldX = tx * tileSize + tileSize / 2;
        const worldZ = tz * tileSize + tileSize / 2;

        try {
            const model = await this.loadGLB(path);
            model.scale.setScalar(config.scale);
            model.position.set(worldX, config.yOffset ?? 0, worldZ);
            // Make all meshes cast/receive shadows if renderer has shadows on
            model.traverse(child => {
                if ((child as THREE.Mesh).isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            this.scene.add(model);
            this.currentLandmark = model;
        } catch (e) {
            console.warn(`ModelManager: failed to load landmark ${path}`, e);
        }
    }
}
