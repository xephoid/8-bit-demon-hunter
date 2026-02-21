import { DemonHunterState } from '../../../shared/src/data/GameData';
import { IWorld } from '../models/World';

class GameStateService {
    private static instance: GameStateService;
    private state: DemonHunterState | null = null;
    private overworld: IWorld | null = null;

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

    public getOverworld(): IWorld | null {
        return this.overworld;
    }

    public setOverworld(world: IWorld): void {
        this.overworld = world;
    }

    public clearState(): void {
        this.state = null;
    }
}

export const GameState = GameStateService.getInstance();
