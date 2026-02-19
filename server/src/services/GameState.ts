import { DemonHunterState } from '../../../shared/src/data/GameData';

class GameStateService {
    private static instance: GameStateService;
    private state: DemonHunterState | null = null;

    private constructor() { }

    public static getInstance(): GameStateService {
        if (!GameStateService.instance) {
            GameStateService.instance = new GameStateService();
        }
        return GameStateService.instance;
    }

    public getState(): DemonHunterState | null {
        return this.state;
    }

    public setState(state: DemonHunterState): void {
        this.state = state;
    }

    public clearState(): void {
        this.state = null;
    }
}

export const GameState = GameStateService.getInstance();
