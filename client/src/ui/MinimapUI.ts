
import type { GameTask, Person } from '../../../shared/src/data/GameData';

export class MinimapUI {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private size = 200; // px
    private wallCache: { worldId: string; imageData: ImageData } | null = null;

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
        currentWorldId: string,
        focusedTownId: string | null = null,
        walls: boolean[][] | null = null
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

        // 1. Draw Walls (Grey) — cached per world so pixel loop only runs on world change
        if (walls) {
            if (!this.wallCache || this.wallCache.worldId !== currentWorldId) {
                const imageData = this.ctx.createImageData(this.size, this.size);
                for (let px = 0; px < this.size; px++) {
                    for (let py = 0; py < this.size; py++) {
                        const tileX = Math.floor(px / scaleX);
                        const tileY = Math.floor(py / scaleY);
                        if (tileX < walls.length && tileY < walls[0].length && walls[tileX][tileY]) {
                            const idx = (py * this.size + px) * 4;
                            imageData.data[idx]     = 120; // R
                            imageData.data[idx + 1] = 120; // G
                            imageData.data[idx + 2] = 120; // B
                            imageData.data[idx + 3] = 220; // A
                        }
                    }
                }
                this.wallCache = { worldId: currentWorldId, imageData };
            }
            this.ctx.putImageData(this.wallCache.imageData, 0, 0);
        }

        // 2. Draw Doors (Green Dots)
        this.ctx.fillStyle = '#00FF00';
        doors.forEach(door => {
            if (door.type === 'house') return; // Hide house doors
            const p = toMap(door.x, door.y);
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            this.ctx.fill();
        });

        // 2. Draw Focused Town (Purple Dot) — drawn before yellow so quest marker appears on top
        if (focusedTownId) {
            const focusedDoor = doors.find(d => d.type !== 'house' && (d.target === focusedTownId || d.id === focusedTownId));
            if (focusedDoor) {
                const p = toMap(focusedDoor.x, focusedDoor.y);
                this.ctx.fillStyle = '#AA00FF';
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
                this.ctx.fill();

                this.ctx.strokeStyle = '#AA00FF';
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
                this.ctx.stroke();
            }
        }

        // 3. Draw Task Marker (Yellow Dot)
        if (activeTask && activeTask.giverId) {
            let targetLoc: { x: number, y: number } | null = null;

            if (currentWorldId) {
                const cWorldId = String(currentWorldId);

                if (activeTask.type === 'ESCORT') {
                    // For escort tasks: point to the DESTINATION town, not the giver's origin
                    if (cWorldId === activeTask.targetId) {
                        // Already at destination — no marker needed
                        targetLoc = null;
                    } else if (cWorldId.includes('world')) {
                        // In overworld: point to destination town door
                        const door = doors.find(d => d.target === activeTask.targetId);
                        if (door) targetLoc = { x: door.x, y: door.y };
                    } else {
                        // In wrong town: point to exit back to overworld
                        const exit = doors.find(d => d.target.includes('world'));
                        if (exit) targetLoc = { x: exit.x, y: exit.y };
                    }
                } else {
                    const giver = visitedPeople.get(activeTask.giverId);
                    if (giver) {
                        if (cWorldId === giver.attributes.townId) {
                            // Giver is in THIS town — find their entity position
                            const entity = entities.find(e =>
                                e.data && e.data.properties && e.data.properties.personId === activeTask.giverId
                            );
                            if (entity) {
                                targetLoc = entity.data
                                    ? { x: entity.data.x, y: entity.data.y }
                                    : { x: entity.x, y: entity.y };
                            }
                        } else if (cWorldId.includes('world')) {
                            // In overworld: point to giver's town door
                            const door = doors.find(d => d.target === giver.attributes.townId);
                            if (door) targetLoc = { x: door.x, y: door.y };
                        } else {
                            // In wrong town: point to exit
                            const exit = doors.find(d => d.target.includes('world'));
                            if (exit) targetLoc = { x: exit.x, y: exit.y };
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
