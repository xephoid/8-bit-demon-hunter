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
    private entities: THREE.Group;
    private tileSize: number = 2;

    private aliveEntities: EntityState[] = [];
    private currentWalls: boolean[][] | null = null;

    public get activeEntities(): EntityData[] {
        return this.aliveEntities.map(e => e.data);
    }

    private projectiles: any[] = [];
    private dummyTexture: THREE.Texture;

    constructor(scene: THREE.Scene, assetManager: AssetManager) {
        this.scene = scene;
        this.assetManager = assetManager;
        this.entities = new THREE.Group();
        this.scene.add(this.entities);

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
        this.aliveEntities = [];
        this.entities.clear();
        this.projectiles = []; // Clear projectiles
        entitiesData.forEach(data => this.spawnEntity(data));
    }

    public spawnEntity(data: EntityData) {
        // Initial texture (Down 0)
        let texture;
        if (data.properties && data.properties.sprite) {
            texture = this.assetManager.getTexture(data.properties.sprite);
            // If direct resolution fails, try resolving as a Character Base ID (e.g. "character_0")
            if (!texture && data.properties.sprite.startsWith("character_")) {
                texture = this.assetManager.getTexture(`${data.properties.sprite}_2`); // Default to Down (2)
            }
        } else {
            texture = this.getTextureForState(data.type, 'down', 0);
        }
        if (texture) {
            const material = new THREE.SpriteMaterial({ map: texture });
            const sprite = new THREE.Sprite(material);

            sprite.position.set(
                data.x * this.tileSize,
                1,
                data.y * this.tileSize
            );
            sprite.scale.set(1.5, 1.5, 1);

            // --- NPC LABEL LOGIC ---
            if (data.type === 'person') {
                const label = this.createNameLabel(data.name, data.properties.hasMet ? '#888888' : '#ffffff');
                label.position.set(0, 1.2, 0); // Above head
                sprite.add(label); // Attach to parent sprite
            }

            this.entities.add(sprite);
            this.aliveEntities.push({
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
        const entityState = this.aliveEntities.find(e => e.data.properties.personId === personId);
        if (entityState && entityState.sprite.children.length > 0) {
            // Assume child 0 is label
            const oldLabel = entityState.sprite.children[0];
            entityState.sprite.remove(oldLabel);

            // Recreate with new color
            const newLabel = this.createNameLabel(entityState.data.name, hasMet ? '#888888' : '#ffffff');
            newLabel.position.set(0, 1.2, 0);
            entityState.sprite.add(newLabel);
        }
    }

    private getTextureForState(type: string, direction: string, frame: number): THREE.Texture | undefined {
        const key = `enemy_${type}_${direction}_${frame}`;
        return this.assetManager.getTexture(key) || this.assetManager.getTexture(`enemy_${type}`); // Fallback
    }

    private spawnProjectile(x: number, z: number, dir: THREE.Vector3, type: 'fireball' | 'arrow') {
        const textureKey = type === 'fireball' ? 'projectile_fireball' : 'projectile_arrow';
        const texture = this.assetManager.getTexture(textureKey) || this.dummyTexture;

        let object: THREE.Object3D;

        if (type === 'arrow') {
            // ARROW: Use Mesh (Plane) to orient in 3D
            const geometry = new THREE.PlaneGeometry(1, 1);
            const material = new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                side: THREE.DoubleSide
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(x, 1, z);

            // Orient arrow
            // Texture points LEFT (-X). We want -X to point along 'dir'.
            // 1. Look at target direction
            const target = new THREE.Vector3(x, 1, z).add(dir);
            mesh.lookAt(target);

            // 2. Fix Orientation
            // lookAt aligns +Z to target. 
            // We want -X (Left of texture) to point to target (+Z of local).
            // Rotate Y by -90 deg? (-PI/2). X becomes Z. -X becomes -Z.
            // Rotate Y by +90 deg? (+PI/2). X becomes -Z. -X becomes Z.
            // So Rotate Y +90.
            mesh.rotateY(-Math.PI / 2);

            // 3. User requested "angle down" so player can see it
            // Rotate around Z (which is now pointing Side relative to motion) or X?
            // "Angled down": Pitch up/down.
            // Local X is now "up" or "side"?
            // Let's just tilt the plane.
            mesh.rotateX(-Math.PI / 4); // Tilt 45 degrees

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

        this.projectiles.push({
            sprite: object, // Renamed property conceptually, but JS is loose. Let's keep name 'sprite' or rename to 'mesh' in interface? 
            // The update loop uses .sprite.position. Object3D has position. Safe.
            dir: dir.clone(),
            life: 3.0, // seconds
            speed: type === 'fireball' ? 6.0 : 8.0,
            type: type
        });
    }

    public playerHit(damage: number, srcPos: THREE.Vector3) {
        const event = new CustomEvent('playerDamaged', {
            detail: { damage, srcPos }
        });
        window.dispatchEvent(event);
    }

    public checkAttack(attackBox: THREE.Box3, damage: number = 1) {
        console.log("checkAttack called!", "Entities:", this.aliveEntities.length);
        for (let i = this.aliveEntities.length - 1; i >= 0; i--) {
            const entity = this.aliveEntities[i];
            const entityBox = new THREE.Box3().setFromObject(entity.sprite);

            // Debugging Hitboxes
            // console.log("Checking:", entity.data.type, entityBox.min, entityBox.max);

            if (attackBox.intersectsBox(entityBox)) {
                console.log("HIT!", entity.data.type, "HP:", entity.data.properties.hp);
                const center = new THREE.Vector3();
                attackBox.getCenter(center);
                const knockDir = new THREE.Vector3().subVectors(entity.sprite.position, center).normalize();
                knockDir.y = 0;

                this.damageEntity(i, damage, knockDir);
            }
        }
    }

    private damageEntity(index: number, damage: number, knockDir: THREE.Vector3) {
        const entity = this.aliveEntities[index];

        // Prevent attacking NPCs (Friendly Fire)
        if (entity.data.type === 'person') return;

        // Ensure HP exists
        if (typeof entity.data.properties.hp !== 'number') entity.data.properties.hp = 10;

        entity.data.properties.hp -= damage;

        entity.sprite.material.color.setHex(0xff0000);
        setTimeout(() => {
            if (entity.sprite) entity.sprite.material.color.setHex(0xffffff);
        }, 100);

        // Knockback with Collision Check
        const shove = knockDir.clone().multiplyScalar(1.5);

        // Simple collision check for shove
        const targetPos = entity.sprite.position.clone().add(shove);
        const gx = Math.round(targetPos.x / 2);
        const gy = Math.round(targetPos.z / 2);

        // We need access to walls here. 
        // Since we don't have walls stored in class, we can't check easily?
        // Wait, update() passes walls. We should store walls in the class or pass them to damageEntity?
        // Better: We can just raycast or check the target tile.
        // Actually, let's just use the current position if target is invalid.
        // Issue: damageEntity is called from checkAttack, which DOES NOT have walls.
        // Solution: Store walls in update() to a private property? Or pass walls to checks.

        // Let's store walls temporarily or pass them. 
        // Refactor: Add `walls` to class property in `update` or `checkAttack`?
        // `checkAttack` is called from main.ts... which call entityManager.checkAttack(bbox, dmg).
        // main.ts HAS worldData.walls.
        // I should update checkAttack signature to accept walls, or store walls in EntityManager on update.
        // Let's store walls in EntityManager when update is called.

        if (this.currentWalls) {
            if (gx >= 0 && gx < this.currentWalls.length && gy >= 0 && gy < this.currentWalls[0].length && !this.currentWalls[gx][gy]) {
                entity.sprite.position.add(shove);
            }
        } else {
            // Fallback if no walls known (shouldn't happen if update called first)
            entity.sprite.position.add(shove);
        }

        entity.data.x = entity.sprite.position.x / 2;
        entity.data.y = entity.sprite.position.z / 2;

        console.log(`Hit ${entity.data.type}! HP: ${entity.data.properties.hp}`);

        if (entity.data.properties.hp <= 0) {
            this.entities.remove(entity.sprite);
            this.aliveEntities.splice(index, 1);

            // Dispatch Kill Event
            const event = new CustomEvent('entityKilled', { detail: entity.data });
            window.dispatchEvent(event);
        }
    }

    private checkLineOfSight(start: THREE.Vector3, end: THREE.Vector3, walls: boolean[][]): boolean {
        // Simple raycast step
        const dist = start.distanceTo(end);
        const dir = new THREE.Vector3().subVectors(end, start).normalize();
        const steps = Math.ceil(dist * 2); // 2 steps per unit

        for (let i = 0; i < steps; i++) {
            const p = start.clone().add(dir.clone().multiplyScalar(i * 0.5));
            const gx = Math.round(p.x / 2); // Assuming tileSize = 2
            const gy = Math.round(p.z / 2);

            if (gx >= 0 && gx < walls.length && gy >= 0 && gy < walls[0].length) {
                if (walls[gx][gy]) return false;
            }
        }
        return true;
    }

    public update(playerCamera: THREE.Camera, walls: boolean[][]) {
        this.currentWalls = walls;
        const playerPos = playerCamera.position;
        const delta = 0.016; // Approx 60fps
        const frameTime = 0.2; // Seconds per frame
        const now = Date.now();

        // --- UPDATE PROJECTILES ---
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.life -= delta;
            p.sprite.position.add(p.dir.clone().multiplyScalar(p.speed * delta));

            // Collision with walls
            const gx = Math.round(p.sprite.position.x / 2);
            const gy = Math.round(p.sprite.position.z / 2);
            if (gx >= 0 && gx < walls.length && gy >= 0 && gy < walls[0].length && walls[gx][gy]) {
                p.life = -1; // Kill
            }

            // Collision with Player
            if (p.sprite.position.distanceTo(playerPos) < 1.0) {
                this.playerHit(2, p.sprite.position);
                p.life = -1; // Kill projectile
            }

            if (p.life <= 0) {
                this.scene.remove(p.sprite);
                this.projectiles.splice(i, 1);
            }
        }

        this.aliveEntities.forEach(entity => {
            const startPos = entity.sprite.position.clone();
            entity.anim.isMoving = false;
            let speed = 2.0;
            const dist = entity.sprite.position.distanceTo(playerPos);
            const dir = new THREE.Vector3();
            let ignoreWalls = false;

            // Attack Player (Contact Damage)
            // Only enemies deal contact damage
            if (entity.data.type !== 'person' && entity.data.type !== 'chest' && dist < 1.5) {
                this.playerHit(1, entity.sprite.position);
            }

            // Initialize Properties
            if (!entity.data.properties) entity.data.properties = {};
            // Ensure HP if missing (client-side safety)
            if (entity.data.properties.hp === undefined) entity.data.properties.hp = 10;

            // --- AI BEHAVIOR TERMINAL ---
            switch (entity.data.type) {
                case 'person':
                    // PERSON: Wander very slowly, stop often
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
                    // BLOBS: Move Randomly
                    speed = 1.0;
                    if (Math.random() < 0.02) {
                        entity.data.properties.wanderingDir = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
                    }
                    if (entity.data.properties.wanderingDir) {
                        dir.copy(entity.data.properties.wanderingDir);
                    }
                    break;

                case 'snake':
                    // SNAKE: Cardinal Patrol (Change on wall hit)
                    speed = 3.5;

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
                    // Direction change is handled in collision block ONLY
                    break;

                case 'dude':
                case 'chick':
                    // BANDITS: Meander, Attack on Sight
                    speed = 1.0;

                    // Check logic
                    let aggro = entity.data.properties.aggro || false;

                    if (!aggro) {
                        // Wander
                        if (Math.random() < 0.02) {
                            entity.data.properties.wanderingDir = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
                        }
                        if (entity.data.properties.wanderingDir) dir.copy(entity.data.properties.wanderingDir);

                        // Check sight
                        if (dist < 15 && this.checkLineOfSight(entity.sprite.position, playerPos, walls)) {
                            aggro = true;
                            entity.data.properties.aggro = true;
                        }
                    }

                    if (aggro) {
                        speed = 3.5;
                        dir.subVectors(playerPos, entity.sprite.position).normalize();
                    }
                    break;

                case 'skeleton':
                    // SKELETON: Keep Distance, Shoot Arrows
                    const desiredDist = 8.0;
                    speed = 2.0;

                    if (dist > desiredDist + 1) {
                        dir.subVectors(playerPos, entity.sprite.position).normalize();
                    } else if (dist < desiredDist - 1) {
                        dir.subVectors(entity.sprite.position, playerPos).normalize();
                    }

                    // Shoot
                    const los = this.checkLineOfSight(entity.sprite.position, playerPos, walls);
                    if (dist < 15 && los) {
                        if (!entity.data.properties.shootTimer) entity.data.properties.shootTimer = 0;
                        entity.data.properties.shootTimer += delta;
                        if (entity.data.properties.shootTimer > 2.0) { // Shoot every 2s
                            const shootDir = new THREE.Vector3().subVectors(playerPos, entity.sprite.position).normalize();
                            this.spawnProjectile(entity.sprite.position.x, entity.sprite.position.z, shootDir, 'arrow');
                            entity.data.properties.shootTimer = 0;
                            // Stop moving while shooting
                            dir.set(0, 0, 0);
                        }
                    }
                    break;

                case 'soldier': // Undead Knight
                    // FAST CHASE
                    speed = 4.5;
                    if (dist < 20) {
                        dir.subVectors(playerPos, entity.sprite.position).normalize();
                    }
                    break;

                case 'mushroom':
                    // MUSHROOM: "Weeping Angel" (Follow if not in sight)
                    // Check if player is looking at mushroom
                    const toMushroom = new THREE.Vector3().subVectors(entity.sprite.position, playerPos).normalize();
                    const playerLook = new THREE.Vector3();
                    playerCamera.getWorldDirection(playerLook);
                    const dot = playerLook.dot(toMushroom);

                    const isSeen = (dot > 0.5 && dist < 20) && this.checkLineOfSight(entity.sprite.position, playerPos, walls); // In FOV and no walls

                    if (!isSeen) {
                        speed = 3.0; // Fast when not seen!
                        dir.subVectors(playerPos, entity.sprite.position).normalize();
                    } else {
                        speed = 0; // Frozen
                    }

                    // Swarm logic (optional extra: if close to others, attack? For now just chase)
                    break;

                case 'bat':
                    // BAT: Flying
                    speed = 3.0;
                    ignoreWalls = true;
                    if (dist < 15) {
                        dir.subVectors(playerPos, entity.sprite.position).normalize();
                        const bob = Math.sin(now / 200) * 0.5;
                        entity.sprite.position.y = 1 + bob;
                    } else {
                        if (Math.random() < 0.05) dir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
                    }
                    break;

                case 'druid': // WIZARD
                    // WIZARD: Wander, Teleport, Fireball
                    speed = 1.5;

                    // Wander
                    if (Math.random() < 0.02) {
                        entity.data.properties.wanderingDir = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
                    }
                    if (entity.data.properties.wanderingDir) dir.copy(entity.data.properties.wanderingDir);

                    // Teleport if too close (panic)
                    if (dist < 3.0) {
                        if (Math.random() < 0.1) {
                            // Attempt Blink
                            const angle = Math.random() * Math.PI * 2;
                            const blinkDist = 5 + Math.random() * 5;
                            const tx = entity.sprite.position.x + Math.cos(angle) * blinkDist;
                            const tz = entity.sprite.position.z + Math.sin(angle) * blinkDist;

                            // Simple bounds check (should check walls properly but for now just move)
                            entity.sprite.position.set(tx, 1, tz);
                        }
                        dir.subVectors(entity.sprite.position, playerPos).normalize(); // Also run
                    }

                    // Fireball
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
                    // Fallback
                    if (Math.random() < 0.01) dir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
                    break;
            }

            // Apply Movement with Sliding Collision
            if (dir.lengthSq() > 0) {
                dir.y = 0;
                // We try full move, if blocked, try sliding components

                const tryMove = (vec: THREE.Vector3): boolean => {
                    const testPos = entity.sprite.position.clone().add(vec);
                    const radius = 0.5; // Entity radius

                    // Check corners/edges
                    const checkPoints = [
                        testPos, // Center
                        new THREE.Vector3(testPos.x + radius, 0, testPos.z),
                        new THREE.Vector3(testPos.x - radius, 0, testPos.z),
                        new THREE.Vector3(testPos.x, 0, testPos.z + radius),
                        new THREE.Vector3(testPos.x, 0, testPos.z - radius)
                    ];

                    if (!ignoreWalls) {
                        for (const p of checkPoints) {
                            const gx = Math.round(p.x / 2);
                            const gy = Math.round(p.z / 2);

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
                        // Hit wall -> Stop and Pick next frame
                        entity.data.properties.currentDir = null;
                        attemptMove = false;
                    }
                }

                if (attemptMove) {
                    if (tryMove(fullMove)) {
                        entity.sprite.position.add(fullMove);
                    } else {
                        // Try Sliding 
                        const moveX = new THREE.Vector3(fullMove.x, 0, 0);
                        const moveZ = new THREE.Vector3(0, 0, fullMove.z);

                        if (Math.abs(fullMove.x) > Math.abs(fullMove.z)) {
                            if (Math.abs(fullMove.x) > 0.001 && tryMove(moveX)) {
                                entity.sprite.position.add(moveX);
                            } else if (Math.abs(fullMove.z) > 0.001 && tryMove(moveZ)) {
                                entity.sprite.position.add(moveZ);
                            }
                        } else {
                            if (Math.abs(fullMove.z) > 0.001 && tryMove(moveZ)) {
                                entity.sprite.position.add(moveZ);
                            } else if (Math.abs(fullMove.x) > 0.001 && tryMove(moveX)) {
                                entity.sprite.position.add(moveX);
                            }
                        }
                    }
                }
            }

            // Calculate ACTUAL movement to determine animation/facing
            const actualMove = new THREE.Vector3().subVectors(entity.sprite.position, startPos);
            const moveLen = actualMove.lengthSq();

            if (moveLen > 0.000001) {
                entity.anim.isMoving = true;

                // Update internal data pos
                entity.data.x = entity.sprite.position.x / 2;
                entity.data.y = entity.sprite.position.z / 2;

                // Update Direction based on View-Relative Movement (Doom-style)
                const moveDir = actualMove.clone().normalize();
                const toCamera = new THREE.Vector3().subVectors(playerPos, entity.sprite.position).normalize();

                // 1. Forward/Back check (Dot Product)
                // dot > 0.5: Moving towards camera (Front/Down)
                // dot < -0.5: Moving away from camera (Back/Up)
                // else: Side
                const dot = moveDir.dot(toCamera);

                if (dot > 0.5) {
                    entity.anim.direction = 'down'; // Front
                    entity.sprite.scale.x = Math.abs(entity.sprite.scale.x);
                } else if (dot < -0.5) {
                    entity.anim.direction = 'up'; // Back
                    entity.sprite.scale.x = Math.abs(entity.sprite.scale.x);
                } else {
                    entity.anim.direction = 'side'; // Side

                    // 2. Side Flip Check
                    const up = new THREE.Vector3(0, 1, 0);
                    const viewRight = new THREE.Vector3().crossVectors(up, toCamera).normalize();
                    const sideComp = moveDir.dot(viewRight);

                    // Track side for Person logic
                    (entity.anim as any).facingLeft = sideComp < 0;

                    if (entity.data.type === 'person') {
                        // PERSON: Never flip scale, use specific sprites
                        entity.sprite.scale.x = Math.abs(entity.sprite.scale.x);
                    } else {
                        // MONSTER: Flip if moving left
                        if (sideComp < 0) {
                            entity.sprite.scale.x = -Math.abs(entity.sprite.scale.x);
                        } else {
                            entity.sprite.scale.x = Math.abs(entity.sprite.scale.x);
                        }
                    }
                }
            } else {
                entity.anim.isMoving = false;
            }

            // Animation Loop
            if (entity.anim.isMoving) {
                entity.anim.timer += delta;
                if (entity.anim.timer > frameTime) {
                    entity.anim.timer = 0;
                    entity.anim.frame = (entity.anim.frame + 1) % 3;

                    if (entity.data.properties.sprite) {
                        // Static sprite, or use sprite property + direction if needed?
                        // For now, assume static or handled elsewhere. 
                        // Actually, characters are static in this implementation?
                    } else {
                        const newTex = this.getTextureForState(entity.data.type, entity.anim.direction, entity.anim.frame);
                        if (newTex) entity.sprite.material.map = newTex;
                    }

                } else {
                    // Return to idle frame (1) if stopped
                    if (entity.anim.frame !== 1) {
                        entity.anim.frame = 1;
                        if (!entity.data.properties.sprite) {
                            const newTex = this.getTextureForState(entity.data.type, entity.anim.direction, 1);
                            if (newTex) entity.sprite.material.map = newTex;
                        } else if (entity.data.type === 'person') {
                            // Manual Person Animation
                            // properties.sprite is like "character_X" (Base ID)
                            // Textures are: 
                            // character_X_0 = Back (Up)
                            // character_X_1 = Side (Right) -> Flip for Left
                            // character_X_2 = Front (Down)

                            const match = entity.data.properties.sprite.match(/character_(\d+)/);
                            if (match) {
                                const charId = match[1];
                                let dirIdx = 2; // Default Down

                                if (entity.anim.direction === 'up') {
                                    dirIdx = 0;
                                } else if (entity.anim.direction === 'side') {
                                    dirIdx = 1;
                                    // Check explicit side from scale or velocity?
                                    // Scale was already set in the movement block:
                                    // if sideComp < 0 (LEFT), scale.x is NEGATIVE.
                                    // if sideComp > 0 (RIGHT), scale.x is POSITIVE.

                                    // If we use specific Side sprite (Right-facing):
                                    // Left Move (Negative Scale) -> Flips Right Sprite -> Looks Left. CORRECT.
                                    // Right Move (Positive Scale) -> Normal Right Sprite -> Looks Right. CORRECT.

                                    // So we just need to ensure scale is correct in movement block (it is).
                                    // And here we just select idx 1.
                                } else {
                                    // Down
                                    dirIdx = 2;
                                }

                                const key = `character_${charId}_${dirIdx}`;
                                const newTex = this.assetManager.getTexture(key);
                                if (newTex) {
                                    entity.sprite.material.map = newTex;
                                    // Scale control is handled in movement block, 
                                    // but we need to ensure UP/DOWN are not flipped?
                                    // Actually, if we moved Left, scale is -1.
                                    // If we then stop, or move Down...
                                    // Down sprite should probably not be flipped?
                                    // Usually Down/Up sprites are symmetric, so flipping doesn't matter much, 
                                    // BUT if they have handedness (holding item), it does.
                                    // For now, let's reset scale if not side?

                                    if (entity.anim.direction !== 'side') {
                                        entity.sprite.scale.x = Math.abs(entity.sprite.scale.x);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });
    }

    public getEntityByPersonId(personId: string): any | null {
        return this.aliveEntities.find(e => e.data.properties && e.data.properties.personId === personId);
    }

    public checkForInteraction(playerPos: THREE.Vector3): EntityData | null {
        for (const entity of this.aliveEntities) {
            if (entity.data.type === 'person') { // Only people are interactable for now
                const dist = entity.sprite.position.distanceTo(playerPos);
                if (dist < 2.5) { // 2.5 units range
                    return entity.data;
                }
            }
        }
        return null;
    }
}
