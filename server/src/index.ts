import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// MongoDB Connection
// mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/miniburger')
//     .then(() => console.log('MongoDB connected'))
//     .catch(err => console.error('MongoDB connection error:', err));

app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

import { generateWorld, enterDoor } from './controllers/MapController';
import { GameState } from './services/GameState';

import { gameConfig } from './config/gameConfig';

app.get('/', (req, res) => {
    res.send('Miniburger API');
});

app.get('/api/config', (req, res) => {
    res.json(gameConfig);
});

app.get('/api/generate', generateWorld as any);
app.get('/api/state', (req, res) => {
    // Return safe subset of state (or full state for prototype)
    // We need items especially.
    const state = GameState.getState();
    res.json(state || {});
});
app.post('/api/enter/:doorId', enterDoor as any);

app.post('/api/accuse', (req, res) => {
    const { personId } = req.body;
    const state = GameState.getState();

    if (!state || !state.demonId) {
        res.status(400).json({ error: "Game not initialized" });
        return;
    }

    const isDemon = state.demonId === personId;
    res.json({
        success: isDemon,
        demonId: state.demonId
    });
});

app.post('/api/escort/complete', (req, res) => {
    const { personId, targetTownId } = req.body;
    const state = GameState.getState();
    if (!state) return res.status(400).json({ error: "Game not initialized" });

    const allPeople = state.towns.flatMap(t => t.people);
    const person = allPeople.find(p => p.id === personId);

    if (person) {
        person.attributes.townId = targetTownId;
        res.json({ success: true, updatedPerson: person });
    } else {
        res.status(404).json({ error: "Person not found" });
    }
});

app.post('/api/item/take', (req, res) => {
    const { personId } = req.body;
    const state = GameState.getState();
    if (!state) return res.status(400).json({ error: "Game not initialized" });

    const allPeople = state.towns.flatMap(t => t.people);
    const person = allPeople.find(p => p.id === personId);

    if (person) {
        person.attributes.item = 'None';
        res.json({ success: true, updatedPerson: person });
    } else {
        res.status(404).json({ error: "Person not found" });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
