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

    /** Called when any non-person entity takes a hit. Receives the entity type. */
    public onEntityHit: ((type: string) => void) | null = null;
    /** Called when a druid (wizard) successfully teleports. */
    public onEntityTeleport: (() => void) | null = null;
    /** Called when an enemy fires a projectile. Receives the projectile type. */
    public onEntityShoot: ((type: 'fireball' | 'arrow' | 'evil' | 'eye_lazer') => void) | null = null;
    /** Called once when the demon boss transitions to phase 2 (minion summon). */
    public onDemonPhase2: (() => void) | null = null;
    /** Called the moment the demon's death animation begins (before it finishes). */
    public onDemonDying: (() => void) | null = null;
    /** World position of the arena centre — set by main.ts when building the arena. */
    public arenaCenter: { x: number; z: number } = { x: 31, z: 31 };

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
        this.projectiles.forEach(p => this.scene.remove(p.sprite));
        this.projectiles = [];

        if (this.follower) {
            this.scene.remove(this.follower.sprite);
            this.follower = null;
        }

        entitiesData.forEach(data => this.spawnEntity(data));
    }

    public addEntity(data: EntityData): void {
        this.spawnEntity(data);
    }

    /** Instantly remove all non-person entities and clear all projectiles (e.g. on demon kill). */
    public clearEnemies(): void {
        for (let i = this.activeEntities.length - 1; i >= 0; i--) {
            const e = this.activeEntities[i];
            if (e.data.type !== 'person') {
                this.scene.remove(e.sprite);
                this.activeEntities.splice(i, 1);
            }
        }
        this.projectiles.forEach(p => this.scene.remove(p.sprite));
        this.projectiles.length = 0;
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
        } else if (data.type === 'chest_temple') {
            const templeType = data.properties?.templeType ?? '';
            texture = this.assetManager.getTexture(`chest_temple_${templeType}_closed`)
                   ?? this.assetManager.getTexture('chest_brown_closed');
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
            const TEMPLE_ENEMY_TYPES = ['bee', 'man_eater_flower', 'arachne', 'eyeball', 'fire_skull'];
            const spriteScale = data.type === 'demon' ? 5.0
                : TEMPLE_ENEMY_TYPES.includes(data.type) ? 3.0
                : data.type === 'chest_temple' ? 2.0
                : 1.5;
            sprite.scale.set(spriteScale, spriteScale, 1);

            // Chest starts hidden until all temple enemies are cleared
            if (data.type === 'chest_temple') sprite.visible = false;

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

    /** Make the temple chest visible (called when all temple enemies are defeated).
     *  Returns the chest's grid position for the minimap, or null if not found. */
    public revealTempleChest(): { x: number; y: number } | null {
        const chest = this.activeEntities.find(e => e.data.type === 'chest_temple');
        if (!chest) return null;
        chest.sprite.visible = true;
        return { x: chest.data.x, y: chest.data.y };
    }

    /** Return the chest entity data if the player is within 3 units and the chest is visible. */
    public checkForChest(playerPos: THREE.Vector3): EntityData | null {
        for (const entity of this.activeEntities) {
            if (entity.data.type === 'chest_temple' && entity.sprite.visible) {
                if (entity.sprite.position.distanceTo(playerPos) < 3) {
                    return entity.data;
                }
            }
        }
        return null;
    }

    /** Switch chest to open texture then remove it from the scene after a brief delay. */
    public collectTempleChest(templeType: string): void {
        const idx = this.activeEntities.findIndex(e => e.data.type === 'chest_temple');
        if (idx === -1) return;
        const chest = this.activeEntities[idx];
        const openTex = this.assetManager.getTexture(`chest_temple_${templeType}_open`);
        if (openTex) (chest.sprite.material as THREE.SpriteMaterial).map = openTex;
        setTimeout(() => {
            this.scene.remove(chest.sprite);
            const i = this.activeEntities.indexOf(chest);
            if (i !== -1) this.activeEntities.splice(i, 1);
        }, 600);
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

    public spawnProjectile(x: number, z: number, dir: THREE.Vector3, type: 'fireball' | 'arrow' | 'slash' | 'evil' | 'eye_lazer', isPlayer: boolean = false, rangeMod: number = 1, spawnY?: number, sourceType?: string) {
        let textureKey = type === 'fireball' ? 'projectile_fireball' : (type === 'evil' ? 'projectile_evil_0' : 'projectile_arrow');
        if (type === 'slash') textureKey = 'slash';
        if (type === 'eye_lazer') {
            const absDx = Math.abs(dir.x), absDz = Math.abs(dir.z);
            if (absDx >= absDz) textureKey = dir.x > 0 ? 'eye_lazer_right' : 'eye_lazer_side';
            else textureKey = dir.z > 0 ? 'eye_lazer_down' : 'eye_lazer_up';
        }

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
            const yPos = spawnY !== undefined ? spawnY : (type === 'slash' ? 1.0 : 1.5);
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
            sprite.position.set(x, spawnY ?? 1, z);
            sprite.scale.set(0.8, 0.8, 1);
            object = sprite;
        }

        this.scene.add(object);

        // Base range is roughly 3 tiles (0.5s life at speed 12).
        // Plus 1 extra tile per range level (tileSize = 2 / speed 12 = +0.16s).
        const baseLife = type === 'slash' ? 0.15 : 3.0;
        const lifeBonus = type === 'slash' ? (rangeMod - 1) * 0.12 : 0;

        const proj: any = {
            sprite: object,
            dir: dir.clone(),
            life: baseLife + lifeBonus,
            speed: type === 'slash' ? 12.0 : (type === 'fireball' ? 6.0 : (type === 'evil' ? 16.0 : (type === 'eye_lazer' ? 10.0 : 8.0))),
            type: type,
            isPlayer: isPlayer,
            sourceType: sourceType
        };
        if (type === 'evil') {
            proj.evilAnimTimer = 0;
            proj.evilAnimFrame = 0;
        }
        this.projectiles.push(proj);
    }

    public playerHit(damage: number, srcPos: THREE.Vector3, sourceType?: string) {
        const event = new CustomEvent('playerDamaged', {
            detail: { damage, srcPos, sourceType }
        });
        window.dispatchEvent(event);
    }

    /** Damage all non-person entities within radiusWorld units of center. Used by fire bombs. */
    public damageInRadius(center: THREE.Vector3, radiusWorld: number, damage: number): void {
        for (let i = this.activeEntities.length - 1; i >= 0; i--) {
            const entity = this.activeEntities[i];
            if (entity.data.type === 'person' || entity.data.type === 'chest_temple') continue;
            const dist = entity.sprite.position.distanceTo(center);
            if (dist <= radiusWorld) {
                const knockDir = new THREE.Vector3().subVectors(entity.sprite.position, center).normalize();
                knockDir.y = 0;
                this.damageEntity(i, damage, knockDir);
            }
        }
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
        this.onEntityHit?.(entity.data.type);

        entity.sprite.material.color.setHex(0xff0000);
        setTimeout(() => {
            if (entity.sprite) entity.sprite.material.color.setHex(0xffffff);
        }, 100);

        knockDir.y = 0;
        if (knockDir.lengthSq() > 0) knockDir.normalize();
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
            if (entity.data.type === 'demon') {
                // Demon dies via death animation pass, not instant removal
                if (!entity.data.properties.isDying) {
                    entity.data.properties.isDying = true;
                    entity.data.properties.deathFrame = 0;
                    entity.data.properties.deathTimer = 0;
                    this.onDemonDying?.(); // fire immediately so sound plays at animation start
                }
            } else {
                this.scene.remove(entity.sprite);
                this.activeEntities.splice(index, 1);
                const event = new CustomEvent('entityKilled', { detail: entity.data });
                window.dispatchEvent(event);
            }
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

    public update(playerCamera: THREE.Camera, walls: boolean[][], delta: number, agility: number = 1) {
        this.currentWalls = walls;
        const playerPos = playerCamera.position;
        const now = Date.now();

        // --- FOLLOWER LOGIC ---
        if (this.follower) {
            const f = this.follower;
            const fPos = f.sprite.position;

            const dx = playerPos.x - fPos.x;
            const dz = playerPos.z - fPos.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist > 3) {
                // Match player terminal velocity: (baseAcc + scalingAcc * agility) / friction
                const terminalVelocity = (150.0 + 50.0 * Math.min(agility, 5)) / 10;
                const moveSpeed = terminalVelocity * delta;
                const dirX = dx / dist;
                const dirZ = dz / dist;
                fPos.x += dirX * moveSpeed;
                fPos.z += dirZ * moveSpeed;

                f.anim.isMoving = true;

                // Direction relative to camera
                const toCamera = new THREE.Vector3().subVectors(playerPos, fPos).normalize();
                const moveDir = new THREE.Vector3(dirX, 0, dirZ);
                const dot = moveDir.dot(toCamera);
                if (dot > 0.5) {
                    f.anim.direction = 'down';
                } else if (dot < -0.5) {
                    f.anim.direction = 'up';
                } else {
                    f.anim.direction = 'side';
                    (f.anim as any).facingLeft = dirX < 0;
                }

                // Walk frame cycle (same 180ms clock as entities, offset by position for desync)
                const offset = ((f.data.x ?? 0) + (f.data.y ?? 0)) * 100;
                f.anim.frame = Math.floor((now + offset) / 180) % 4;
            } else {
                f.anim.isMoving = false;
                f.anim.frame = 0;
            }

            // Apply animated sprite texture
            const followerSpriteId: string = (f.data as any).sprite ?? f.data.properties?.sprite;
            if (followerSpriteId) {
                this.applyPersonSprite(f, followerSpriteId);
            }
        }

        // --- UPDATE PROJECTILES ---
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.life -= delta;
            p.sprite.position.add(p.dir.clone().multiplyScalar(p.speed * delta));

            // Animate evil projectile frames
            if (p.evilAnimFrame !== undefined) {
                p.evilAnimTimer += delta;
                if (p.evilAnimTimer > 0.08) {
                    p.evilAnimTimer = 0;
                    p.evilAnimFrame = (p.evilAnimFrame + 1) % 7;
                    const eMat = (p.sprite as THREE.Sprite).material as THREE.SpriteMaterial;
                    if (eMat) {
                        eMat.map = this.assetManager.getTexture(`projectile_evil_${p.evilAnimFrame}`) || eMat.map;
                        eMat.needsUpdate = true;
                    }
                }
            }

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
                    const _hitDx = p.sprite.position.x - checkEnt.sprite.position.x;
                    const _hitDy = p.sprite.position.y - checkEnt.sprite.position.y;
                    const _hitDz = p.sprite.position.z - checkEnt.sprite.position.z;
                    if (checkEnt.data.type !== 'person' && checkEnt.data.type !== 'chest' && Math.sqrt(_hitDx * _hitDx + _hitDy * _hitDy + _hitDz * _hitDz) < 1.5) {
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
                    this.playerHit(2, p.sprite.position, p.sourceType);
                    p.life = -1; // Kill projectile
                }
            }

            if (p.life <= 0) {
                this.scene.remove(p.sprite);
                this.projectiles.splice(i, 1);
            }
        }

        // Death animation pass — must run before main AI loop
        for (let di = this.activeEntities.length - 1; di >= 0; di--) {
            const dying = this.activeEntities[di];
            if (!dying.data.properties.isDying) continue;
            dying.data.properties.deathTimer += delta;
            if (dying.data.properties.deathTimer > 0.12) {
                dying.data.properties.deathTimer = 0;
                dying.data.properties.deathFrame = (dying.data.properties.deathFrame || 0) + 1;
                if (dying.data.properties.deathFrame >= 7) {
                    this.scene.remove(dying.sprite);
                    this.activeEntities.splice(di, 1);
                    window.dispatchEvent(new CustomEvent('entityKilled', { detail: dying.data }));
                } else {
                    const tex = this.assetManager.getTexture(`enemy_demon_death_${dying.data.properties.deathFrame}`);
                    if (tex) { dying.sprite.material.map = tex; dying.sprite.material.needsUpdate = true; }
                }
            }
        }

        this.activeEntities.forEach(entity => {
            if (entity.data.properties.isDying) return; // handled by death animation pass
            const startPos = entity.sprite.position.clone();
            entity.anim.isMoving = false;
            const enemyTemplate = this.gameConfig?.enemies?.find((e: any) => e.id === entity.data.type);
            let speed = enemyTemplate?.speed || 2.0;
            const dist = entity.sprite.position.distanceTo(playerPos);
            const dir = new THREE.Vector3();
            let ignoreWalls = false;

            // Attack Player (Contact Damage)
            if (entity.data.type !== 'person' && entity.data.type !== 'chest' && entity.data.type !== 'chest_temple' && dist < 1.5) {
                const contactDamage = (enemyTemplate as any)?.damage || 1;
                this.playerHit(contactDamage, entity.sprite.position, entity.data.type);
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
                            this.spawnProjectile(entity.sprite.position.x, entity.sprite.position.z, shootDir, 'arrow', false, 1, undefined, entity.data.type);
                            this.onEntityShoot?.('arrow');
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
                                this.onEntityTeleport?.();
                            }
                        }
                        dir.subVectors(entity.sprite.position, playerPos).normalize();
                    }
                    if (dist < 12 && this.checkLineOfSight(entity.sprite.position, playerPos, walls)) {
                        if (!entity.data.properties.shootTimer) entity.data.properties.shootTimer = 0;
                        entity.data.properties.shootTimer += delta;
                        if (entity.data.properties.shootTimer > 3.0) {
                            const shootDir = new THREE.Vector3().subVectors(playerPos, entity.sprite.position).normalize();
                            this.spawnProjectile(entity.sprite.position.x, entity.sprite.position.z, shootDir, 'fireball', false, 1, undefined, entity.data.type);
                            this.onEntityShoot?.('fireball');
                            entity.data.properties.shootTimer = 0;
                            dir.set(0, 0, 0);
                        }
                    }
                    break;

                case 'demon': {
                    const props = entity.data.properties;
                    if (props.attackTimer === undefined) props.attackTimer = 0;
                    if (props.backTimer === undefined) props.backTimer = 0;
                    if (props.flyY === undefined) props.flyY = 0;
                    // Escape flight: fly high and ignore walls until timer expires
                    if ((props.escapeTimer ?? 0) > 0) {
                        props.escapeTimer -= delta;
                        props.flyTarget = 8;
                        ignoreWalls = true;
                    }
                    if (props.flyTarget === undefined) props.flyTarget = 0;
                    if (props.phase2Done === undefined) props.phase2Done = false;
                    if (props.isCharging === undefined) props.isCharging = false;
                    if (!props.chargeDir) props.chargeDir = { x: 0, z: 0 };

                    const dHp = props.hp;
                    props.attackTimer += delta;

                    const maxHp = props.maxHp ?? 30;
                    const phase3Threshold = Math.floor(maxHp / 3);
                    const phase2Threshold = Math.floor(maxHp * 2 / 3);

                    if (dHp <= phase3Threshold) {
                        // Phase 3: charge at close range (faster), fly + 3-spread when far
                        if (dist < 10) {
                            props.flyTarget = Math.max(0, playerPos.y - 2.5);
                            if (!props.isCharging && props.backTimer <= 0) {
                                const cd = new THREE.Vector3().subVectors(playerPos, entity.sprite.position).normalize();
                                props.chargeDir = { x: cd.x, z: cd.z };
                                props.isCharging = true;
                            }
                            if (props.backTimer > 0) {
                                props.backTimer = Math.max(0, props.backTimer - delta);
                                dir.set(-props.chargeDir.x, 0, -props.chargeDir.z);
                                speed = 1.0;
                            } else if (props.isCharging) {
                                dir.set(props.chargeDir.x, 0, props.chargeDir.z);
                                speed = 10.0;
                            }
                        } else {
                            props.flyTarget = 4;
                            props.isCharging = false;
                            if (props.attackTimer > 1.5) {
                                const baseDir = new THREE.Vector3().subVectors(playerPos, entity.sprite.position).normalize();
                                [-15 * Math.PI / 180, 0, 15 * Math.PI / 180].forEach(angle => {
                                    const rotated = baseDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
                                    this.spawnProjectile(entity.sprite.position.x, entity.sprite.position.z, rotated, 'evil', false, 1, entity.sprite.position.y, entity.data.type);
                                });
                                this.onEntityShoot?.('evil');
                                props.attackTimer = 0;
                            }
                            // Slowly pursue while flying
                            {
                                const flySpeed = 2;
                                const fdx = playerPos.x - entity.sprite.position.x;
                                const fdz = playerPos.z - entity.sprite.position.z;
                                const fdLen = Math.sqrt(fdx * fdx + fdz * fdz);
                                if (fdLen > 0.1) {
                                    const tryX = entity.sprite.position.x + (fdx / fdLen) * flySpeed * delta;
                                    const tryZ = entity.sprite.position.z + (fdz / fdLen) * flySpeed * delta;
                                    const fgx = Math.floor(tryX / this.tileSize);
                                    const fgz = Math.floor(tryZ / this.tileSize);
                                    if (!walls[fgx]?.[fgz]) {
                                        entity.sprite.position.x = tryX;
                                        entity.sprite.position.z = tryZ;
                                    }
                                }
                            }
                        }
                    } else if (dHp <= phase2Threshold && !props.phase2Done) {
                        // Phase 2: move to arena centre and summon minions
                        const dcx = this.arenaCenter.x - entity.sprite.position.x;
                        const dcz = this.arenaCenter.z - entity.sprite.position.z;
                        const dcc = Math.sqrt(dcx * dcx + dcz * dcz);
                        if (dcc > 1.5) {
                            dir.set(dcx / dcc, 0, dcz / dcc);
                            speed = 4.0;
                        } else {
                            props.phase2Done = true;
                            this.onDemonPhase2?.();
                        }
                    } else {
                        // Phase 1 (or post-Phase-2 with hp 10-20): charge or ranged
                        if (dist < 10) {
                            props.flyTarget = Math.max(0, playerPos.y - 2.5);
                            if (!props.isCharging && props.backTimer <= 0) {
                                const cd = new THREE.Vector3().subVectors(playerPos, entity.sprite.position).normalize();
                                props.chargeDir = { x: cd.x, z: cd.z };
                                props.isCharging = true;
                            }
                            if (props.backTimer > 0) {
                                props.backTimer = Math.max(0, props.backTimer - delta);
                                dir.set(-props.chargeDir.x, 0, -props.chargeDir.z);
                                speed = 1.0;
                            } else if (props.isCharging) {
                                dir.set(props.chargeDir.x, 0, props.chargeDir.z);
                                speed = 10.0;
                            }
                        } else {
                            // Ranged: fly up, shoot, and slowly pursue
                            props.flyTarget = 6;
                            props.isCharging = false;
                            if (props.attackTimer > 2.0) {
                                const shootDir = new THREE.Vector3().subVectors(playerPos, entity.sprite.position).normalize();
                                this.spawnProjectile(entity.sprite.position.x, entity.sprite.position.z, shootDir, 'evil', false, 1, entity.sprite.position.y, entity.data.type);
                                this.onEntityShoot?.('evil');
                                props.attackTimer = 0;
                            }
                            // Slowly pursue player while flying
                            {
                                const flySpeed = 2;
                                const fdx = playerPos.x - entity.sprite.position.x;
                                const fdz = playerPos.z - entity.sprite.position.z;
                                const fdLen = Math.sqrt(fdx * fdx + fdz * fdz);
                                if (fdLen > 0.1) {
                                    const tryX = entity.sprite.position.x + (fdx / fdLen) * flySpeed * delta;
                                    const tryZ = entity.sprite.position.z + (fdz / fdLen) * flySpeed * delta;
                                    const fgx = Math.floor(tryX / this.tileSize);
                                    const fgz = Math.floor(tryZ / this.tileSize);
                                    if (!walls[fgx]?.[fgz]) {
                                        entity.sprite.position.x = tryX;
                                        entity.sprite.position.z = tryZ;
                                    }
                                }
                            }
                        }
                    }

                    // Smooth fly Y interpolation
                    props.flyY += (props.flyTarget - props.flyY) * Math.min(delta * 6, 1);
                    entity.sprite.position.y = 2.5 + props.flyY;
                    break;
                }

                case 'bee': {
                    const props = entity.data.properties;
                    if (props.flyY === undefined) props.flyY = 0;
                    if (props.flyTarget === undefined) props.flyTarget = 3;
                    if (props.backTimer === undefined) props.backTimer = 0;
                    if (!props.chargeDir) props.chargeDir = { x: 0, z: 0 };

                    if (dist < 8) {
                        props.flyTarget = Math.max(0, playerPos.y - 2.5); // Match player height to attack
                        // Charge — same mechanic as demon phase 1
                        if (!props.isCharging && props.backTimer <= 0) {
                            const cd = new THREE.Vector3().subVectors(playerPos, entity.sprite.position).normalize();
                            props.chargeDir = { x: cd.x, z: cd.z };
                            props.isCharging = true;
                        }
                        if (props.backTimer > 0) {
                            props.backTimer = Math.max(0, props.backTimer - delta);
                            dir.set(-props.chargeDir.x, 0, -props.chargeDir.z);
                            speed = 1.0;
                        } else if (props.isCharging) {
                            dir.set(props.chargeDir.x, 0, props.chargeDir.z);
                            speed = 16.0;
                        }
                    } else {
                        props.flyTarget = 3; // Rise back up while pursuing
                        props.isCharging = false;
                        dir.subVectors(playerPos, entity.sprite.position).normalize();
                        speed = 2.0;
                    }

                    // Smooth fly Y interpolation (same as demon)
                    props.flyY += (props.flyTarget - props.flyY) * Math.min(delta * 6, 1);
                    entity.sprite.position.y = 2.5 + props.flyY;
                    break;
                }

                case 'man_eater_flower': {
                    const props = entity.data.properties;
                    if (!props.isCharging) {
                        speed = 0;
                        // Trigger charge when player is within 5 tiles (10 world units)
                        if (dist < 10) {
                            props.chargeDir = new THREE.Vector3().subVectors(playerPos, entity.sprite.position).normalize();
                            props.isCharging = true;
                        }
                    }
                    if (props.isCharging) {
                        dir.copy(props.chargeDir);
                        speed = 8.0;
                    }
                    break;
                }

                case 'arachne': {
                    const props = entity.data.properties;
                    if (!props.isCharging) {
                        // Wander until player is within 5 tiles (10 world units)
                        if (dist < 10) {
                            props.chargeDir = new THREE.Vector3().subVectors(playerPos, entity.sprite.position).normalize();
                            props.isCharging = true;
                        } else {
                            if (Math.random() < 0.02) {
                                props.wanderingDir = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
                            }
                            if (props.wanderingDir) dir.copy(props.wanderingDir);
                        }
                    }
                    if (props.isCharging) {
                        dir.copy(props.chargeDir);
                        speed = 14.0;
                    }
                    break;
                }

                case 'eyeball': {
                    const props = entity.data.properties;
                    // Wander randomly
                    if (Math.random() < 0.02) {
                        props.wanderingDir = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
                    }
                    if (props.wanderingDir) dir.copy(props.wanderingDir);
                    // Shoot laser within 10 tiles (20 world units)
                    if (dist < 20) {
                        if (!props.shootTimer) props.shootTimer = 0;
                        props.shootTimer += delta;
                        if (props.shootTimer > 3.0) {
                            const shootDir = new THREE.Vector3().subVectors(playerPos, entity.sprite.position).normalize();
                            this.spawnProjectile(entity.sprite.position.x, entity.sprite.position.z, shootDir, 'eye_lazer', false, 1, undefined, entity.data.type);
                            this.onEntityShoot?.('eye_lazer');
                            props.shootTimer = 0;
                            dir.set(0, 0, 0);
                        }
                    }
                    break;
                }

                case 'fire_skull':
                    // Always moving in a fixed direction; wall bounce handled below
                    if (!entity.data.properties.currentDir) {
                        const dirs = [
                            new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
                            new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)
                        ];
                        entity.data.properties.currentDir = dirs[Math.floor(Math.random() * dirs.length)];
                    }
                    dir.copy(entity.data.properties.currentDir);
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
                    const radius = entity.data.type === 'demon' ? 1.5 : 0.5;
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
                if (entity.data.type === 'snake' || entity.data.type === 'fire_skull') {
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

            // Reset charge if man_eater_flower/arachne hit a wall (couldn't move)
            if ((entity.data.type === 'man_eater_flower' || entity.data.type === 'arachne') &&
                entity.data.properties.isCharging && moveLen < 0.00001) {
                entity.data.properties.isCharging = false;
                entity.data.properties.chargeDir = null;
            }

            // Stuck detection: if entity wanted to move but didn't, count frames; escape after ~1 second
            if (dir.lengthSq() > 0 && moveLen < 0.00001) {
                entity.data.properties.stuckFrames = (entity.data.properties.stuckFrames || 0) + 1;
                if (entity.data.properties.stuckFrames >= 60) {
                    entity.data.properties.stuckFrames = 0;
                    if (entity.data.type === 'demon') {
                        // Demon escapes by flying up and ignoring walls for 2 seconds
                        entity.data.properties.escapeTimer = 2.0;
                    } else {
                        // Other enemies snap to nearest clear tile
                        const gx = Math.floor(entity.sprite.position.x / 2);
                        const gy = Math.floor(entity.sprite.position.z / 2);
                        outer: for (let r = 1; r <= 5; r++) {
                            for (let dx = -r; dx <= r; dx++) {
                                for (const dz of [r - Math.abs(dx), -(r - Math.abs(dx))]) {
                                    const nx = gx + dx, nz = gy + dz;
                                    if (nx >= 0 && nx < walls.length && nz >= 0 && nz < walls[0].length && !walls[nx][nz]) {
                                        entity.sprite.position.set(nx * 2 + 1, entity.sprite.position.y, nz * 2 + 1);
                                        break outer;
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
                entity.data.properties.stuckFrames = 0;
            }

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

            // Demon/Bee: detect charge wall/player collision and start back-up
            if ((entity.data.type === 'demon' || entity.data.type === 'bee') && entity.data.properties.isCharging) {
                if (entity.sprite.position.distanceTo(startPos) < 0.02 || dist < 1.5) {
                    entity.data.properties.isCharging = false;
                    entity.data.properties.backTimer = 0.4;
                }
            }

            // Person Skin Logic
            if (entity.data.type === 'person' && entity.data.properties.sprite) {
                this.applyPersonSprite(entity, entity.data.properties.sprite);
            }
        });
    }

    private applyPersonSprite(state: EntityState, spriteId: string) {
        const match = spriteId.match(/character_(\d+)_(\d+)/);
        if (!match) return;
        const baseRow = parseInt(match[1]);
        const skin = parseInt(match[2]);

        const baseCol = skin * 3;
        let dirOffset = 2; // down
        if (state.anim.direction === 'up') dirOffset = 0;
        else if (state.anim.direction === 'side') dirOffset = 1;

        // Horizontal flip for side direction; reset for up/down to avoid stale flip
        if (state.anim.direction === 'side') {
            state.sprite.scale.x = (state.anim as any).facingLeft
                ? -Math.abs(state.sprite.scale.x)
                : Math.abs(state.sprite.scale.x);
        } else {
            state.sprite.scale.x = Math.abs(state.sprite.scale.x);
        }

        const walkFrame = state.anim.isMoving ? state.anim.frame : 0;
        const key = `character_${baseRow + walkFrame}_${baseCol + dirOffset}`;
        const newTex = this.assetManager.getTexture(key);
        if (newTex) state.sprite.material.map = newTex;
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
