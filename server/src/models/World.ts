import mongoose, { Schema, Document } from 'mongoose';

export interface IWorld extends Document {
    customId: string;
    width: number;
    height: number;
    type: 'world' | 'city' | 'temple';
    biome: 'grass' | 'snow' | 'desert';
    walls: boolean[][]; // 2D grid of walls (true = wall, false = empty)
    rockWalls?: boolean[][]; // Subset of walls that are rock (flyable, destructible)
    doors: any[]; // List of doors/portals
    spawnPoints: { x: number, y: number }[];
    housePeople?: { [key: string]: string }; // doorId -> personId mapping for town houses
    innRect?: { x: number, y: number, w: number, h: number }; // Bounds of the Inn building
    startingDoorId?: string; // For overworld: the door ID to auto-enter on game start
    priceMultipliers?: { [resource: string]: number }; // Per-resource inn sell multiplier (1-6) for this town
    createdAt: Date;
}

const WorldSchema: Schema = new Schema({
    customId: { type: String }, // Logical ID (town_0, world_main)
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    type: { type: String, default: 'world' },
    biome: { type: String, default: 'grass' },
    walls: [[Boolean]], // 2D array of booleans
    rockWalls: [[Boolean]], // 2D array of rock wall flags
    doors: [{ type: Schema.Types.Mixed }], // Embedding doors directly for now
    spawnPoints: [{ x: Number, y: Number }],
    entities: [{ type: Schema.Types.Mixed }], // Store entities (enemies, items)
    housePeople: { type: Schema.Types.Mixed }, // doorId -> personId map
    innRect: { type: Schema.Types.Mixed }, // Inn building bounds
    startingDoorId: { type: String }, // Starting town door for auto-entry
    priceMultipliers: { type: Schema.Types.Mixed }, // Per-resource inn price multipliers
    createdAt: { type: Date, default: Date.now }
});

export const World = mongoose.model<IWorld>('World', WorldSchema);
