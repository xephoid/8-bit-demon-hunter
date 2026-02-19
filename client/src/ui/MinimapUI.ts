
import type { GameTask, Person } from '../../../shared/src/data/GameData';

export class MinimapUI {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private size = 200; // px

    constructor() {
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.size;
        this.canvas.height = this.size;

        Object.assign(this.canvas.style, {
            position: 'absolute',
            bottom: '20px',
            right: '20px',
            width: `${this.size}px`,
            height: `${this.size}px`,
            backgroundColor: 'rgba(0, 0, 0, 0.5)', // Semi-transparent black
            border: '2px solid #555',
            borderRadius: '4px', // Slight rounded corners for aesthetics, but effectively square
            zIndex: '100'
        });

        document.body.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d')!;
    }

    public update(
        playerPos: { x: number, y: number },
        worldDims: { width: number, height: number },
        doors: any[],
        entities: any[],
        activeTask: GameTask | null,
        visitedPeople: Map<string, Person>,
        currentWorldId: string
    ) {
        // Clear
        this.ctx.clearRect(0, 0, this.size, this.size);

        // Scale factors
        // We want to map [0, width] -> [0, size]
        const scaleX = this.size / worldDims.width;
        const scaleY = this.size / worldDims.height;

        // Helper: World to Map
        const toMap = (x: number, y: number) => ({
            x: x * scaleX,
            y: y * scaleY
        });

        // 1. Draw Doors (Green Dots)
        this.ctx.fillStyle = '#00FF00';
        doors.forEach(door => {
            const p = toMap(door.x, door.y);
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            this.ctx.fill();
        });

        // 2. Draw Task Giver (Yellow Dot)
        if (activeTask && activeTask.giverId) {
            const giver = visitedPeople.get(activeTask.giverId);
            if (giver) {
                // Determine where to point
                let targetLoc: { x: number, y: number } | null = null;

                if (currentWorldId) {
                    const cWorldId = String(currentWorldId);

                    if (cWorldId === giver.attributes.townId) {
                        // Giver is in THIS town
                        // Find their entity
                        const entity = entities.find(e => e.properties && e.properties.personId === activeTask.giverId);
                        if (entity) {
                            targetLoc = { x: entity.x, y: entity.y };
                        }
                    } else {
                        // Giver is in ANOTHER town
                        // If we are in the World (Hub), find door to that town
                        if (cWorldId.includes('world')) {
                            // Door IDs usually match or target matches townId?
                            // In generateSimpleWorld: id: townId, target: townId
                            const door = doors.find(d => d.target === giver.attributes.townId);
                            if (door) {
                                targetLoc = { x: door.x, y: door.y };
                            }
                        } else {
                            // We are in WRONG TOWN -> Point to Exit
                            const exit = doors.find(d => d.target.includes('world')); // Heuristic for exit
                            if (exit) {
                                targetLoc = { x: exit.x, y: exit.y };
                            }
                        }
                    }

                    if (targetLoc) {
                        const p = toMap(targetLoc.x, targetLoc.y);
                        this.ctx.fillStyle = '#FFFF00';
                        this.ctx.beginPath();
                        this.ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
                        this.ctx.fill();

                        // Glow/Alert Ring
                        this.ctx.strokeStyle = '#FFFF00';
                        this.ctx.lineWidth = 2;
                        this.ctx.beginPath();
                        this.ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
                        this.ctx.stroke();
                    }
                }
            }
        }


        // 3. Draw Player (Blue Dot)
        // Player pos is usually in world units * 2 in ThreeJS, but updated here from 'playerPos' arg
        // Assumption: playerPos passed in is in GRID coords (same as entities)
        const pp = toMap(playerPos.x, playerPos.y);
        this.ctx.fillStyle = '#0000FF';
        this.ctx.beginPath();
        this.ctx.arc(pp.x, pp.y, 5, 0, Math.PI * 2);
        this.ctx.fill();
    }

    public toggle(visible: boolean) {
        this.canvas.style.display = visible ? 'block' : 'none';
    }
}
