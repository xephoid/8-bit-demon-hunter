import express, { Request } from 'express';
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

const getSessionId = (req: Request): string =>
    (req.headers['x-session-id'] as string) || 'default';

// --- PostHog server-side tracking ---
const POSTHOG_API_KEY = 'phc_ErGmDjK3j1QbKEx6CBJcnY91PrZIgWPrHbA2RBtFHM5';

function track(sessionId: string, event: string, properties?: Record<string, any>) {
    // Fire-and-forget — never awaited so it never blocks a route handler
    fetch('https://us.i.posthog.com/capture/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: POSTHOG_API_KEY, event, distinct_id: sessionId, properties }),
    }).catch(() => {});
}

app.get('/', (req, res) => {
    res.send('Miniburger API');
});

app.get('/api/config', (req, res) => {
    res.json(gameConfig);
});

// game_started — a new world is generated when a session begins
app.get('/api/generate', (req, res, next) => {
    track(getSessionId(req), 'game_started');
    return (generateWorld as any)(req, res, next);
});

app.get('/api/state', (req, res) => {
    const sessionId = getSessionId(req);
    const state = GameState.getState(sessionId);
    res.json(state || {});
});

// world_entered — player moves through a door
app.post('/api/enter/:doorId', (req, res, next) => {
    track(getSessionId(req), 'world_entered', { door_id: req.params.doorId });
    return (enterDoor as any)(req, res, next);
});

app.post('/api/accuse', (req, res) => {
    const sessionId = getSessionId(req);
    const { personId } = req.body;
    const state = GameState.getState(sessionId);

    if (!state || !state.demonId) {
        res.status(400).json({ error: "Game not initialized" });
        return;
    }

    const isDemon = state.demonId === personId;

    // accusation_result — covers both correct and incorrect guesses
    track(sessionId, 'accusation_result', { won: isDemon, accused_person_id: personId });
    if (isDemon) track(sessionId, 'game_won');

    res.json({ success: isDemon, demonId: state.demonId });
});

app.post('/api/escort/complete', (req, res) => {
    const sessionId = getSessionId(req);
    const { personId, targetTownId } = req.body;
    const state = GameState.getState(sessionId);
    if (!state) return res.status(400).json({ error: "Game not initialized" });

    const allPeople = state.towns.flatMap(t => t.people);
    const person = allPeople.find(p => p.id === personId);

    if (person) {
        track(sessionId, 'task_completed', { task_type: 'ESCORT', target_town_id: targetTownId });
        person.attributes.townId = targetTownId;

        // Move person from their origin town to the destination town's people array
        // so re-entering the destination town shows them correctly
        const targetTown = state.towns.find((t: any) => t.id === targetTownId);
        if (targetTown) {
            for (const town of state.towns) {
                const idx = town.people.findIndex((p: any) => p.id === personId);
                if (idx !== -1 && town.id !== targetTownId) {
                    town.people.splice(idx, 1);
                    break;
                }
            }
            if (!targetTown.people.some((p: any) => p.id === personId)) {
                targetTown.people.push(person);
            }
        }

        res.json({ success: true, updatedPerson: person });
    } else {
        res.status(404).json({ error: "Person not found" });
    }
});

app.post('/api/item/take', (req, res) => {
    const sessionId = getSessionId(req);
    const { personId } = req.body;
    const state = GameState.getState(sessionId);
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

app.post('/api/track', (req, res) => {
    const sessionId = getSessionId(req);
    const { events } = req.body;
    if (!Array.isArray(events) || events.length === 0) { res.json({ ok: true }); return; }

    const batch = events.map((ev: any) => ({
        type: 'capture',
        event: ev.name,
        distinct_id: sessionId,
        timestamp: ev.timestamp ? new Date(ev.timestamp).toISOString() : new Date().toISOString(),
        properties: ev.params ?? {},
    }));

    fetch('https://us.i.posthog.com/batch/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: POSTHOG_API_KEY, batch }),
    }).catch(() => {});

    res.json({ ok: true });
});

// Prune sessions idle for more than 30 minutes, checked every 5 minutes
setInterval(() => GameState.pruneInactiveSessions(), 5 * 60 * 1000);

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
