import { Request, Response } from 'express';
import { WorldGenerator } from '../services/WorldGenerator';
import { GameState } from '../services/GameState';

const generator = new WorldGenerator();
import { gameConfig } from '../config/gameConfig';

const getSessionId = (req: Request): string =>
    (req.headers['x-session-id'] as string) || 'default';

export const generateWorld = async (req: Request, res: Response) => {
    try {
        const sessionId = getSessionId(req);
        const world = await generator.generateDemonHunterWorld(sessionId);
        GameState.setOverworld(sessionId, world);
        res.json(world);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to generate world' });
    }
};

export const enterDoor = async (req: Request, res: Response) => {
    try {
        const sessionId = getSessionId(req);
        const doorId = req.params.doorId as string;
        console.log(`Entering door: ${doorId}`);

        if (doorId === 'exit_town' || doorId === 'world_main' || doorId.startsWith('exit_')) {
            // Exit Town -> Go to Overworld
            const storedWorld = GameState.getOverworld(sessionId);
            if (storedWorld) {
                console.log("Returning stored Overworld");

                if (doorId.startsWith('exit_')) {
                    const townId = doorId.replace('exit_', '');
                    const townDoor = storedWorld.doors.find((d: any) => d.target === townId);

                    if (townDoor) {
                        console.log(`Spawning at door to ${townId} (${townDoor.x}, ${townDoor.y})`);

                        const worldObj = (storedWorld as any).toObject ? (storedWorld as any).toObject() : storedWorld;

                        res.json({
                            ...worldObj,
                            spawnPoints: [{ x: townDoor.x, y: townDoor.y + 2 }]
                        });
                        return;
                    }
                }

                res.json(storedWorld);
                return;
            }

            // Fallback (Regen)
            console.log("No stored Overworld, regenerating...");
            const gameState = GameState.getState(sessionId);
            const townIds = gameState ? gameState.towns.map((t: any) => t.id) : [];

            const world = await generator.generateSimpleWorld(townIds);
            GameState.setOverworld(sessionId, world);
            res.json(world);
        } else if (doorId.startsWith('town_')) {
            // Enter Town -> Load Town Data
            const gameState = GameState.getState(sessionId);
            console.log(`Debug: doorId=${doorId}, Towns in State=${gameState?.towns?.length}`);

            const town = gameState?.towns.find((t: any) => t.id === doorId);
            if (town) {
                console.log(`Found town ${town.name}, entering...`);
                const world = generator.convertTownToWorld(town);
                res.json(world);
            } else {
                console.warn(`Town ${doorId} not found in state! Generating fresh town on the fly.`);

                const idParts = doorId.split('_');
                const num = idParts[1] ? parseInt(idParts[1]) : 1;

                const townNameRegistry = gameConfig.townNameRegistry;
                const nameIdx = num % townNameRegistry.length;
                const name = townNameRegistry[nameIdx] || `Town ${num + 1}`;

                if (gameState) {
                    gameState.towns.push({
                        id: doorId,
                        name: name,
                        x: 0, y: 0, width: 40, height: 40,
                        people: []
                    });
                }

                const world = generator.generatePopulatedTown(doorId, name);
                res.json(world);
            }
        } else if (doorId.startsWith('temple_')) {
            // Enter temple — generate a fresh maze
            const mazeWorld = generator.generateTempleMaze(doorId);
            res.json(mazeWorld);
        } else {
            console.log("Unknown door, generating simple world");
            const world = await generator.generateSimpleWorld();
            res.json(world);
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to enter door' });
    }
};
