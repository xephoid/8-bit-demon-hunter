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
        const townCount = 3; // Start with 3 towns
        for (let i = 0; i < townCount; i++) {
            const townData = this.generateTown(`town_${i}`, `Town ${i + 1}`);
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
            town.people = this.generatePeople(town.id, 10);
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

        // Convert People to Entities
        const entities = town.people.map(p => ({
            type: 'person', // Client needs to handle this
            name: p.name,
            x: Math.floor(Math.random() * 30) + 5, // Random pos for now
            y: Math.floor(Math.random() * 30) + 5,
            properties: {
                ...p, // Full Person Data
                personId: p.id,
                sprite: p.sprite
            }
        }));

        return new World({
            customId: town.id,
            width: townData.width,
            height: townData.height,
            type: 'city',
            walls: townData.walls,
            doors: townData.doors, // Exits
            spawnPoints: [{ x: 10, y: 10 }],
            entities: entities
        });
    }

    public generatePopulatedTown(id: string, name: string): IWorld {
        const townData = this.generateTown(id, name);
        const people = this.generatePeople(id, 10);

        // Add people to entities list
        const entities = people.map(p => {
            let placed = false;
            let attempts = 0;
            let ex = 10;
            let ey = 10;

            while (!placed && attempts < 50) {
                ex = Math.floor(Math.random() * (townData.width - 2)) + 1;
                ey = Math.floor(Math.random() * (townData.height - 2)) + 1;

                // Check Wall
                if (!townData.walls[ex][ey]) {
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
            width: townData.width,
            height: townData.height,
            type: 'city',
            // Ensure type is 'city' which LevelBuilder uses for floor_city
            walls: townData.walls,
            doors: townData.doors,
            spawnPoints: [{ x: 10, y: 10 }],
            entities: entities
        });
    }

    private generatePeople(townId: string, count: number): Person[] {
        const people: Person[] = [];
        const occupations = Object.values(Occupation);

        // Shuffle occupations to ensure uniqueness
        this.shuffle(occupations);

        for (let i = 0; i < count; i++) {
            // Basic random generation
            const gender = Math.random() > 0.5 ? 'male' : 'female';

            const personId = `${townId}_p_${i}`;
            // Assign unique task type if available, else random
            const monsterTypes = ['slime', 'snake', 'skeleton', 'mushroom', 'soldier'];
            // Simple deterministic shuffle based on index for variety without full shuffle state in this scope if needed, 
            // but better to use the class shuffle if we can. 
            // Actually, let's just pick one based on index for now to ensure uniqueness in small towns.
            const monsterType = monsterTypes[i % monsterTypes.length];

            const task = this.generateKillTask(townId, i, monsterType);
            task.giverId = personId;

            // Character Sprites (0-7 available)
            // ensuring uniqueness per town
            const spriteId = i % 8; // Iterate through 0-7, repeat if needed (towns have 10 people)

            people.push({
                id: personId,
                name: `Person ${i}`,
                sprite: `character_${spriteId}`, // Base sprite ID
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

    private generateKillTask(townId: string, seed: number, monsterType: string): GameTask {
        const amount = 3 + (seed % 3); // 3 to 5

        return {
            id: `task_${townId}_${seed}`,
            type: TaskType.KILL,
            targetId: monsterType,
            targetName: monsterType.toUpperCase(),
            amount: amount,
            currentAmount: 0,
            description: `Kill ${amount} ${monsterType}s`,
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

    public generateTown(id: string, name: string): any { // Todo: Return Town interface
        const width = 40;
        const height = 40;
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
        // Open Exit at bottom
        walls[20][39] = false;

        // 2. Simple House Grid (Visual only for now)
        // 5x5 grid of houses
        for (let i = 0; i < 5; i++) {
            for (let j = 0; j < 5; j++) {
                const hx = 5 + (i * 7);
                const hy = 5 + (j * 7);
                // Create a 3x3 block for a house
                for (let bx = 0; bx < 3; bx++) {
                    for (let by = 0; by < 3; by++) {
                        walls[hx + bx][hy + by] = true;
                    }
                }
                // Clear door
                walls[hx + 1][hy] = false;
            }
        }

        return {
            id,
            name,
            width,
            height,
            type: 'city',
            walls,
            entities,
            doors: [
                { x: 20, y: 39, id: 'exit_town', target: 'world_main' } // Exit to world
            ],
            spawnPoints: [{ x: 10, y: 10 }]
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

            // Determine HP
            let hp = 10;
            switch (type) {
                case 'slime': hp = 2; break;
                case 'mushroom': hp = 3; break;
                case 'snake': hp = 4; break;
                case 'druid': hp = 5; break; // Wizard
                case 'skeleton': hp = 6; break;
                case 'dude':
                case 'chick': hp = 7; break; // Bandits
                case 'soldier': hp = 20; break; // Knight
            }

            while (!placed && attempts < 50) {
                const ex = Math.floor(Math.random() * this.width);
                const ey = Math.floor(Math.random() * this.height);

                if (!walls[ex][ey]) {
                    const tooClose = cities.some(c => Math.sqrt((c.x - ex) ** 2 + (c.y - ey) ** 2) < 8);
                    if (!tooClose) {
                        entities.push({
                            type: type,
                            name: `${type}_${entities.length}`,
                            x: ex,
                            y: ey,
                            properties: { hp: hp }
                        });
                        placed = true;
                    }
                }
                attempts++;
            }
        };

        // Spawn Specific Types
        for (let i = 0; i < gameConfig.entities.maxBlobs; i++) spawnEntity('slime');
        for (let i = 0; i < gameConfig.entities.maxSnakes; i++) spawnEntity('snake');
        for (let i = 0; i < gameConfig.entities.maxWizards; i++) spawnEntity('druid');
        for (let i = 0; i < gameConfig.entities.maxMushrooms; i++) spawnEntity('mushroom');
        for (let i = 0; i < gameConfig.entities.maxKnights; i++) spawnEntity('soldier');

        // Spawn Others
        const otherTypes = ['skeleton', 'dude', 'chick']; // Removed 'bat'
        for (let i = 0; i < gameConfig.entities.maxOthers; i++) {
            const type = otherTypes[Math.floor(Math.random() * otherTypes.length)];
            spawnEntity(type);
        }

        const world = new World({
            customId: 'world_main',
            width: this.width,
            height: this.height,
            type: 'world',
            walls: walls,
            doors: doors,
            spawnPoints: [cities[0]], // Spawn at first city
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
