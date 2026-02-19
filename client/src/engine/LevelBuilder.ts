import * as THREE from 'three';
import { AssetManager } from './AssetManager';

interface WorldData {
    width: number;
    height: number;
    type: 'world' | 'city';
    walls: boolean[][];
    entities: any[];
    doors: any[];
}

export class LevelBuilder {
    private scene: THREE.Scene;
    private assetManager: AssetManager;
    private tileSize: number = 2; // 3D units
    private meshes: THREE.Object3D[] = [];

    constructor(scene: THREE.Scene, assetManager: AssetManager) {
        this.scene = scene;
        this.assetManager = assetManager;
    }

    public build(data: WorldData) {
        // Floor (Instanced Rendering with Variants)
        const floorGeometry = new THREE.PlaneGeometry(this.tileSize, this.tileSize);
        floorGeometry.rotateX(-Math.PI / 2); // Rotate flat

        const floorTypes = [
            'floor_grass', 'floor_city',
            'floor_var_1', 'floor_var_2', 'floor_var_3',
            'floor_var_4', 'floor_var_5', 'floor_var_6'
        ];

        // Prepare matrices for each type
        const floorMatrices: Map<string, THREE.Matrix4[]> = new Map();
        floorTypes.forEach(t => floorMatrices.set(t, []));

        const dummyFloor = new THREE.Object3D();

        // Determine Palette
        let mainFloor = 'floor_grass';
        let mainWall = 'wall_stone';

        if (data.type === 'city') {
            mainFloor = 'floor_city';
            mainWall = 'wall_city';
        }

        for (let x = 0; x < data.width; x++) {
            for (let y = 0; y < data.height; y++) {
                // Randomly pick a floor tile
                // 70% chance of default, 30% chance of variant (only for grass for now)
                let type = mainFloor;
                if (mainFloor === 'floor_grass' && Math.random() < 0.3) {
                    const idx = Math.floor(Math.random() * (floorTypes.length - 1)) + 1;
                    type = floorTypes[idx];
                }
                // TODO: City variants?

                dummyFloor.position.set(x * this.tileSize, 0, y * this.tileSize);
                dummyFloor.updateMatrix();

                floorMatrices.get(type)?.push(dummyFloor.matrix.clone());
            }
        }

        // Create Instanced Meshes
        floorTypes.forEach(type => {
            const matrices = floorMatrices.get(type);
            if (matrices && matrices.length > 0) {
                const texture = this.assetManager.getTexture(type);
                if (texture) {
                    const material = new THREE.MeshBasicMaterial({ map: texture });
                    const mesh = new THREE.InstancedMesh(floorGeometry, material, matrices.length);

                    matrices.forEach((mat, i) => {
                        mesh.setMatrixAt(i, mat);
                    });

                    mesh.instanceMatrix.needsUpdate = true;
                    mesh.instanceMatrix.needsUpdate = true;
                    this.scene.add(mesh);
                    this.meshes.push(mesh);
                }
            }
        });

        // Walls (Instanced Rendering)
        const wallGeometry = new THREE.BoxGeometry(this.tileSize, this.tileSize * 2, this.tileSize);
        const wallMaterial = new THREE.MeshBasicMaterial({
            map: this.assetManager.getTexture(mainWall)
        });

        // 1. Count walls
        let wallCount = 0;
        for (let x = 0; x < data.width; x++) {
            for (let y = 0; y < data.height; y++) {
                if (data.walls[x][y]) {
                    wallCount++;
                }
            }
        }

        // 2. Create Instance Mesh
        const instancedMesh = new THREE.InstancedMesh(wallGeometry, wallMaterial, wallCount);
        const dummy = new THREE.Object3D();
        let index = 0;

        for (let x = 0; x < data.width; x++) {
            for (let y = 0; y < data.height; y++) {
                if (data.walls[x][y]) {
                    dummy.position.set(x * this.tileSize, this.tileSize, y * this.tileSize);
                    dummy.updateMatrix();
                    instancedMesh.setMatrixAt(index++, dummy.matrix);
                }
            }
        }

        instancedMesh.instanceMatrix.needsUpdate = true;
        instancedMesh.instanceMatrix.needsUpdate = true;
        this.scene.add(instancedMesh);
        this.meshes.push(instancedMesh);

        // Doors
        if (data.doors) {
            const doorTexture = this.assetManager.getTexture('door');
            const doorMaterial = new THREE.SpriteMaterial({ map: doorTexture, transparent: true });

            data.doors.forEach(door => {
                const sprite = new THREE.Sprite(doorMaterial);
                sprite.position.set(door.x * this.tileSize, 2, door.y * this.tileSize); // Y=2 for center of 4u high
                sprite.scale.set(this.tileSize * 2, this.tileSize * 2, 1);
                this.meshes.push(sprite);
                this.scene.add(sprite);
            });
        }
    }

    public clear() {
        this.meshes.forEach(mesh => {
            this.scene.remove(mesh);
            // Optional: Dispose geometries/materials if needed for memory
        });
        this.meshes = [];
    }
}
