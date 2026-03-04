import * as THREE from 'three';
import { AssetManager } from './AssetManager';

interface WorldData {
    width: number;
    height: number;
    type: 'world' | 'city' | 'arena' | 'temple';
    customId?: string;
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
        if (data.type === 'arena') {
            this.buildArena(data);
        } else if (data.type === 'city') {
            this.buildCity(data);
        } else if (data.type === 'temple') {
            this.buildTemple(data);
        } else {
            this.buildWorld(data);
        }
    }

    private buildWorld(data: WorldData) {
        // ... (Existing Logic moved here)
        // Floor
        const floorGeometry = new THREE.PlaneGeometry(this.tileSize, this.tileSize);
        floorGeometry.rotateX(-Math.PI / 2);

        const floorTypes = [
            'floor_grass',
            'floor_var_1', 'floor_var_2', 'floor_var_3',
            'floor_var_4', 'floor_var_5', 'floor_var_6'
        ]; // Just grass variants for world

        const floorMatrices: Map<string, THREE.Matrix4[]> = new Map();
        floorTypes.forEach(t => floorMatrices.set(t, []));
        const dummyFloor = new THREE.Object3D();

        for (let x = 0; x < data.width; x++) {
            for (let y = 0; y < data.height; y++) {
                let type = 'floor_grass';
                if (Math.random() < 0.3) {
                    const idx = Math.floor(Math.random() * (floorTypes.length - 1)) + 1;
                    type = floorTypes[idx];
                }
                dummyFloor.position.set((x * this.tileSize) + (this.tileSize / 2), 0, (y * this.tileSize) + (this.tileSize / 2));
                dummyFloor.updateMatrix();
                floorMatrices.get(type)?.push(dummyFloor.matrix.clone());
            }
        }

        floorTypes.forEach(type => {
            const matrices = floorMatrices.get(type);
            if (matrices && matrices.length > 0) {
                const texture = this.assetManager.getTexture(type);
                if (texture) {
                    const material = new THREE.MeshBasicMaterial({ map: texture });
                    const mesh = new THREE.InstancedMesh(floorGeometry, material, matrices.length);
                    matrices.forEach((mat, i) => mesh.setMatrixAt(i, mat));
                    mesh.instanceMatrix.needsUpdate = true;
                    this.scene.add(mesh);
                    this.meshes.push(mesh);
                }
            }
        });

        // Walls
        const wallGeometry = new THREE.BoxGeometry(this.tileSize, this.tileSize * 2, this.tileSize);
        const wallMaterial = new THREE.MeshBasicMaterial({ map: this.assetManager.getTexture('wall_stone') });
        let wallCount = 0;
        data.walls.forEach(col => col.forEach(w => { if (w) wallCount++; }));

        const instancedMesh = new THREE.InstancedMesh(wallGeometry, wallMaterial, wallCount);
        const dummy = new THREE.Object3D();
        let index = 0;
        for (let x = 0; x < data.width; x++) {
            for (let y = 0; y < data.height; y++) {
                if (data.walls[x][y]) {
                    dummy.position.set((x * this.tileSize) + (this.tileSize / 2), this.tileSize, (y * this.tileSize) + (this.tileSize / 2));
                    dummy.updateMatrix();
                    instancedMesh.setMatrixAt(index++, dummy.matrix);
                }
            }
        }
        instancedMesh.instanceMatrix.needsUpdate = true;
        this.scene.add(instancedMesh);
        this.meshes.push(instancedMesh);

        // Doors (Generic)
        this.buildDoors(data.doors);
    }

    private buildCity(data: WorldData) {
        // 1. Floor (Grass & Dirt)
        const floorGeometry = new THREE.PlaneGeometry(this.tileSize, this.tileSize);
        floorGeometry.rotateX(-Math.PI / 2);

        const floorMat = new THREE.MeshBasicMaterial({ map: this.assetManager.getTexture('town_grass') });
        const floorCount = data.width * data.height;
        const floorMesh = new THREE.InstancedMesh(floorGeometry, floorMat, floorCount);

        const dummy = new THREE.Object3D();
        let fIdx = 0;
        for (let x = 0; x < data.width; x++) {
            for (let y = 0; y < data.height; y++) {
                dummy.position.set((x * this.tileSize) + (this.tileSize / 2), 0, (y * this.tileSize) + (this.tileSize / 2));
                dummy.updateMatrix();
                floorMesh.setMatrixAt(fIdx++, dummy.matrix);
            }
        }
        floorMesh.instanceMatrix.needsUpdate = true;
        this.scene.add(floorMesh);
        this.meshes.push(floorMesh);

        // 2. Walls (Perimeter & Houses)
        // Group by Texture Key
        const wallBatch: Map<string, THREE.Matrix4[]> = new Map();
        const addToBatch = (key: string, matrix: THREE.Matrix4) => {
            if (!wallBatch.has(key)) wallBatch.set(key, []);
            wallBatch.get(key)!.push(matrix);
        };

        const topWallGeometry = new THREE.BoxGeometry(this.tileSize, this.tileSize, this.tileSize); // 1 Unit High for stacking

        // Helper to check wall existence
        const isWall = (x: number, y: number) => {
            if (x < 0 || x >= data.width || y < 0 || y >= data.height) return true; // Edge is wall?
            return data.walls[x][y];
        };

        // Helper for House Door check
        const isHouseDoor = (x: number, y: number) => {
            return data.doors?.some(d => d.type === 'house' && d.x === x && d.y === y);
        };

        // Helper for Exit Door check
        const isExitDoor = (x: number, y: number) => {
            return data.doors?.some(d => d.type === 'exit' && d.x === x && d.y === y);
        };

        for (let x = 0; x < data.width; x++) {
            for (let y = 0; y < data.height; y++) {
                if (data.walls[x][y]) {
                    // Is Perimeter?
                    const isPerimeter = x === 0 || x === data.width - 1 || y === 0 || y === data.height - 1;

                    if (isPerimeter) {
                        // Log Wall
                        // CHECK: If this is an EXIT door, DO NOT render the wall.
                        // The Sprite will be rendered later.
                        if (isExitDoor(x, y)) {
                            // Skip wall rendering
                            // But we still need to iterate? No, just continue outer loop? 
                            // No, continue effectively skips to next iteration of inner loop (x,y). 
                            // But we need to verify if anything else renders here?
                            // Just 'continue' implies we skip ALL processing for this x,y for isPerimeter branch.
                            // Which is correct, we want NO wall here.
                            continue;
                        }

                        // Bottom
                        dummy.position.set((x * this.tileSize) + (this.tileSize / 2), this.tileSize / 2, (y * this.tileSize) + (this.tileSize / 2));
                        dummy.updateMatrix();
                        addToBatch('town_log_wall_bottom', dummy.matrix.clone());

                        // Top
                        dummy.position.set((x * this.tileSize) + (this.tileSize / 2), (this.tileSize / 2) + this.tileSize, (y * this.tileSize) + (this.tileSize / 2));
                        dummy.updateMatrix();
                        addToBatch('town_log_wall_top', dummy.matrix.clone());
                    } else {
                        // House Wall (Internal) - ALL SIDES WRAP AROUND

                        // --- BOTTOM BLOCK ---
                        dummy.position.set((x * this.tileSize) + (this.tileSize / 2), this.tileSize / 2, (y * this.tileSize) + (this.tileSize / 2));
                        dummy.updateMatrix();

                        if (isHouseDoor(x, y)) {
                            addToBatch('town_door_closed', dummy.matrix.clone());
                        } else {
                            // L/M/R Tiling logic for ALL SIDES
                            // Check Wall Neighbors
                            const left = !isWall(x - 1, y);
                            const right = !isWall(x + 1, y);

                            let key = 'town_house_mid';
                            if (left) key = 'town_house_left';
                            else if (right) key = 'town_house_right';

                            addToBatch(key, dummy.matrix.clone());
                        }

                        // --- TOP BLOCK (Roof) ---
                        dummy.position.set((x * this.tileSize) + (this.tileSize / 2), (this.tileSize / 2) + this.tileSize, (y * this.tileSize) + (this.tileSize / 2));
                        dummy.updateMatrix();
                        addToBatch('town_roof', dummy.matrix.clone());
                    }
                }
            }
        }

        // Create Meshes
        const houseWallKeys = new Set(['town_house_left', 'town_house_mid', 'town_house_right']);
        wallBatch.forEach((matrices, key) => {
            const texture = this.assetManager.getTexture(key);
            if (!texture) return;

            let material: THREE.MeshBasicMaterial | THREE.MeshBasicMaterial[];

            if (houseWallKeys.has(key)) {
                // Front face (+Z, group 4): correct as-is
                const frontMat = new THREE.MeshBasicMaterial({ map: texture });

                // Back face (-Z, group 5): Three.js mirrors this face horizontally — flip it back
                const backTex = texture.clone();
                backTex.needsUpdate = true;
                backTex.repeat.x = -1;
                backTex.offset.x = 1;
                const backMat = new THREE.MeshBasicMaterial({ map: backTex });

                // Side faces (+X=0, -X=1): use the neutral mid texture so ends look like plain wall
                const sideTex = this.assetManager.getTexture('town_house_mid') ?? texture;
                const sideMat = new THREE.MeshBasicMaterial({ map: sideTex });

                // BoxGeometry group order: [+X, -X, +Y, -Y, +Z(front), -Z(back)]
                material = [sideMat, sideMat, frontMat, frontMat, frontMat, backMat];
            } else {
                material = new THREE.MeshBasicMaterial({ map: texture });
            }

            const mesh = new THREE.InstancedMesh(topWallGeometry, material, matrices.length);
            matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
            mesh.instanceMatrix.needsUpdate = true;
            this.scene.add(mesh);
            this.meshes.push(mesh);
        });

        // 3. Doors
        this.buildDoors(data.doors);
    }

    private buildDoors(doors: any[]) {
        if (!doors) return;

        doors.forEach(door => {
            if (door.type === 'house') return; // Skip House Doors (Walls)

            // Determine Texture based on Type
            let texKey = 'door';
            if (door.type === 'exit') texKey = 'town_door_open';
            else if (door.type === 'temple') texKey = 'temple_entrance';
            else if (door.type === 'temple_exit') {
                // Per-temple door texture: derive type from exit door id ("exit_temple_sky" → "sky")
                const templeType = door.id?.replace('exit_temple_', '') ?? '';
                texKey = this.assetManager.getTexture(`temple_${templeType}_exit_door`)
                    ? `temple_${templeType}_exit_door`
                    : 'temple_exit_door';
            }

            const doorTexture = this.assetManager.getTexture(texKey);
            const doorMaterial = new THREE.SpriteMaterial({ map: doorTexture, transparent: true });

            const sprite = new THREE.Sprite(doorMaterial);
            // Center in tile, slightly up?
            sprite.position.set((door.x * this.tileSize) + (this.tileSize / 2), this.tileSize / 2, (door.y * this.tileSize) + (this.tileSize / 2));

            // Scale: Must match 1 tile size (2x2)
            sprite.scale.set(this.tileSize, this.tileSize, 1);

            this.meshes.push(sprite);
            this.scene.add(sprite);

            // Town Name Label (Only for Exits or Targets)
            if (door.targetName) {
                const label = this.createNameLabel(door.targetName);
                label.position.set((door.x * this.tileSize) + (this.tileSize / 2), 5, (door.y * this.tileSize) + (this.tileSize / 2));
                this.meshes.push(label);
                this.scene.add(label);
            }
        });
    }

    private buildTemple(data: WorldData) {
        // Derive the temple type (e.g. "sky" from "temple_sky") for per-temple texture keys.
        // Key lookup order: temple_{type}_{slot}  →  temple_{slot}
        const templeType = data.customId?.replace('temple_', '') ?? '';
        const tex = (slot: string) =>
            this.assetManager.getTexture(`temple_${templeType}_${slot}`) ??
            this.assetManager.getTexture(`temple_${slot}`)!;

        const floorGeometry = new THREE.PlaneGeometry(this.tileSize, this.tileSize);
        floorGeometry.rotateX(-Math.PI / 2);

        const floorMat = new THREE.MeshBasicMaterial({ map: tex('floor') });
        const floorCount = data.width * data.height;
        const floorMesh = new THREE.InstancedMesh(floorGeometry, floorMat, floorCount);

        const dummy = new THREE.Object3D();
        let fIdx = 0;
        for (let x = 0; x < data.width; x++) {
            for (let y = 0; y < data.height; y++) {
                dummy.position.set((x * this.tileSize) + (this.tileSize / 2), 0, (y * this.tileSize) + (this.tileSize / 2));
                dummy.updateMatrix();
                floorMesh.setMatrixAt(fIdx++, dummy.matrix);
            }
        }
        floorMesh.instanceMatrix.needsUpdate = true;
        this.scene.add(floorMesh);
        this.meshes.push(floorMesh);

        // Use tileSize-height boxes (same as city) so the texture isn't stretched
        const wallGeometry = new THREE.BoxGeometry(this.tileSize, this.tileSize, this.tileSize);
        const wallMaterial = new THREE.MeshBasicMaterial({ map: tex('wall') });

        const isTempleExitDoor = (x: number, y: number) =>
            data.doors?.some((d: any) => d.type === 'temple_exit' && d.x === x && d.y === y);

        let wallCount = 0;
        for (let x = 0; x < data.width; x++)
            for (let y = 0; y < data.height; y++)
                if (data.walls[x][y] && !isTempleExitDoor(x, y)) wallCount++;

        if (wallCount > 0) {
            const bottomMesh = new THREE.InstancedMesh(wallGeometry, wallMaterial, wallCount);
            const topMesh    = new THREE.InstancedMesh(wallGeometry, wallMaterial, wallCount);
            let index = 0;
            for (let x = 0; x < data.width; x++) {
                for (let y = 0; y < data.height; y++) {
                    if (data.walls[x][y] && !isTempleExitDoor(x, y)) {
                        const wx = (x * this.tileSize) + (this.tileSize / 2);
                        const wz = (y * this.tileSize) + (this.tileSize / 2);
                        dummy.position.set(wx, this.tileSize / 2, wz);
                        dummy.updateMatrix();
                        bottomMesh.setMatrixAt(index, dummy.matrix);
                        dummy.position.y += this.tileSize;
                        dummy.updateMatrix();
                        topMesh.setMatrixAt(index, dummy.matrix);
                        index++;
                    }
                }
            }
            bottomMesh.instanceMatrix.needsUpdate = true;
            topMesh.instanceMatrix.needsUpdate = true;
            this.scene.add(bottomMesh);
            this.scene.add(topMesh);
            this.meshes.push(bottomMesh);
            this.meshes.push(topMesh);
        }

        // Doors (exit back to overworld)
        this.buildDoors(data.doors);
    }

    private buildArena(data: WorldData) {
        const floorGeometry = new THREE.PlaneGeometry(this.tileSize, this.tileSize);
        floorGeometry.rotateX(-Math.PI / 2);

        // Dark floor
        const floorMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
        const floorCount = data.width * data.height;
        const floorMesh = new THREE.InstancedMesh(floorGeometry, floorMat, floorCount);

        const dummy = new THREE.Object3D();
        let fIdx = 0;
        for (let x = 0; x < data.width; x++) {
            for (let y = 0; y < data.height; y++) {
                dummy.position.set((x * this.tileSize) + (this.tileSize / 2), 0, (y * this.tileSize) + (this.tileSize / 2));
                dummy.updateMatrix();
                floorMesh.setMatrixAt(fIdx++, dummy.matrix);
            }
        }
        floorMesh.instanceMatrix.needsUpdate = true;
        this.scene.add(floorMesh);
        this.meshes.push(floorMesh);

        // Separate border walls (textured) from interior pillars (red)
        const pillarGeometry = new THREE.BoxGeometry(this.tileSize, this.tileSize * 2, this.tileSize);

        const borderMatrices: THREE.Matrix4[] = [];
        const innerMatrices: THREE.Matrix4[] = [];

        for (let x = 0; x < data.width; x++) {
            for (let y = 0; y < data.height; y++) {
                if (data.walls[x][y]) {
                    dummy.position.set((x * this.tileSize) + (this.tileSize / 2), this.tileSize, (y * this.tileSize) + (this.tileSize / 2));
                    dummy.updateMatrix();
                    const isBorder = x === 0 || x === data.width - 1 || y === 0 || y === data.height - 1;
                    (isBorder ? borderMatrices : innerMatrices).push(dummy.matrix.clone());
                }
            }
        }

        if (borderMatrices.length > 0) {
            const wallTex = this.assetManager.getTexture('arena_wall');
            const borderMat = wallTex
                ? new THREE.MeshBasicMaterial({ map: wallTex })
                : new THREE.MeshBasicMaterial({ color: 0x443322 });
            const borderMesh = new THREE.InstancedMesh(pillarGeometry, borderMat, borderMatrices.length);
            borderMatrices.forEach((m, i) => borderMesh.setMatrixAt(i, m));
            borderMesh.instanceMatrix.needsUpdate = true;
            this.scene.add(borderMesh);
            this.meshes.push(borderMesh);
        }

        if (innerMatrices.length > 0) {
            const innerMat = new THREE.MeshBasicMaterial({ color: 0xcc2200 });
            const innerMesh = new THREE.InstancedMesh(pillarGeometry, innerMat, innerMatrices.length);
            innerMatrices.forEach((m, i) => innerMesh.setMatrixAt(i, m));
            innerMesh.instanceMatrix.needsUpdate = true;
            this.scene.add(innerMesh);
            this.meshes.push(innerMesh);
        }
    }

    public clear() {
        this.meshes.forEach(mesh => {
            this.scene.remove(mesh);
            // Optional: Dispose geometries/materials if needed for memory
        });
        this.meshes = [];
    }

    private createNameLabel(text: string): THREE.Sprite {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return new THREE.Sprite();

        const fontSize = 24;
        ctx.font = `bold ${fontSize}px monospace`;
        const textWidth = ctx.measureText(text).width;

        canvas.width = textWidth + 20;
        canvas.height = fontSize + 10;

        // Re-set font after resize
        ctx.font = `bold ${fontSize}px monospace`;
        ctx.fillStyle = "#FFD700"; // Gold
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.shadowColor = 'black';
        ctx.shadowBlur = 4;
        ctx.lineWidth = 3;
        ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;

        const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(material);

        const scale = 0.05;
        sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);
        return sprite;
    }
}
