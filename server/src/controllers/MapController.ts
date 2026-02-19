import { Request, Response } from 'express';
import { WorldGenerator } from '../services/WorldGenerator';
import { GameState } from '../services/GameState';

const generator = new WorldGenerator();

export const generateWorld = async (req: Request, res: Response) => {
    try {
        const world = await generator.generateDemonHunterWorld();
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

        if (doorId === 'exit_town' || doorId === 'world_main') {
            // Exit Town -> Go to Overworld
            // For now, regen overworld (or we could store it). 
            // If we regen, we need the town IDs again? 
            // Ideally we get state from GameState to pass town IDs back to simple world.
            // But for now, let's just regen with current state towns if available.

            // Import GameState to get towns
            const gameState = GameState.getState();
            const townIds = gameState ? gameState.towns.map((t: any) => t.id) : [];

            const world = await generator.generateSimpleWorld(townIds);
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
                const world = generator.convertTownToWorld(town);
                res.json(world);
            } else {
                console.warn(`Town ${doorId} not found in state! Generating fresh town on the fly.`);
                // Fallback: Generate a fresh town with this ID so the player isn't stuck
                // Parse ID to get a reasonable name? e.g. "town_0" -> "Town 1"
                const idParts = doorId.split('_');
                const num = idParts[1] ? parseInt(idParts[1]) + 1 : 1;
                const townData = generator.generateTown(doorId, `Town ${num}`);

                // We need to convert this raw data to a Town interface to use convertTownToWorld,
                // OR just manually convert it here. convertTownToWorld expects a Town object (with people).
                // generateTown returns raw data (walls, entities array which is empty).
                // We need to generate people too if we want a proper town.

                // Better approach: Create a helper in WorldGenerator to "GetOrGenerateTown(id)"
                // For now, let's manually construct it to unblock functionality.

                // 1. Generate core town data
                // const townData = generator.generateTown(doorId, `Town ${num}`); // Already done above

                // 2. Generate People
                // We can't access private generatePeople. 
                // Let's use a public method on generator if possible, or just accept an empty town for now (safe fallback).
                // BUT the user wants people.

                // Let's call generateDemonHunterWorld again? No, that resets everything.

                // Let's just return the raw townData wrapped as a World, but we need entities.
                // generator.generateTown returns entities: [].

                // Ideally we add a public method to WorldGenerator to "createPopulatedTown(id)".
                // I will add that method in the next step. For now, let's just return what we have.
                // Actually, let's PAUSE and add that method to WorldGenerator first, it's cleaner.

                // REVERTING this massive inline logic. I'll simply call a new method I'll create.
                const world = generator.generatePopulatedTown(doorId, `Town ${num}`);
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
