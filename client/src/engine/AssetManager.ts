import * as THREE from 'three';
// import assetsManifest from '../data/assets.json'; // Importing JSON needs resolveJsonModule

export class AssetManager {
    private textures: Map<string, THREE.Texture> = new Map();
    private loadingManager: THREE.LoadingManager;

    constructor() {
        this.loadingManager = new THREE.LoadingManager();
        this.loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
            console.log(`Loading file: ${url}.\nLoaded ${itemsLoaded} of ${itemsTotal} files.`);
        };
    }

    public async loadAssets(manifest: any): Promise<void> {
        const textureLoader = new THREE.TextureLoader(this.loadingManager);

        const promises = Object.entries(manifest.textures).map(([key, path]) => {
            return new Promise<void>((resolve, reject) => {
                textureLoader.load(
                    path as string,
                    (texture) => {
                        texture.magFilter = THREE.NearestFilter; // Retro look
                        texture.minFilter = THREE.NearestFilter;
                        texture.colorSpace = THREE.SRGBColorSpace;
                        this.textures.set(key, texture);
                        resolve();
                    },
                    undefined,
                    (err) => {
                        console.error(`Failed to load texture: ${path}`, err);
                        reject(new Error(`Failed to load texture: ${path}`));
                    }
                );
            });
        });

        await Promise.all(promises);
    }

    public getTexture(key: string): THREE.Texture | undefined {
        return this.textures.get(key);
    }
}
