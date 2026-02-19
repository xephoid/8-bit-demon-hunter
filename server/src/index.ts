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

app.get('/', (req, res) => {
    res.send('Miniburger API');
});

app.get('/api/generate', generateWorld as any);
app.post('/api/enter/:doorId', enterDoor as any);

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
