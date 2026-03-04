import { DemonHunterState } from '../../../shared/src/data/GameData';
import { IWorld } from '../models/World';

interface SessionData {
    state: DemonHunterState | null;
    overworld: IWorld | null;
    lastActive: number;
}

class GameStateService {
    private static instance: GameStateService;
    private sessions = new Map<string, SessionData>();

    private constructor() { }

    public static getInstance(): GameStateService {
        if (!GameStateService.instance) {
            GameStateService.instance = new GameStateService();
        }
        return GameStateService.instance;
    }

    private touch(sessionId: string): SessionData {
        if (!this.sessions.has(sessionId)) {
            this.sessions.set(sessionId, { state: null, overworld: null, lastActive: Date.now() });
        }
        const s = this.sessions.get(sessionId)!;
        s.lastActive = Date.now();
        return s;
    }

    public getState(sessionId: string): DemonHunterState | null {
        return this.touch(sessionId).state;
    }

    public setState(sessionId: string, state: DemonHunterState): void {
        this.touch(sessionId).state = state;
    }

    public getOverworld(sessionId: string): IWorld | null {
        return this.touch(sessionId).overworld;
    }

    public setOverworld(sessionId: string, world: IWorld): void {
        this.touch(sessionId).overworld = world;
    }

    public clearSession(sessionId: string): void {
        this.sessions.delete(sessionId);
    }

    /** Remove sessions inactive for longer than maxAgeMs (default 30 min). */
    public pruneInactiveSessions(maxAgeMs = 30 * 60 * 1000): void {
        const cutoff = Date.now() - maxAgeMs;
        for (const [id, data] of this.sessions) {
            if (data.lastActive < cutoff) this.sessions.delete(id);
        }
    }
}

export const GameState = GameStateService.getInstance();
