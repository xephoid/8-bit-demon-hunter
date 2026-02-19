import mongoose, { Schema, Document } from 'mongoose';

export interface IEntity extends Document {
    type: string; // 'player', 'enemy', 'npc', 'item'
    name: string;
    x: number;
    y: number;
    properties: Record<string, any>; // Flexible properties (hp, damage, etc.)
}

const EntitySchema: Schema = new Schema({
    type: { type: String, required: true },
    name: { type: String, required: true },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    properties: { type: Map, of: Schema.Types.Mixed, default: {} }
});

export const Entity = mongoose.model<IEntity>('Entity', EntitySchema);
