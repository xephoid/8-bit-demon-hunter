import { World, IWorld } from '../models/World';
import { gameConfig } from '../config/gameConfig';
import { Town, Person, Occupation, Pet, Color, Item, GameTask, TaskType, Clue, DemonHunterState } from '../../../shared/src/data/GameData';
import { GameState } from './GameState'; // Import the singleton
import { DemonLogic } from './DemonLogic';

export class WorldGenerator {
    private width: number;
    private height: number;

    constructor() {
        this.width = gameConfig.world.width;
        this.height = gameConfig.world.height;
    }

    public async generateDemonHunterWorld(): Promise<any> {
        // 1. Generate Towns
        const towns: Town[] = [];
        const townCount = gameConfig.world.roomCount;
        const townNameRegistry = [...gameConfig.townNameRegistry];
        this.shuffle(townNameRegistry);

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
            town.people = this.generatePeople(town.id, pop);
            towns.push(town);
        }

        // 3. Global Logic (Demon, Clues, Tasks)
        const allPeople = towns.flatMap(t => t.people);
        const puzzleData = DemonLogic.generatePuzzle(towns, allPeople);

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
        GameState.setState(state);

        // Return the MAIN WORLD (Overworld) acting as the hub
        // Return the MAIN WORLD (Overworld) acting as the hub
        // Pass the town IDs so the overworld creates doors to them
        const townDetails = towns.map(t => ({ id: t.id, name: t.name }));
        return this.generateSimpleWorld(townDetails);
    }

    public convertTownToWorld(town: Town): IWorld {
        // Convert Town back to IWorld format for the client
        // Re-generate walls from town data or store them in Town?
        // For now, re-call generateTown to get walls (inefficient but works for prototype)
        const townData = this.generateTown(town.id, town.name);
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

        return new World({
            customId: town.id,
            width: townData.width,
            height: townData.height,
            type: 'city',
            walls: townData.walls,
            doors: townData.doors, // Exits
            spawnPoints: [{ x: 20, y: 37 }],
            entities: entities
        });
    }

    public generatePopulatedTown(id: string, name: string): IWorld {
        const pop = 10;
        const townData = this.generateTown(id, name, pop);
        const people = this.generatePeople(id, pop);

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

    private generatePeople(townId: string, count: number): Person[] {
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

            // Character Sprites
            // 24 Rows (0-23)
            // 26 Skins per Row (0-25) -> Cols = Skin * 3 + [0,1,2]

            // Randomly select a row and skin
            const maxRows = 24;
            const maxSkinsPerRow = 26;

            const row = Math.floor(Math.random() * maxRows);
            const skin = Math.floor(Math.random() * maxSkinsPerRow);

            // Store as "character_ROW_SKIN" so client can parse it
            // Client expects "character_ROW" as base? 
            // Previous fix used: match(/character_(\d+)/) -> treated as ID
            // And calculated: (ID * 3) + 2.

            // New logic needs to conform to what EntityManager expects.
            // EntityManager currently parses: character_(\d+) -> int(ID).
            // Then accesses: character_0_{ID*3 + 2} (Hardcoded 0 row).

            // We need to send a format that EntityManager can parse for ROW and SKIN.
            // OR update EntityManager to handle "character_ROW_SKIN".

            // Let's use format: "character_ROW_SKIN"
            const spriteId = `character_${row}_${skin}`; // e.g. character_5_12

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

        // 2a. Place Town Hall (One, 6x5)
        placeBuilding(6, 5, 'hall', 'hall');

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
            spawnPoints: [{ x: 20, y: 37 }]
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
            const doorX = Math.floor(Math.random() * (this.width - 20)) + 10;
            const doorY = Math.floor(Math.random() * (this.height - 20)) + 10;

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

        // 4. Place Entities (Enemies/NPCs)
        // 4. Place Entities (Enemies/NPCs)
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
                const ex = Math.floor(Math.random() * this.width);
                const ey = Math.floor(Math.random() * this.height);

                if (!walls[ex][ey]) {
                    const tooClose = cities.some(c => Math.sqrt((c.x - ex) ** 2 + (c.y - ey) ** 2) < 8);

                    // Also check neighbors
                    const isClear = !walls[ex + 1][ey] && !walls[ex - 1][ey] && !walls[ex][ey + 1] && !walls[ex][ey - 1];

                    if (!tooClose && isClear) {
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

        // Spawn based on enemy config max values
        gameConfig.enemies.forEach(enemy => {
            for (let i = 0; i < enemy.max; i++) {
                spawnEntity(enemy.id);
            }
        });

        // Calculate safe random spawn point for player
        let playerSpawn = cities[0]; // Fallback
        let spawnAttempts = 0;
        while (spawnAttempts < 500) {
            const sx = Math.floor(Math.random() * (this.width - 2)) + 1;
            const sy = Math.floor(Math.random() * (this.height - 2)) + 1;

            if (!walls[sx][sy] && !walls[sx + 1][sy] && !walls[sx - 1][sy] && !walls[sx][sy + 1] && !walls[sx][sy - 1]) {
                const tooCloseToEnemy = entities.some((e: any) => Math.sqrt((e.x - sx) ** 2 + (e.y - sy) ** 2) < 15);
                if (!tooCloseToEnemy) {
                    playerSpawn = { x: sx, y: sy };
                    break;
                }
            }
            spawnAttempts++;
        }

        const world = new World({
            customId: 'world_main',
            width: this.width,
            height: this.height,
            type: 'world',
            walls: walls,
            doors: doors,
            spawnPoints: [playerSpawn],
            entities: entities
        });

        return world;
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
            if (Math.random() < 0.1) targetSize = Math.floor(Math.random() * 3) + 2;

            this.carveCircle(walls, x, y, targetSize);
        }
    }
}
