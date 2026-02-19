import mongoose, { Schema, Document } from 'mongoose';

export interface IWorld extends Document {
    customId: string;
    width: number;
    height: number;
    type: 'world' | 'city';
    biome: 'grass' | 'snow' | 'desert';
    walls: boolean[][]; // 2D grid of walls (true = wall, false = empty)
    doors: any[]; // List of doors/portals
    spawnPoints: { x: number, y: number }[];
    createdAt: Date;
}

const WorldSchema: Schema = new Schema({
    customId: { type: String }, // Logical ID (town_0, world_main)
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    type: { type: String, default: 'world' },
    biome: { type: String, default: 'grass' },
    walls: [[Boolean]], // 2D array of booleans
    doors: [{ type: Schema.Types.Mixed }], // Embedding doors directly for now
    spawnPoints: [{ x: Number, y: Number }],
    entities: [{ type: Schema.Types.Mixed }], // Store entities (enemies, items)
    createdAt: { type: Date, default: Date.now }
});

export const World = mongoose.model<IWorld>('World', WorldSchema);
