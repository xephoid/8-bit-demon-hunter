export const gameConfig = {
    world: {
        width: 400,
        height: 400,
        tileSize: 32, // Size of a tile in pixels (for 2D) or units (for 3D)
        roomCount: 20
    },
    entities: {
        maxBlobs: 30,    // "Blobs - 30"
        maxSnakes: 20,   // "Snakes - 10"
        maxWizards: 10,   // "Wizards - 5"
        maxMushrooms: 20,// "Mushrooms - 20"
        maxKnights: 1,   // "Undead Knights - 1"
        maxOthers: 10    // For Skeletons, Bandits, Bats
    }
};
