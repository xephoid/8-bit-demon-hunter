import { Request, Response } from 'express';
import { WorldGenerator } from '../services/WorldGenerator';
import { GameState } from '../services/GameState';

const generator = new WorldGenerator();
import { gameConfig } from '../config/gameConfig';


export const generateWorld = async (req: Request, res: Response) => {
    try {
        const world = await generator.generateDemonHunterWorld();
        // Save initial overworld state (walls, doors, etc.)
        GameState.setOverworld(world);
        res.json(world);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to generate world' });
    }
};

export const enterDoor = async (req: Request, res: Response) => {
    try {
        const doorId = req.params.doorId as string;
        console.log(`Entering door: ${doorId}`);

        if (doorId === 'exit_town' || doorId === 'world_main' || doorId.startsWith('exit_')) {
            // Exit Town -> Go to Overworld
            // Return stored world if available
            const storedWorld = GameState.getOverworld();
            if (storedWorld) {
                console.log("Returning stored Overworld");

                // If exiting a specific town, find the door to that town and set spawn point there
                if (doorId.startsWith('exit_')) {
                    const townId = doorId.replace('exit_', '');
                    // storedWorld is IWorld interface. doors property exists.
                    const townDoor = storedWorld.doors.find((d: any) => d.target === townId);

                    if (townDoor) {
                        console.log(`Spawning at door to ${townId} (${townDoor.x}, ${townDoor.y})`);

                        // storedWorld is a Mongoose Document. We must convert to Object before spreading.
                        const worldObj = (storedWorld as any).toObject ? (storedWorld as any).toObject() : storedWorld;

                        res.json({
                            ...worldObj,
                            spawnPoints: [{ x: townDoor.x, y: townDoor.y + 2 }] // Offset +Y (down)
                        });
                        return;
                    }
                }

                // Default spawn if generic exit or door not found
                res.json(storedWorld);
                return;
            }

            // Fallback (Regen)
            console.log("No stored Overworld, regenerating...");
            const gameState = GameState.getState();
            const townIds = gameState ? gameState.towns.map((t: any) => t.id) : [];

            const world = await generator.generateSimpleWorld(townIds);
            GameState.setOverworld(world); // Save this one too
            res.json(world);
        } else if (doorId.startsWith('town_')) {
            // Enter Town -> Load Town Data
            const gameState = GameState.getState();
            console.log(`Debug: doorId=${doorId}, Towns in State=${gameState?.towns?.length}`);
            // doorId might be "town_0" or "door_to_town_0"? 
            // The simple world door ID was `door_to_${i}` where target was `townIds[i]`.
            // The client POSTs `enter/${door.id}`. 
            // If door.target is the town ID, does client send target? No, client sends door ID.
            // Wait, main.ts does `fetch(api/enter/${closestDoor.id})`.
            // In generateSimpleWorld, I set id: `door_to_${i}` and target: `townId`.
            // The Client doesn't know the target? 
            // We need to map doorId to target.

            // Simpler Hack: Use door target as the ID in the client? 
            // Or just check if doorId LOOKS like a town ID?
            // In generateSimpleWorld, door ID is `door_to_${i}`. Target is `town_X`.
            // If I change generateSimpleWorld to make door ID = `town_X`, then client sends `town_X`.

            // Let's assume MapController receives the TARGET ID if we change logic, 
            // or we parse `door_to_X`.

            // Let's change generateSimpleWorld to use useful IDs.
            // Actually, let's just assume doorId IS the townId for simplicity in this refactor.
            // I will update generateSimpleWorld to make door.id = townId.

            const town = gameState?.towns.find((t: any) => t.id === doorId);
            if (town) {
                console.log(`Found town ${town.name}, entering...`);
                // Ensure poplulated? convertTownToWorld calls generateTown but needs entities.
                // Our current convertTownToWorld just generates entities based on the stored people.
                const world = generator.convertTownToWorld(town);
                res.json(world);
            } else {
                console.warn(`Town ${doorId} not found in state! Generating fresh town on the fly.`);

                // Fallback: Generate a fresh town with this ID
                const idParts = doorId.split('_');
                const num = idParts[1] ? parseInt(idParts[1]) : 1;

                // Use Registry for Name
                const townNameRegistry = gameConfig.townNameRegistry;
                // Pick name based on ID seed to be consistent?
                const nameIdx = num % townNameRegistry.length;
                const name = townNameRegistry[nameIdx] || `Town ${num + 1}`;

                // Generate Populated Town directly
                // Note: generatePopulatedTown returns a World object (IWorld), but we need the Town Data to save to state.
                // We should probably expose the Town creation logic.
                // For now, we accept that generatePopulatedTown logic inside WorldGenerator doesn't return the People list easily.
                // Let's rely on Client to just survive. 
                // BUT we want to update State so ClueTracker works!

                // We need to generate the People and Town structure first.
                // Let's duplicate the logic of generateDemonHunterWorld locally or add a method.
                // I'll assume we can just generate a world and client is happy, 
                // but ClueTracker will show "Town: town_X" because we didn't update state.

                // Minimal Fix: Create a mock town entry for the state so Name lookup works
                if (gameState) {
                    gameState.towns.push({
                        id: doorId,
                        name: name,
                        x: 0, y: 0, width: 40, height: 40,
                        people: [] // We don't have the people data easily from generatePopulatedTown
                    });
                }

                const world = generator.generatePopulatedTown(doorId, name);
                res.json(world);
            }
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
