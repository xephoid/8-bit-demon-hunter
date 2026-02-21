import * as THREE from 'three';
import { AssetManager } from './AssetManager';

export interface EntityData {
    type: string;
    name: string;
    x: number;
    y: number;
    properties: any;
}

interface EntityState {
    sprite: THREE.Sprite;
    data: EntityData;
    anim: {
        direction: 'down' | 'up' | 'side';
        frame: number;
        timer: number;
        isMoving: boolean;
    };
}

export class EntityManager {
    private scene: THREE.Scene;
    private assetManager: AssetManager;
    private gameConfig: any;
    public activeEntities: EntityState[] = [];
    public follower: EntityState | null = null;

    // Grid System
    private tileSize = 2; // Matches map scale
    private currentWalls: boolean[][] | null = null;

    public projectiles: any[] = [];
    private dummyTexture: THREE.Texture;

    constructor(scene: THREE.Scene, assetManager: AssetManager, gameConfig: any) {
        this.scene = scene;
        this.assetManager = assetManager;
        this.gameConfig = gameConfig;

        // specific projectile texture (red square)
        const canvas = document.createElement('canvas');
        canvas.width = 8; canvas.height = 8;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#FF0000';
            ctx.fillRect(0, 0, 8, 8);
        }
        this.dummyTexture = new THREE.CanvasTexture(canvas);
        this.dummyTexture.magFilter = THREE.NearestFilter;
    }

    public spawnEntities(entitiesData: EntityData[]) {
        // Clear existing
        this.activeEntities.forEach(e => {
            this.scene.remove(e.sprite);
        });
        this.activeEntities = [];
        this.projectiles = []; // Clear projectiles

        if (this.follower) {
            this.scene.remove(this.follower.sprite);
            this.follower = null;
        }

        entitiesData.forEach(data => this.spawnEntity(data));
    }

    public spawnFollower(person: any) {
        if (this.follower) {
            this.scene.remove(this.follower.sprite);
            this.follower = null;
        }

        if (!person) return;

        // Clone/Spawn Sprite
        let initialTex;
        if (person.sprite) {
            // Logic for new skin system: character_ROW_SKIN
            let match = person.sprite.match(/character_(\d+)_(\d+)/);
            if (match) {
                const row = parseInt(match[1]);
                const skin = parseInt(match[2]);
                const col = (skin * 3) + 2; // Down
                initialTex = this.assetManager.getTexture(`character_${row}_${col}`);
            } else {
                // Fallback
                match = person.sprite.match(/character_(\d+)/);
                if (match) {
                    const skin = parseInt(match[1]);
                    const col = (skin * 3) + 2; // Down
                    initialTex = this.assetManager.getTexture(`character_0_${col}`);
                }
            }
        }

        if (!initialTex) initialTex = this.assetManager.getTexture(`${person.sprite}_2`) || this.assetManager.getTexture(person.sprite);

        const material = new THREE.SpriteMaterial({ map: initialTex });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(1.5, 1.5, 1);

        sprite.position.set(person.x || 10, 1.5, person.y || 10);

        this.scene.add(sprite);

        this.follower = {
            sprite: sprite,
            data: person,
            anim: {
                direction: 'down',
                frame: 0,
                timer: 0,
                isMoving: false
            }
        };
        console.log("Follower Spawned:", person.name);
    }

    public spawnEntity(data: EntityData) {
        // Initial texture (Down 0)
        let texture;
        if (data.properties && data.properties.sprite) {
            texture = this.assetManager.getTexture(data.properties.sprite);
            if (!texture && data.properties.sprite.startsWith("character_")) {
                // Format: character_ROW_SKIN
                const match = data.properties.sprite.match(/character_(\d+)_(\d+)/);
                if (match) {
                    const row = parseInt(match[1]);
                    const skin = parseInt(match[2]);
                    const col = (skin * 3) + 2; // Down

                    // Key: character_ROW_COL
                    texture = this.assetManager.getTexture(`character_${row}_${col}`);
                }
                // Fallback for old Format: character_ID (assumed row 0)
                else {
                    const matchOld = data.properties.sprite.match(/character_(\d+)/);
                    if (matchOld) {
                        const skin = parseInt(matchOld[1]);
                        const col = (skin * 3) + 2;
                        texture = this.assetManager.getTexture(`character_0_${col}`);
                    }
                }
            }
        } else {
            texture = this.getTextureForState(data.type, 'down', 0);
        }
        if (texture) {
            const material = new THREE.SpriteMaterial({ map: texture });
            const sprite = new THREE.Sprite(material);

            sprite.position.set(
                (data.x * this.tileSize) + (this.tileSize / 2),
                1,
                (data.y * this.tileSize) + (this.tileSize / 2)
            );
            sprite.scale.set(1.5, 1.5, 1);

            // --- NPC LABEL LOGIC ---
            if (data.type === 'person') {
                const label = this.createNameLabel(data.name, data.properties.hasMet ? '#888888' : '#ffffff');
                label.position.set(0, 0.7, 0); // Above head (lowered from 1.2)
                sprite.add(label); // Attach to parent sprite
            }

            this.scene.add(sprite); // Add directly to scene, not a group
            this.activeEntities.push({ // Push to activeEntities
                sprite,
                data,
                anim: {
                    direction: 'down',
                    frame: 0,
                    timer: 0,
                    isMoving: false
                }
            });
        }
    }

    private createNameLabel(text: string, color: string): THREE.Sprite {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return new THREE.Sprite(); // Fail safe

        const fontSize = 24;
        ctx.font = `bold ${fontSize}px monospace`;
        const textWidth = ctx.measureText(text).width;

        canvas.width = textWidth + 10;
        canvas.height = fontSize + 10;

        // Re-set font after resize
        ctx.font = `bold ${fontSize}px monospace`;
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Shadow for readability
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 4;
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;

        const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(material);

        // Scale down to world units
        const scale = 0.02; // Adjust based on preference
        sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);

        return sprite;
    }

    public updatePersonLabel(personId: string, hasMet: boolean) {
        const entityState = this.activeEntities.find(e => e.data.properties.personId === personId);
        if (entityState && entityState.sprite.children.length > 0) {
            // Assume child 0 is label
            const oldLabel = entityState.sprite.children[0];
            entityState.sprite.remove(oldLabel);

            // Recreate with new color
            const newLabel = this.createNameLabel(entityState.data.name, hasMet ? '#888888' : '#ffffff');
            newLabel.position.set(0, 0.7, 0);
            entityState.sprite.add(newLabel);
        }
    }

    private getTextureForState(type: string, direction: string, frame: number): THREE.Texture | undefined {
        const key = `enemy_${type}_${direction}_${frame}`;
        return this.assetManager.getTexture(key) || this.assetManager.getTexture(`enemy_${type}`); // Fallback
    }

    public spawnProjectile(x: number, z: number, dir: THREE.Vector3, type: 'fireball' | 'arrow' | 'slash', isPlayer: boolean = false, rangeMod: number = 1) {
        let textureKey = type === 'fireball' ? 'projectile_fireball' : 'projectile_arrow';
        if (type === 'slash') textureKey = 'slash';

        const texture = this.assetManager.getTexture(textureKey) || this.dummyTexture;

        let object: THREE.Object3D;

        if (type === 'arrow' || type === 'slash') {
            // ARROW/SLASH: Use Mesh (Plane) to orient in 3D
            const geometry = type === 'slash' ? new THREE.PlaneGeometry(2, 4) : new THREE.PlaneGeometry(1, 1);
            const material = new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                side: THREE.DoubleSide
            });
            const mesh = new THREE.Mesh(geometry, material);
            const yPos = type === 'slash' ? 1.0 : 1.5;
            mesh.position.set(x, yPos, z);

            const target = new THREE.Vector3(x, yPos, z).add(dir);
            mesh.lookAt(target);

            if (type === 'arrow') {
                mesh.rotateY(-Math.PI / 2);
                mesh.rotateX(-Math.PI / 4);
            } else if (type === 'slash') {
                mesh.rotateX(-60 * (Math.PI / 180));
                mesh.rotateZ(Math.PI / 5);
            }

            object = mesh;
        } else {
            // FIREBALL: Keep as Sprite (Billboard)
            const material = new THREE.SpriteMaterial({
                map: texture,
                color: 0xffffff
            });
            const sprite = new THREE.Sprite(material);
            sprite.position.set(x, 1, z);
            sprite.scale.set(0.8, 0.8, 1);
            object = sprite;
        }

        this.scene.add(object);

        // Base range is roughly 3 tiles (0.5s life at speed 12).
        // Plus 1 extra tile per range level (tileSize = 2 / speed 12 = +0.16s).
        const baseLife = type === 'slash' ? 0.15 : 3.0;
        const lifeBonus = type === 'slash' ? (rangeMod - 1) * 0.12 : 0;

        this.projectiles.push({
            sprite: object,
            dir: dir.clone(),
            life: baseLife + lifeBonus,
            speed: type === 'slash' ? 12.0 : (type === 'fireball' ? 6.0 : 8.0),
            type: type,
            isPlayer: isPlayer
        });
    }

    public playerHit(damage: number, srcPos: THREE.Vector3) {
        const event = new CustomEvent('playerDamaged', {
            detail: { damage, srcPos }
        });
        window.dispatchEvent(event);
    }

    public checkAttack(attackBox: THREE.Box3, damage: number = 1) {
        for (let i = this.activeEntities.length - 1; i >= 0; i--) {
            const entity = this.activeEntities[i];
            const entityBox = new THREE.Box3().setFromObject(entity.sprite);

            if (attackBox.intersectsBox(entityBox)) {
                const center = new THREE.Vector3();
                attackBox.getCenter(center);
                const knockDir = new THREE.Vector3().subVectors(entity.sprite.position, center).normalize();
                knockDir.y = 0;

                this.damageEntity(i, damage, knockDir);
            }
        }
    }

    private damageEntity(index: number, damage: number, knockDir: THREE.Vector3) {
        const entity = this.activeEntities[index];

        if (entity.data.type === 'person') return;

        if (typeof entity.data.properties.hp !== 'number') entity.data.properties.hp = 10;

        entity.data.properties.hp -= damage;

        entity.sprite.material.color.setHex(0xff0000);
        setTimeout(() => {
            if (entity.sprite) entity.sprite.material.color.setHex(0xffffff);
        }, 100);

        const shove = knockDir.clone().multiplyScalar(1.5);

        // Simple collision check for shove
        const targetPos = entity.sprite.position.clone().add(shove);
        const gx = Math.floor(targetPos.x / 2);
        const gy = Math.floor(targetPos.z / 2);

        if (this.currentWalls) {
            if (gx >= 0 && gx < this.currentWalls.length && gy >= 0 && gy < this.currentWalls[0].length && !this.currentWalls[gx][gy]) {
                entity.sprite.position.add(shove);
            }
        } else {
            entity.sprite.position.add(shove);
        }

        entity.data.x = Math.floor(entity.sprite.position.x / 2);
        entity.data.y = Math.floor(entity.sprite.position.z / 2);

        console.log(`Hit ${entity.data.type}! HP: ${entity.data.properties.hp}`);

        if (entity.data.properties.hp <= 0) {
            this.scene.remove(entity.sprite);
            this.activeEntities.splice(index, 1);

            const event = new CustomEvent('entityKilled', { detail: entity.data });
            window.dispatchEvent(event);
        }
    }

    private checkLineOfSight(start: THREE.Vector3, end: THREE.Vector3, walls: boolean[][]): boolean {
        const dist = start.distanceTo(end);
        const dir = new THREE.Vector3().subVectors(end, start).normalize();
        const steps = Math.ceil(dist * 2);

        for (let i = 0; i < steps; i++) {
            const p = start.clone().add(dir.clone().multiplyScalar(i * 0.5));
            const gx = Math.floor(p.x / 2);
            const gy = Math.floor(p.z / 2);

            if (gx >= 0 && gx < walls.length && gy >= 0 && gy < walls[0].length) {
                if (walls[gx][gy]) return false;
            }
        }
        return true;
    }

    public update(playerCamera: THREE.Camera, walls: boolean[][], delta: number) {
        this.currentWalls = walls;
        const playerPos = playerCamera.position;
        const now = Date.now();

        // --- FOLLOWER LOGIC ---
        if (this.follower) {
            const f = this.follower;
            const fPos = f.sprite.position;

            // Distance to player
            const dx = playerPos.x - fPos.x;
            const dz = playerPos.z - fPos.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            // Follow if too far (> 3 units)
            if (dist > 3) {
                const moveSpeed = 4.0 * delta;
                const dirX = dx / dist;
                const dirZ = dz / dist;

                fPos.x += dirX * moveSpeed;
                fPos.z += dirZ * moveSpeed;
            }
        }

        // --- UPDATE PROJECTILES ---
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.life -= delta;
            p.sprite.position.add(p.dir.clone().multiplyScalar(p.speed * delta));

            // Collision with walls
            const gx = Math.floor(p.sprite.position.x / 2);
            const gy = Math.floor(p.sprite.position.z / 2);
            if (gx >= 0 && gx < walls.length && gy >= 0 && gy < walls[0].length && walls[gx][gy]) {
                p.life = -1; // Kill
            }

            if (p.isPlayer) {
                // Collision with Enemies
                for (let eIdx = this.activeEntities.length - 1; eIdx >= 0; eIdx--) {
                    const checkEnt = this.activeEntities[eIdx];
                    if (checkEnt.data.type !== 'person' && checkEnt.data.type !== 'chest' && p.sprite.position.distanceTo(checkEnt.sprite.position) < 1.0) {
                        // Assuming damage is stored somewhere accessible, or injected later. 
                        // For now base projectile damage off rangeMod is not needed, we pass it via main.ts. 
                        // But since we lost direct strength linkage here, let's assume 1 or pass it in.
                        // Actually, we should store `damage` on the projectile object!
                        // In `spawnProjectile` we didn't add a damage param. We will default to 1 here and fix it next.
                        const damage = (p as any).damage || 1;
                        this.damageEntity(eIdx, damage, p.dir.clone());
                        p.life = -1; // Kill projectile
                    }
                }
            } else {
                // Collision with Player
                if (p.sprite.position.distanceTo(playerPos) < 1.0) {
                    this.playerHit(2, p.sprite.position);
                    p.life = -1; // Kill projectile
                }
            }

            if (p.life <= 0) {
                this.scene.remove(p.sprite);
                this.projectiles.splice(i, 1);
            }
        }

        this.activeEntities.forEach(entity => {
            const startPos = entity.sprite.position.clone();
            entity.anim.isMoving = false;
            const enemyTemplate = this.gameConfig?.enemies?.find((e: any) => e.id === entity.data.type);
            let speed = enemyTemplate?.speed || 2.0;
            const dist = entity.sprite.position.distanceTo(playerPos);
            const dir = new THREE.Vector3();
            let ignoreWalls = false;

            // Attack Player (Contact Damage)
            if (entity.data.type !== 'person' && entity.data.type !== 'chest' && dist < 1.5) {
                this.playerHit(1, entity.sprite.position);
            }

            // Initialize Properties
            if (!entity.data.properties) entity.data.properties = {};
            if (entity.data.properties.hp === undefined) entity.data.properties.hp = 10;

            // --- AI BEHAVIOR TERMINAL ---
            switch (entity.data.type) {
                case 'person':
                    speed = 0.5;
                    if (Math.random() < 0.01) {
                        entity.data.properties.wanderingDir = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
                    }
                    if (Math.random() < 0.05) {
                        entity.data.properties.wanderingDir = null; // Stop
                    }
                    if (entity.data.properties.wanderingDir) {
                        dir.copy(entity.data.properties.wanderingDir);
                    }
                    break;

                case 'slime':
                    if (Math.random() < 0.02) {
                        entity.data.properties.wanderingDir = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
                    }
                    if (entity.data.properties.wanderingDir) {
                        dir.copy(entity.data.properties.wanderingDir);
                    }
                    break;

                case 'snake':
                    if (!entity.data.properties.currentDir) {
                        const dirs = [
                            new THREE.Vector3(1, 0, 0),
                            new THREE.Vector3(-1, 0, 0),
                            new THREE.Vector3(0, 0, 1),
                            new THREE.Vector3(0, 0, -1)
                        ];
                        entity.data.properties.currentDir = dirs[Math.floor(Math.random() * dirs.length)];
                    }
                    dir.copy(entity.data.properties.currentDir);
                    break;

                case 'dude':
                case 'chick':
                    let aggro = entity.data.properties.aggro || false;
                    if (!aggro) {
                        if (Math.random() < 0.02) {
                            entity.data.properties.wanderingDir = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
                        }
                        if (entity.data.properties.wanderingDir) dir.copy(entity.data.properties.wanderingDir);
                        if (dist < 15 && this.checkLineOfSight(entity.sprite.position, playerPos, walls)) {
                            aggro = true;
                            entity.data.properties.aggro = true;
                        }
                    }
                    if (aggro) {
                        dir.subVectors(playerPos, entity.sprite.position).normalize();
                    }
                    break;

                case 'skeleton':
                    const desiredDist = 8.0;
                    if (dist > desiredDist + 1) {
                        dir.subVectors(playerPos, entity.sprite.position).normalize();
                    } else if (dist < desiredDist - 1) {
                        dir.subVectors(entity.sprite.position, playerPos).normalize();
                    }
                    const los = this.checkLineOfSight(entity.sprite.position, playerPos, walls);
                    if (dist < 15 && los) {
                        if (!entity.data.properties.shootTimer) entity.data.properties.shootTimer = 0;
                        entity.data.properties.shootTimer += delta;
                        if (entity.data.properties.shootTimer > 2.0) {
                            const shootDir = new THREE.Vector3().subVectors(playerPos, entity.sprite.position).normalize();
                            this.spawnProjectile(entity.sprite.position.x, entity.sprite.position.z, shootDir, 'arrow');
                            entity.data.properties.shootTimer = 0;
                            dir.set(0, 0, 0);
                        }
                    }
                    break;

                case 'soldier':
                    if (dist < 20) {
                        dir.subVectors(playerPos, entity.sprite.position).normalize();
                    }
                    break;

                case 'mushroom':
                    const toMushroom = new THREE.Vector3().subVectors(entity.sprite.position, playerPos).normalize();
                    const playerLook = new THREE.Vector3();
                    playerCamera.getWorldDirection(playerLook);
                    const dot = playerLook.dot(toMushroom);
                    const isSeen = (dot > 0.5 && dist < 20) && this.checkLineOfSight(entity.sprite.position, playerPos, walls);

                    if (!isSeen) {
                        dir.subVectors(playerPos, entity.sprite.position).normalize();
                    } else {
                        speed = 0;
                    }
                    break;

                case 'bat':
                    ignoreWalls = true;
                    if (dist < 15) {
                        dir.subVectors(playerPos, entity.sprite.position).normalize();
                        const bob = Math.sin(now / 200) * 0.5;
                        entity.sprite.position.y = 1 + bob;
                    } else {
                        if (Math.random() < 0.05) dir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
                    }
                    break;

                case 'druid':
                    if (Math.random() < 0.02) {
                        entity.data.properties.wanderingDir = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
                    }
                    if (entity.data.properties.wanderingDir) dir.copy(entity.data.properties.wanderingDir);
                    if (dist < 3.0) {
                        if (Math.random() < 0.1) {
                            const angle = Math.random() * Math.PI * 2;
                            const blinkDist = 5 + Math.random() * 5;
                            const tx = entity.sprite.position.x + Math.cos(angle) * blinkDist;
                            const tz = entity.sprite.position.z + Math.sin(angle) * blinkDist;
                            const gx = Math.floor(tx / 2);
                            const gy = Math.floor(tz / 2);
                            const inBounds = gx >= 0 && gx < walls.length && gy >= 0 && gy < walls[0].length;
                            if (inBounds && !walls[gx][gy]) {
                                entity.sprite.position.set(tx, 1, tz);
                            }
                        }
                        dir.subVectors(entity.sprite.position, playerPos).normalize();
                    }
                    if (dist < 12 && this.checkLineOfSight(entity.sprite.position, playerPos, walls)) {
                        if (!entity.data.properties.shootTimer) entity.data.properties.shootTimer = 0;
                        entity.data.properties.shootTimer += delta;
                        if (entity.data.properties.shootTimer > 3.0) {
                            const shootDir = new THREE.Vector3().subVectors(playerPos, entity.sprite.position).normalize();
                            this.spawnProjectile(entity.sprite.position.x, entity.sprite.position.z, shootDir, 'fireball');
                            entity.data.properties.shootTimer = 0;
                            dir.set(0, 0, 0);
                        }
                    }
                    break;

                default:
                    if (Math.random() < 0.01) dir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
                    break;
            }

            // Apply Movement
            if (dir.lengthSq() > 0) {
                dir.y = 0;
                const tryMove = (vec: THREE.Vector3): boolean => {
                    const testPos = entity.sprite.position.clone().add(vec);
                    const radius = 0.5;
                    const checkPoints = [
                        testPos,
                        new THREE.Vector3(testPos.x + radius, 0, testPos.z),
                        new THREE.Vector3(testPos.x - radius, 0, testPos.z),
                        new THREE.Vector3(testPos.x, 0, testPos.z + radius),
                        new THREE.Vector3(testPos.x, 0, testPos.z - radius)
                    ];
                    if (!ignoreWalls) {
                        for (const p of checkPoints) {
                            const gx = Math.floor(p.x / 2);
                            const gy = Math.floor(p.z / 2);
                            if (gx < 0 || gx >= walls.length || gy < 0 || gy >= walls[0].length || walls[gx][gy]) {
                                return false;
                            }
                        }
                    }
                    return true;
                };

                const fullMove = dir.clone().multiplyScalar(speed * delta);
                let attemptMove = true;
                if (entity.data.type === 'snake') {
                    if (!tryMove(fullMove)) {
                        entity.data.properties.currentDir = null;
                        attemptMove = false;
                    }
                }
                if (attemptMove) {
                    if (tryMove(fullMove)) {
                        entity.sprite.position.add(fullMove);
                    } else {
                        const moveX = new THREE.Vector3(fullMove.x, 0, 0);
                        const moveZ = new THREE.Vector3(0, 0, fullMove.z);
                        if (Math.abs(fullMove.x) > Math.abs(fullMove.z)) {
                            if (Math.abs(fullMove.x) > 0.001 && tryMove(moveX)) entity.sprite.position.add(moveX);
                            else if (Math.abs(fullMove.z) > 0.001 && tryMove(moveZ)) entity.sprite.position.add(moveZ);
                        } else {
                            if (Math.abs(fullMove.z) > 0.001 && tryMove(moveZ)) entity.sprite.position.add(moveZ);
                            else if (Math.abs(fullMove.x) > 0.001 && tryMove(moveX)) entity.sprite.position.add(moveX);
                        }
                    }
                }
            }

            // Calculate ACTUAL movement
            const actualMove = new THREE.Vector3().subVectors(entity.sprite.position, startPos);
            const moveLen = actualMove.lengthSq();

            if (moveLen > 0.000001) {
                entity.anim.isMoving = true;
                entity.data.x = Math.floor(entity.sprite.position.x / 2);
                entity.data.y = Math.floor(entity.sprite.position.z / 2);

                const moveDir = actualMove.clone().normalize();
                const toCamera = new THREE.Vector3().subVectors(playerPos, entity.sprite.position).normalize();
                const dot = moveDir.dot(toCamera);

                if (dot > 0.5) {
                    entity.anim.direction = 'down';
                    entity.sprite.scale.x = Math.abs(entity.sprite.scale.x);
                } else if (dot < -0.5) {
                    entity.anim.direction = 'up';
                    entity.sprite.scale.x = Math.abs(entity.sprite.scale.x);
                } else {
                    entity.anim.direction = 'side';
                    const up = new THREE.Vector3(0, 1, 0);
                    const viewRight = new THREE.Vector3().crossVectors(up, toCamera).normalize();
                    const sideComp = moveDir.dot(viewRight);
                    (entity.anim as any).facingLeft = sideComp < 0;

                    if (entity.data.type === 'person') {
                        entity.sprite.scale.x = Math.abs(entity.sprite.scale.x);
                    } else {
                        if (sideComp < 0) entity.sprite.scale.x = -Math.abs(entity.sprite.scale.x);
                        else entity.sprite.scale.x = Math.abs(entity.sprite.scale.x);
                    }
                }
            } else {
                entity.anim.isMoving = false;
            }

            // Global Time Animation Loop
            if (entity.anim.isMoving) {
                // Period = 180ms per frame (approx 5.5 fps)
                const frameDuration = 180;
                const offset = (entity.data.x + entity.data.y) * 100;
                const globalFrame = Math.floor((now + offset) / frameDuration) % 4;
                entity.anim.frame = globalFrame;

                if (entity.data.properties.sprite) {
                    // Person logic handled below
                } else {
                    const frameMap = [0, 1, 0, 2];
                    const textureFrame = frameMap[entity.anim.frame];
                    const newTex = this.getTextureForState(entity.data.type, entity.anim.direction, textureFrame);
                    if (newTex) entity.sprite.material.map = newTex;
                }
            } else {
                entity.anim.frame = 0;
                if (!entity.data.properties.sprite) {
                    const newTex = this.getTextureForState(entity.data.type, entity.anim.direction, 0);
                    if (newTex) entity.sprite.material.map = newTex;
                }
            }

            // Person Skin Logic
            if (entity.data.type === 'person' && entity.data.properties.sprite) {
                let row = 0;
                let skin = 0;
                const match = entity.data.properties.sprite.match(/character_(\d+)_(\d+)/);
                if (match) {
                    row = parseInt(match[1]);
                    skin = parseInt(match[2]);
                } else {
                    const matchOld = entity.data.properties.sprite.match(/character_(\d+)/);
                    if (matchOld) skin = parseInt(matchOld[1]);
                }

                const baseCol = skin * 3;
                let offset = 2; // Down
                if (entity.anim.direction === 'up') offset = 0;
                else if (entity.anim.direction === 'side') offset = 1;

                if (entity.anim.direction === 'side') {
                    if ((entity.anim as any).facingLeft) {
                        entity.sprite.scale.x = -Math.abs(entity.sprite.scale.x);
                    } else {
                        entity.sprite.scale.x = Math.abs(entity.sprite.scale.x);
                    }
                }

                const finalCol = baseCol + offset;
                const key = `character_${row}_${finalCol}`;
                const newTex = this.assetManager.getTexture(key);
                if (newTex) entity.sprite.material.map = newTex;
            }
        });
    }

    public getEntityByPersonId(personId: string): any | null {
        return this.activeEntities.find(e => e.data.properties && e.data.properties.personId === personId);
    }

    public checkForInteraction(playerPos: THREE.Vector3): EntityData | null {
        for (const entity of this.activeEntities) {
            if (entity.data.type === 'person') {
                const dist = entity.sprite.position.distanceTo(playerPos);
                if (dist < 2.5) {
                    return entity.data;
                }
            }
        }
        return null;
    }
}
