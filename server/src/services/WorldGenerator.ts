import { World, IWorld } from '../models/World';
import { gameConfig } from '../config/gameConfig';
import { Town, Person, Occupation, Pet, Color, Item, GameTask, TaskType, Clue, DemonHunterState } from '../../../shared/src/data/GameData';
import { GameState } from './GameState'; // Import the singleton
import { DemonLogic } from './DemonLogic';

export class WorldGenerator {
    private width: number;
    private height: number;
    private townLayoutCache: Map<string, any> = new Map();
    private townPriceCache: Map<string, Record<string, number>> = new Map();

    constructor() {
        this.width = gameConfig.world.width;
        this.height = gameConfig.world.height;
    }

    public clearTownCache(): void {
        this.townLayoutCache.clear();
        this.townPriceCache.clear();
    }

    public async generateDemonHunterWorld(sessionId: string): Promise<any> {
        // Clear cached town layouts so this new game gets fresh building placements
        this.clearTownCache();

        // 1. Generate Towns
        const towns: Town[] = [];
        const townCount = gameConfig.world.roomCount;
        const townNameRegistry = [...gameConfig.townNameRegistry];
        this.shuffle(townNameRegistry);

        // Build a shuffled pool from the skin registry so every NPC gets a distinct, gender-tagged skin
        const skinPool = [...gameConfig.characterSkinRegistry];
        this.shuffle(skinPool);

        for (let i = 0; i < townCount; i++) {
            const name = i < townNameRegistry.length ? townNameRegistry[i] : `Town ${i + 1}`;
            const pop = 10;
            const townData = this.generateTown(`town_${i}`, name, pop);
            // Convert to Town Interface
            const town: Town = {
                id: townData.id,
                name: townData.name,
                x: i * 50, // Separate them in "world space" conceptually?
                y: 0,
                width: townData.width,
                height: townData.height,
                people: []
            };

            // 2. Generate People for this town
            town.people = this.generatePeople(town.id, pop, skinPool);
            towns.push(town);
        }

        // 3. Global Logic (Demon, Clues, Tasks)
        const allPeople = towns.flatMap(t => t.people);
        const puzzleData = DemonLogic.generatePuzzle(towns, allPeople);

        // 3a. Assign FIND_ITEM tasks to all Locksmiths (items are now assigned)
        const allItems = puzzleData.items || [];
        let findItemTaskSeed = 0;
        allPeople.forEach(person => {
            if (person.attributes.occupation === Occupation.Locksmith && allItems.length > 0) {
                const targetPerson = allPeople[findItemTaskSeed % allPeople.length];
                const targetItem = allItems.find((item: Item) => item.id === targetPerson.attributes.item);
                findItemTaskSeed++;
                if (targetItem) {
                    person.task = {
                        id: `task_locksmith_${person.id}`,
                        type: TaskType.FIND_ITEM,
                        targetId: targetItem.id,
                        targetName: targetItem.name,
                        amount: 1,
                        currentAmount: 0,
                        description: `Find who has ${targetItem.name} and report back`,
                        reward: 'CLUE',
                        giverId: person.id,
                        isCompleted: false
                    };
                }
            }
        });

        // 3b. Assign tips & lore — starting town gets game tips, all others get lore
        const tips = [...gameConfig.gameTipsRegistry];
        this.shuffle(tips);
        towns[0].people.forEach((person, i) => {
            person.tip = tips[i % tips.length];
        });
        const lore = [...gameConfig.loreRegistry];
        this.shuffle(lore);
        let loreIdx = 0;
        towns.slice(1).forEach(town => {
            town.people.forEach(person => {
                person.tip = lore[loreIdx++];
            });
        });

        // 4. Save to GameState
        const state: DemonHunterState = {
            demonId: puzzleData.demonId || "",
            knownClues: [],
            activeTask: null,
            towns: towns,
            items: puzzleData.items || [],
            gameOver: false,
            gameWon: false
        };
        GameState.setState(sessionId, state);

        // Return the MAIN WORLD (Overworld) acting as the hub
        // Return the MAIN WORLD (Overworld) acting as the hub
        // Pass the town IDs so the overworld creates doors to them
        const townDetails = towns.map(t => ({ id: t.id, name: t.name }));
        return this.generateSimpleWorld(townDetails);
    }

    public convertTownToWorld(town: Town): IWorld {
        // Use cached layout so re-entering a town gives the same building positions
        let townData = this.townLayoutCache.get(town.id);
        if (!townData) {
            townData = this.generateTown(town.id, town.name);
            this.townLayoutCache.set(town.id, townData);
        }
        const walls = townData.walls;

        // Helper to find safe spot
        const usedSpots = new Set<string>();
        const findSafeSpot = (): { x: number, y: number } => {
            let attempts = 0;
            while (attempts < 100) {
                const x = Math.floor(Math.random() * (townData.width - 2)) + 1;
                const y = Math.floor(Math.random() * (townData.height - 2)) + 1;
                const key = `${x},${y}`;

                // Check Walls (Center + Neighbors)
                const isClear = !walls[x][y] &&
                    !walls[x + 1][y] && !walls[x - 1][y] &&
                    !walls[x][y + 1] && !walls[x][y - 1];

                if (isClear && !usedSpots.has(key)) {
                    usedSpots.add(key);
                    return { x, y };
                }
                attempts++;
            }
            return { x: 5, y: 5 }; // Fallback
        };

        // Convert People to Entities
        const entities = town.people.map(p => {
            const pos = findSafeSpot();
            return {
                type: 'person', // Client needs to handle this
                name: p.name,
                x: pos.x,
                y: pos.y,
                properties: {
                    ...p, // Full Person Data
                    personId: p.id,
                    sprite: p.sprite
                }
            };
        });

        // Add Exit Zone Entity (Visual)? Or handled by Door?
        // Door is handled by client LevelBuilder usually.

        // Build housePeople mapping: door_${townId}_house_${i} -> person.id
        const housePeople: { [key: string]: string } = {};
        town.people.forEach((person, i) => {
            housePeople[`door_${town.id}_house_${i}`] = person.id;
        });

        // Use cached price multipliers so inn prices are consistent across visits
        const resources = ['plant_fiber', 'wood', 'demon_powder', 'demon_ichor', 'iron_ore', 'gold'];
        let priceMultipliers = this.townPriceCache.get(town.id);
        if (!priceMultipliers) {
            priceMultipliers = {};
            for (const r of resources) {
                priceMultipliers[r] = Math.floor(Math.random() * (gameConfig.resources.priceMultiplierMax - gameConfig.resources.priceMultiplierMin + 1)) + gameConfig.resources.priceMultiplierMin;
            }
            this.townPriceCache.set(town.id, priceMultipliers);
        }

        return new World({
            customId: town.id,
            width: townData.width,
            height: townData.height,
            type: 'city',
            walls: townData.walls,
            doors: townData.doors,
            spawnPoints: [{ x: 20, y: 37 }],
            entities: entities,
            housePeople: housePeople,
            innRect: townData.hallRect || undefined,
            priceMultipliers: priceMultipliers
        });
    }

    public generatePopulatedTown(id: string, name: string): IWorld {
        const pop = 10;
        const townData = this.generateTown(id, name, pop);
        const localSkinPool = [...gameConfig.characterSkinRegistry];
        this.shuffle(localSkinPool);
        const people = this.generatePeople(id, pop, localSkinPool);

        // Add people to entities list
        const entities = people.map(p => {
            let placed = false;
            let attempts = 0;
            let ex = 10;
            let ey = 10;

            while (!placed && attempts < 50) {
                ex = Math.floor(Math.random() * (townData.width - 2)) + 1;
                ey = Math.floor(Math.random() * (townData.height - 2)) + 1;

                // Check Wall (and neighbors for safety)
                // We want to ensure they are not IN a wall.
                if (!townData.walls[ex][ey] &&
                    !townData.walls[ex + 1][ey] && !townData.walls[ex - 1][ey] &&
                    !townData.walls[ex][ey + 1] && !townData.walls[ex][ey - 1]) {
                    placed = true;
                }
                attempts++;
            }

            return {
                type: 'person',
                name: p.name,
                x: ex,
                y: ey,
                properties: {
                    ...p, // Full Person Data
                    personId: p.id,
                    sprite: p.sprite,
                    hp: 100,
                }
            };
        });

        return new World({
            customId: id,
            width: townData.width,
            height: townData.height,
            type: 'city',
            // Ensure type is 'city' which LevelBuilder uses for floor_city
            walls: townData.walls,
            doors: townData.doors,
            spawnPoints: [{ x: 20, y: 37 }],
            entities: entities
        });
    }

    private generatePeople(townId: string, count: number, skinPool: Array<{ row: number; skin: number; gender: string }> = []): Person[] {
        const people: Person[] = [];
        const occupations = Object.values(Occupation);

        // Shuffle occupations to ensure uniqueness
        this.shuffle(occupations);

        // Shuffle Name Registry
        const namePool = [...gameConfig.personNameRegistry];
        this.shuffle(namePool);

        for (let i = 0; i < count; i++) {
            // Basic random generation
            let personName = `Person ${i}`;
            let gender = Math.random() > 0.5 ? 'male' : 'female';

            if (namePool.length > 0) {
                const entry = namePool.pop()!;
                personName = entry.name;
                gender = entry.gender;
            }

            const personId = `${townId}_p_${i}`;
            // Assign unique task type if available, else random
            const monsterTypes = gameConfig.enemies.map(e => e.id);
            // Simple deterministic shuffle based on index for variety without full shuffle state in this scope if needed, 
            // but better to use the class shuffle if we can. 
            // Actually, let's just pick one based on index for now to ensure uniqueness in small towns.
            const monsterTypeConf = gameConfig.enemies[i % gameConfig.enemies.length];
            const monsterType = monsterTypeConf.id;
            const monsterName = monsterTypeConf.name || monsterType;
            const monsterToKill = monsterTypeConf.toKill || 3;

            const task = this.generateKillTask(townId, i, monsterType, monsterName, monsterToKill);
            task.giverId = personId;

            // Character Sprites — pick a skin whose gender matches the name's gender
            // Priority: exact gender match → 'either' skin → 'either' name → any remaining
            let skinIdx = skinPool.findIndex(s =>
                s.gender === gender || s.gender === 'either' || gender === 'either'
            );
            if (skinIdx === -1) skinIdx = 0; // fallback: pool nearly exhausted, take anything
            const skinEntry = skinPool.splice(skinIdx, 1)[0] ?? {
                row: Math.random() < 0.5 ? 0 : 12,
                skin: Math.floor(Math.random() * 26),
                gender: 'either'
            };
            const row = skinEntry.row;
            const skin = skinEntry.skin;

            const spriteId = `character_${row}_${skin}`;

            people.push({
                id: personId,
                name: personName,
                sprite: spriteId, // NOW PASSING FULL STRING ID
                attributes: {
                    occupation: occupations[i % occupations.length],
                    pet: Object.values(Pet)[Math.floor(Math.random() * Object.values(Pet).length)] as Pet,
                    color: Object.values(Color)[Math.floor(Math.random() * Object.values(Color).length)] as Color,
                    item: `item_${Math.floor(Math.random() * 5)}`, // Simple item ID generation
                    townId: townId
                },
                isDemon: false,
                clues: {},
                visualClue: "None",
                task: task,
                hasMet: false,
                taskCompleted: false
            });
        }
        return people;
    }

    private generateKillTask(townId: string, seed: number, monsterType: string, monsterName?: string, toKill: number = 3): GameTask {
        const amount = toKill;
        const name = monsterName || monsterType;

        return {
            id: `task_${townId}_${seed}`,
            type: TaskType.KILL,
            targetId: monsterType,
            targetName: name.toUpperCase(),
            amount: amount,
            currentAmount: 0,
            description: `Kill ${amount} ${name}s`,
            reward: 'CLUE', // Default for now
            giverId: "unknown",
            isCompleted: false
        };
    }

    private shuffle(array: any[]) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    private generateTown(id: string, name: string, population: number = 10): any { // Updated Signature
        const width = gameConfig.world.townWidth;
        const height = gameConfig.world.townHeight;
        const walls: boolean[][] = Array(width).fill(false).map(() => Array(height).fill(false));
        const entities: any[] = [];

        // 1. Walls (Perimeter)
        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
                if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
                    walls[x][y] = true;
                }
            }
        }
        const doors: any[] = [
            { x: 20, y: 39, id: `exit_${id}`, target: 'world_main', type: 'exit' } // Exit to world
        ];

        // 2. Dynamic Building Placement
        const buildings: { x: number, y: number, w: number, h: number }[] = [];

        // Helper: Try to place a building
        const placeBuilding = (bw: number, bh: number, type: 'house' | 'hall', idSuffix: string): boolean => {
            let placed = false;
            let attempts = 0;
            while (!placed && attempts < 50) {
                // Random Pos (keep padding from edge 3 units)
                const bx = Math.floor(Math.random() * (width - bw - 6)) + 3;
                const by = Math.floor(Math.random() * (height - bh - 6)) + 3;

                // Check Collisions with other buildings (plus padding)
                const padding = 2; // Space between buildings
                const overlap = buildings.some(b => {
                    return !(bx + bw + padding <= b.x ||
                        bx >= b.x + b.w + padding ||
                        by + bh + padding <= b.y ||
                        by >= b.y + b.h + padding);
                });

                // Also check if overlaps with Exit Door (fixed at 20, 39)
                const exitOverlap = (bx <= 20 && bx + bw >= 20 && by <= 39 && by + bh >= 39);

                if (!overlap && !exitOverlap) {
                    // Place it!
                    buildings.push({ x: bx, y: by, w: bw, h: bh });

                    // Draw Walls
                    for (let i = 0; i < bw; i++) {
                        for (let j = 0; j < bh; j++) {
                            walls[bx + i][by + j] = true;
                        }
                    }

                    // Add Door (Center of bottom face)
                    const doorX = bx + Math.floor(bw / 2);
                    const doorY = by + bh - 1;

                    doors.push({
                        x: doorX,
                        y: doorY,
                        id: `door_${id}_${idSuffix}`,
                        type: 'house', // Hall is also 'house' for visual logic (solid wall)
                    });

                    placed = true;
                }
                attempts++;
            }
            return placed;
        };

        // 2a. Place Town Hall (Inn) — 6x5 building
        let hallRect: { x: number, y: number, w: number, h: number } | null = null;
        const hallDoorBefore = doors.length;
        placeBuilding(6, 5, 'hall', 'hall');
        if (doors.length > hallDoorBefore) {
            // Hall was placed — find it from buildings (last building before houses)
            const hallBuilding = buildings[0]; // hall is placed first
            if (hallBuilding) {
                hallRect = { x: hallBuilding.x, y: hallBuilding.y, w: hallBuilding.w, h: hallBuilding.h };
                // Change the hall door type to 'inn'
                const hallDoor = doors.find((d: any) => d.id === `door_${id}_hall`);
                if (hallDoor) hallDoor.type = 'inn';
            }
        }

        // 2b. Place Houses (Equal to Population)
        for (let i = 0; i < population; i++) {
            // 3x3 Houses
            placeBuilding(3, 3, 'house', `house_${i}`);
        }

        return {
            id,
            name,
            width,
            height,
            type: 'city',
            walls,
            entities,
            doors: doors,
            spawnPoints: [{ x: 20, y: 37 }],
            hallRect: hallRect
        };
    }

    public async generateSimpleWorld(townDetails: { id: string, name: string }[] = []): Promise<IWorld> {
        // 1. Initialize walls
        const walls: boolean[][] = Array(this.width).fill(null).map(() => Array(this.height).fill(true));

        const doors: any[] = [];
        const cities: { x: number, y: number }[] = [];

        // 2. Place Cities (Rooms)
        // If townDetails provided, generate exactly that many rooms. Otherwise default to config.
        const numCities = townDetails.length > 0 ? townDetails.length : gameConfig.world.roomCount;

        for (let i = 0; i < numCities; i++) {
            let doorX: number, doorY: number;
            let cityAttempts = 0;
            do {
                doorX = Math.floor(Math.random() * (this.width - 20)) + 10;
                doorY = Math.floor(Math.random() * (this.height - 20)) + 10;
                cityAttempts++;
            } while (
                cityAttempts < 100 &&
                cities.some(c => Math.sqrt((c.x - doorX) ** 2 + (c.y - doorY) ** 2) < 10)
            );

            this.carveCircle(walls, doorX, doorY, 5);
            cities.push({ x: doorX, y: doorY });

            // Place Door
            // Use target as ID so client sends the town ID directly
            const town = townDetails.length > 0 ? townDetails[i] : { id: `world_${i}`, name: `Town ${i + 1}` };
            const target = town.id;

            doors.push({
                x: doorX,
                y: doorY,
                id: target,
                target: target,
                targetName: town.name // Pass name to client
            });
        }

        // 3. Connect Cities with Paths
        // Connect each city to the next one (0->1, 1->2, etc.) to ensure connectivity
        for (let i = 0; i < cities.length - 1; i++) {
            const start = cities[i];
            const end = cities[i + 1];
            this.carvePath(walls, start.x, start.y, end.x, end.y);
        }

        // Add 3 random waypoints and connect each to its nearest city to expand the world
        const waypoints: { x: number, y: number }[] = [];
        for (let w = 0; w < 3; w++) {
            const wx = Math.floor(Math.random() * (this.width - 20)) + 10;
            const wy = Math.floor(Math.random() * (this.height - 20)) + 10;
            const nearest = cities.reduce((best, c) =>
                Math.sqrt((c.x - wx) ** 2 + (c.y - wy) ** 2) <
                Math.sqrt((best.x - wx) ** 2 + (best.y - wy) ** 2) ? c : best
            );
            this.carvePath(walls, nearest.x, nearest.y, wx, wy);
            waypoints.push({ x: wx, y: wy });
        }

        // 4a. Place 5 temples (not marked on minimap)
        const templeList = [
            { id: 'temple_sky',   name: 'Sky Temple' },
            { id: 'temple_earth', name: 'Earth Temple' },
            { id: 'temple_space', name: 'Space Temple' },
            { id: 'temple_light', name: 'Light Temple' },
            { id: 'temple_fire',  name: 'Fire Temple' },
        ];
        const templeLocs: { x: number, y: number }[] = [];
        for (const temple of templeList) {
            let tx = 0, ty = 0;
            let templeAttempts = 0;
            do {
                tx = Math.floor(Math.random() * (this.width - 20)) + 10;
                ty = Math.floor(Math.random() * (this.height - 20)) + 10;
                templeAttempts++;
            } while (
                templeAttempts < 100 && (
                    cities.some(c => Math.sqrt((c.x - tx) ** 2 + (c.y - ty) ** 2) < 12) ||
                    templeLocs.some(t => Math.sqrt((t.x - tx) ** 2 + (t.y - ty) ** 2) < 12)
                )
            );

            this.carveCircle(walls, tx, ty, 3);
            templeLocs.push({ x: tx, y: ty });

            // Connect to nearest city so the temple is reachable
            const nearest = cities.reduce((best, c) =>
                Math.sqrt((c.x - tx) ** 2 + (c.y - ty) ** 2) <
                Math.sqrt((best.x - tx) ** 2 + (best.y - ty) ** 2) ? c : best
            );
            this.carvePath(walls, nearest.x, nearest.y, tx, ty);

            doors.push({
                x: tx,
                y: ty,
                id: temple.id,
                target: temple.id,
                type: 'temple',
                targetName: temple.name,  // Floating label in world
                noMinimap: true           // Hidden from minimap per design
            });
        }

        // 4. Determine player spawn first so enemy distance rules can reference it
        let playerSpawn = cities[0]; // fallback
        for (let attempt = 0; attempt < 500; attempt++) {
            const sx = Math.floor(Math.random() * (this.width - 2)) + 1;
            const sy = Math.floor(Math.random() * (this.height - 2)) + 1;
            if (!walls[sx][sy] && !walls[sx + 1][sy] && !walls[sx - 1][sy]
                               && !walls[sx][sy + 1] && !walls[sx][sy - 1]) {
                playerSpawn = { x: sx, y: sy };
                break;
            }
        }

        const SPAWN_MIN_DIST: Record<string, number> = {
            slime: 10, mushroom: 15, snake: 20,
            dude: 30, chick: 30, druid: 35, skeleton: 40, soldier: 45,
        };

        // 5. Place Entities (Enemies/NPCs)
        const entities: any[] = [];

        const spawnEntity = (type: string) => {
            let placed = false;
            let attempts = 0;

            // Determine HP and XP
            let hp = 10;
            let xp = 0;
            const enemyConfig = gameConfig.enemies.find(e => e.id === type);
            if (enemyConfig) {
                hp = enemyConfig.hp;
                xp = enemyConfig.xp;
            }

            while (!placed && attempts < 50) {
                const ex = 1 + Math.floor(Math.random() * (this.width - 2));
                const ey = 1 + Math.floor(Math.random() * (this.height - 2));

                if (!walls[ex][ey]) {
                    const minDist = SPAWN_MIN_DIST[type] ?? 10;
                    const tooClose = doors.some(d => Math.sqrt((d.x - ex) ** 2 + (d.y - ey) ** 2) < minDist);
                    const tooCloseToPlayer = Math.sqrt((playerSpawn.x - ex) ** 2 + (playerSpawn.y - ey) ** 2) < minDist;

                    // Also check neighbors
                    const isClear = !walls[ex + 1][ey] && !walls[ex - 1][ey] && !walls[ex][ey + 1] && !walls[ex][ey - 1];

                    if (!tooClose && !tooCloseToPlayer && isClear) {
                        entities.push({
                            type: type,
                            name: `${type}_${entities.length}`,
                            x: ex,
                            y: ey,
                            properties: { hp: hp, xp: xp }
                        });
                        placed = true;
                    }
                }
                attempts++;
            }
        };

        // Spawn bandits as male+female pairs close to each other
        const dudeConfig = gameConfig.enemies.find(e => e.id === 'dude');
        const chickConfig = gameConfig.enemies.find(e => e.id === 'chick');
        const pairCount = Math.min(dudeConfig?.max ?? 0, chickConfig?.max ?? 0);

        const spawnBanditPair = () => {
            // Find anchor for the male
            let ax = -1, ay = -1;
            for (let attempt = 0; attempt < 100; attempt++) {
                const ex = Math.floor(Math.random() * (this.width - 2)) + 1;
                const ey = Math.floor(Math.random() * (this.height - 2)) + 1;
                const tooClose = doors.some(d => Math.sqrt((d.x - ex) ** 2 + (d.y - ey) ** 2) < 8);
                const tooCloseToPlayer = Math.sqrt((playerSpawn.x - ex) ** 2 + (playerSpawn.y - ey) ** 2) < SPAWN_MIN_DIST['dude'];
                if (!walls[ex][ey] && !tooClose && !tooCloseToPlayer &&
                    !walls[ex + 1][ey] && !walls[ex - 1][ey] && !walls[ex][ey + 1] && !walls[ex][ey - 1]) {
                    ax = ex; ay = ey;
                    break;
                }
            }
            if (ax === -1) return;

            entities.push({ type: 'dude', name: `dude_${entities.length}`, x: ax, y: ay, properties: { hp: dudeConfig!.hp, xp: dudeConfig!.xp } });

            // Place female within radius 1-4 of the male
            let placed = false;
            for (let r = 1; r <= 4 && !placed; r++) {
                for (let dx = -r; dx <= r && !placed; dx++) {
                    for (const dy of [r - Math.abs(dx), -(r - Math.abs(dx))]) {
                        const cx = ax + dx, cy = ay + dy;
                        if (cx > 0 && cx < this.width - 1 && cy > 0 && cy < this.height - 1 &&
                            !walls[cx][cy] && !walls[cx + 1][cy] && !walls[cx - 1][cy] && !walls[cx][cy + 1] && !walls[cx][cy - 1]) {
                            entities.push({ type: 'chick', name: `chick_${entities.length}`, x: cx, y: cy, properties: { hp: chickConfig!.hp, xp: chickConfig!.xp } });
                            placed = true;
                            break;
                        }
                    }
                }
            }
            if (!placed) spawnEntity('chick'); // fallback: independent spawn
        };

        for (let i = 0; i < pairCount; i++) spawnBanditPair();

        // Spawn all other enemy types normally (skip bandits, already handled above)
        gameConfig.enemies.forEach(enemy => {
            if (enemy.id === 'dude' || enemy.id === 'chick') return;
            if ((enemy as any).templeOnly) return;
            for (let i = 0; i < (enemy.max ?? 0); i++) {
                spawnEntity(enemy.id);
            }
        });

        // Spawn harvestable plants and trees
        const plantCount = gameConfig.resources.overworldPlantCount;
        const treeCount = gameConfig.resources.overworldTreeCount;

        for (let i = 0; i < plantCount; i++) {
            for (let attempt = 0; attempt < 100; attempt++) {
                const ex = Math.floor(Math.random() * (this.width - 2)) + 1;
                const ey = Math.floor(Math.random() * (this.height - 2)) + 1;
                const tooClose = doors.some(d => Math.sqrt((d.x - ex) ** 2 + (d.y - ey) ** 2) < 5);
                if (!walls[ex][ey] && !tooClose) {
                    entities.push({ type: 'plant', name: `plant_${i}`, x: ex, y: ey, properties: { hp: 1, xp: 0 } });
                    break;
                }
            }
        }

        for (let i = 0; i < treeCount; i++) {
            for (let attempt = 0; attempt < 100; attempt++) {
                const ex = Math.floor(Math.random() * (this.width - 2)) + 1;
                const ey = Math.floor(Math.random() * (this.height - 2)) + 1;
                const tooClose = doors.some(d => Math.sqrt((d.x - ex) ** 2 + (d.y - ey) ** 2) < 5);
                if (!walls[ex][ey] && !tooClose) {
                    entities.push({ type: 'tree', name: `tree_${i}`, x: ex, y: ey, properties: { hp: 4, xp: 0 } });
                    break;
                }
            }
        }

        const skyTempleIdx = 0; // temple_sky is index 0 in templeList
        const rockWalls = this.generateRockWalls(walls, cities, templeLocs, skyTempleIdx, waypoints);

        const world = new World({
            customId: 'world_main',
            width: this.width,
            height: this.height,
            type: 'world',
            walls: walls,
            rockWalls: rockWalls,
            doors: doors,
            spawnPoints: [playerSpawn],
            entities: entities,
            startingDoorId: townDetails.length > 0 ? townDetails[0].id : undefined
        });

        return world;
    }

    public generateTempleMaze(templeId: string): IWorld {
        const mazeW = 40;
        const mazeH = 40;

        // All walls to start
        const walls: boolean[][] = Array(mazeW).fill(null).map(() => Array(mazeH).fill(true));

        // Pick start on a random outer edge (stay 3 tiles from corners for 2x2 carving room)
        const side = Math.floor(Math.random() * 4);
        let sx: number, sy: number;
        let dx: number, dy: number;
        if (side === 0) {
            sx = 1; sy = Math.floor(Math.random() * (mazeH - 8)) + 4;
            dx = 1; dy = 0;
        } else if (side === 1) {
            sx = mazeW - 3; sy = Math.floor(Math.random() * (mazeH - 8)) + 4;
            dx = -1; dy = 0;
        } else if (side === 2) {
            sx = Math.floor(Math.random() * (mazeW - 8)) + 4; sy = 1;
            dx = 0; dy = 1;
        } else {
            sx = Math.floor(Math.random() * (mazeW - 8)) + 4; sy = mazeH - 3;
            dx = 0; dy = -1;
        }

        // Carve a 2x2 block to create 2-tile-wide corridors
        const carve2x2 = (x: number, y: number) => {
            for (let ox = 0; ox < 2; ox++) {
                for (let oy = 0; oy < 2; oy++) {
                    const nx = x + ox, ny = y + oy;
                    if (nx >= 1 && nx < mazeW - 1 && ny >= 1 && ny < mazeH - 1) {
                        walls[nx][ny] = false;
                    }
                }
            }
        };

        const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        let cx = sx, cy = sy;
        carve2x2(cx, cy);

        // Drunken walk: move 2 tiles at a time to maintain 2-wide corridors
        for (let step = 0; step < 500; step++) {
            if (Math.random() < 0.3) {
                [dx, dy] = dirs[Math.floor(Math.random() * 4)];
            }

            const nx = cx + dx * 2;
            const ny = cy + dy * 2;

            if (nx >= 1 && nx < mazeW - 2 && ny >= 1 && ny < mazeH - 2) {
                carve2x2(cx + dx, cy + dy); // connector between steps
                cx = nx; cy = ny;
                carve2x2(cx, cy);
            } else {
                [dx, dy] = dirs[Math.floor(Math.random() * 4)]; // bounce
            }
        }

        const templeType = templeId.replace('temple_', '');

        const enemyTypeMap: Record<string, string> = {
            sky:   'bee',
            earth: 'man_eater_flower',
            space: 'arachne',
            light: 'eyeball',
            fire:  'fire_skull',
        };
        const enemyType = enemyTypeMap[templeType] || 'slime';
        const enemyCfg = gameConfig.enemies.find(e => e.id === enemyType);

        // Pre-calculate door position so it can be used in the spawn distance filter
        let doorX: number, doorY: number;
        if      (side === 0) { doorX = 0;          doorY = sy; }
        else if (side === 1) { doorX = mazeW - 1;  doorY = sy; }
        else if (side === 2) { doorX = sx;          doorY = 0; }
        else                 { doorX = sx;          doorY = mazeH - 1; }

        // Collect open tiles away from start, chest, and door, then shuffle
        const openTiles: { x: number; y: number }[] = [];
        for (let x = 1; x < mazeW - 1; x++) {
            for (let y = 1; y < mazeH - 1; y++) {
                if (!walls[x][y]) {
                    const distStart = Math.abs(x - sx) + Math.abs(y - sy);
                    const distChest = Math.abs(x - cx) + Math.abs(y - cy);
                    const distDoor  = Math.abs(x - doorX) + Math.abs(y - doorY);
                    if (distStart >= 4 && distChest >= 2 && distDoor >= 8) openTiles.push({ x, y });
                }
            }
        }
        for (let i = openTiles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [openTiles[i], openTiles[j]] = [openTiles[j], openTiles[i]];
        }

        const entities: any[] = [{
            type: 'chest_temple',
            name: 'Treasure Chest',
            x: cx,
            y: cy,
            properties: { templeType }
        }];

        const spawnCount = Math.min(enemyCfg?.max ?? 6, openTiles.length);
        for (let i = 0; i < spawnCount; i++) {
            entities.push({
                type: enemyType,
                name: enemyCfg?.name || enemyType,
                x: openTiles[i].x,
                y: openTiles[i].y,
                properties: { hp: enemyCfg?.hp ?? 5, xp: enemyCfg?.xp ?? 3 }
            });
        }

        // Place the exit door at the actual outer boundary wall (never carved by carve2x2)
        // so it sits in the wall rather than floating in the open corridor.
        // (doorX/doorY already calculated above for spawn distance filtering)

        const doors: any[] = [{
            x: doorX,
            y: doorY,
            id: `exit_${templeId}`,
            target: 'world_main',
            type: 'temple_exit'
        }];

        return new World({
            customId: templeId,
            width: mazeW,
            height: mazeH,
            type: 'temple',
            walls,
            doors,
            spawnPoints: [{ x: sx, y: sy }],
            entities
        });
    }

    private generateRockWalls(
        walls: boolean[][],
        cities: { x: number, y: number }[],
        templeLocs: { x: number, y: number }[],
        skyTempleIdx: number,
        waypoints: { x: number, y: number }[] = []
    ): boolean[][] {
        const rockWalls: boolean[][] = Array(this.width).fill(null).map(() => Array(this.height).fill(false));

        // Shape templates: relative [dx, dy] offsets for T and L shapes (4 tiles each)
        const shapeTemplates: [number, number][][] = [
            [[0,0],[1,0],[2,0],[1,1]],   // T down
            [[0,0],[1,0],[2,0],[1,-1]],  // T up
            [[0,0],[0,1],[0,2],[1,1]],   // T right
            [[0,0],[0,1],[0,2],[-1,1]],  // T left
            [[0,0],[0,1],[0,2],[1,2]],   // L
            [[0,0],[0,1],[0,2],[-1,2]],  // J
            [[0,0],[1,0],[0,1],[0,2]],   // L rotated
            [[0,0],[1,0],[1,1],[1,2]],   // L mirror
        ];

        const placeShape = (cx: number, cy: number, intoWalls: boolean) => {
            const shape = shapeTemplates[Math.floor(Math.random() * shapeTemplates.length)];
            for (const [dx, dy] of shape) {
                const tx = cx + dx, ty = cy + dy;
                if (tx > 0 && tx < this.width - 1 && ty > 0 && ty < this.height - 1) {
                    if (intoWalls) walls[tx][ty] = true;
                    rockWalls[tx][ty] = true;
                }
            }
        };

        const distToNearest = (x: number, y: number, locs: { x: number, y: number }[]) =>
            locs.reduce((min, l) => Math.min(min, Math.sqrt((l.x - x) ** 2 + (l.y - y) ** 2)), Infinity);

        // a) 10 small T/L clusters placed in existing wall tiles, ≥8 tiles from any clearing
        const allClearings = [...cities, ...templeLocs];
        let placed = 0;
        let attempts = 0;
        while (placed < 10 && attempts < 2000) {
            attempts++;
            const x = 2 + Math.floor(Math.random() * (this.width - 4));
            const y = 2 + Math.floor(Math.random() * (this.height - 4));
            if (walls[x][y] && distToNearest(x, y, allClearings) >= 8) {
                placeShape(x, y, false); // tiles are already walls; just mark rockWalls
                placed++;
            }
        }

        // b) ~5 T/L formations in open (carved) path areas, far from any town/temple
        placed = 0;
        attempts = 0;
        while (placed < 5 && attempts < 2000) {
            attempts++;
            const x = 2 + Math.floor(Math.random() * (this.width - 4));
            const y = 2 + Math.floor(Math.random() * (this.height - 4));
            const distToCities = distToNearest(x, y, cities);
            const distToTemples = distToNearest(x, y, templeLocs);
            if (!walls[x][y] && distToCities >= 15 && distToTemples >= 9) {
                placeShape(x, y, true); // re-block these tiles as rock walls
                placed++;
            }
        }

        // c) Large rock clusters in the 3 waypoint clearings
        for (const wp of waypoints) {
            const shapeCount = 3 + Math.floor(Math.random() * 3); // 3–5 shapes per clearing
            for (let i = 0; i < shapeCount; i++) {
                const ox = Math.floor(Math.random() * 9) - 4; // offset –4 to +4
                const oy = Math.floor(Math.random() * 9) - 4;
                placeShape(wp.x + ox, wp.y + oy, true);
            }
        }

        // d) Sky temple rock wall ring (radius 10–15), blocks path forcing bomb use
        if (skyTempleIdx < templeLocs.length) {
            const st = templeLocs[skyTempleIdx];
            const ringRadius = 10 + Math.floor(Math.random() * 6); // 10–15
            for (let x = st.x - (ringRadius + 3); x <= st.x + (ringRadius + 3); x++) {
                for (let y = st.y - (ringRadius + 3); y <= st.y + (ringRadius + 3); y++) {
                    if (x <= 0 || x >= this.width - 1 || y <= 0 || y >= this.height - 1) continue;
                    const dist = Math.sqrt((st.x - x) ** 2 + (st.y - y) ** 2);
                    if (dist >= ringRadius && dist <= ringRadius + 2) {
                        walls[x][y] = true;
                        rockWalls[x][y] = true;
                    }
                }
            }
        }

        return rockWalls;
    }

    private carveCircle(walls: boolean[][], x: number, y: number, radius: number) {
        for (let i = x - radius; i <= x + radius; i++) {
            for (let j = y - radius; j <= y + radius; j++) {
                if (i >= 0 && i < this.width && j >= 0 && j < this.height) {
                    if (Math.sqrt((x - i) ** 2 + (y - j) ** 2) <= radius) {
                        walls[i][j] = false;
                    }
                }
            }
        }
    }

    private carvePath(walls: boolean[][], x1: number, y1: number, x2: number, y2: number) {
        let x = x1;
        let y = y1;
        let targetSize = 3;

        while (x !== x2 || y !== y2) {
            // Move towards target
            if (x < x2) x++;
            else if (x > x2) x--;

            if (y < y2) y++;
            else if (y > y2) y--;

            // Wiggle radius
            if (Math.random() < 0.1) targetSize = Math.floor(Math.random() * 10) + 2;

            this.carveCircle(walls, x, y, targetSize);
        }
    }
}
