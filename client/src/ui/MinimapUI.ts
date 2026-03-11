
import type { GameTask, Person } from '../../../shared/src/data/GameData';
import { TEMPLE_ENEMY_TYPES } from '../../../shared/src/data/GameData';

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
        walls: boolean[][] | null = null,
        chestPos: { x: number; y: number } | null = null,
        isTemple: boolean = false,
        playerAngle: number = 0,
        suspectedPeople?: Set<string>,
        housePeople?: { [doorId: string]: string }
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
            if (door.noMinimap) return;        // Hide temple entrances (not on map)
            const p = toMap(door.x, door.y);
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            this.ctx.fill();
        });

        // 2b. Draw suspected house doors (orange ring + dot) — only visible inside towns
        if (suspectedPeople && housePeople) {
            doors.forEach(door => {
                if (door.type !== 'house') return;
                const personId = housePeople[door.id];
                if (!personId || !suspectedPeople.has(personId)) return;
                const p = toMap(door.x, door.y);
                this.ctx.strokeStyle = '#ff8800';
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
                this.ctx.stroke();
                this.ctx.fillStyle = '#ff8800';
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
                this.ctx.fill();
            });
        }

        // 3. Draw Focused Town (Purple Dot) — drawn before yellow so quest marker appears on top
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
                        // At destination — show where the escorted NPC is so the player can find them
                        const entity = entities.find(e =>
                            e.data && e.data.properties && e.data.properties.personId === activeTask.giverId
                        );
                        if (entity) {
                            targetLoc = entity.data
                                ? { x: entity.data.x, y: entity.data.y }
                                : { x: entity.x, y: entity.y };
                        }
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


        // 3. Draw Temple Chest (White Dot) — visible once all temple enemies are cleared
        if (chestPos) {
            const cp = toMap(chestPos.x, chestPos.y);
            this.ctx.fillStyle = '#FFFFFF';
            this.ctx.beginPath();
            this.ctx.arc(cp.x, cp.y, 5, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.strokeStyle = '#FFFFFF';
            this.ctx.lineWidth = 1.5;
            this.ctx.beginPath();
            this.ctx.arc(cp.x, cp.y, 8, 0, Math.PI * 2);
            this.ctx.stroke();
        }

        // 4. Draw Temple Enemies (Red Dots)
        if (isTemple) {
            this.ctx.fillStyle = '#FF2222';
            entities.forEach(e => {
                if (!TEMPLE_ENEMY_TYPES.includes(e.data?.type)) return;
                if (e.data?.properties?.isDying || (e.data?.properties?.hp ?? 1) <= 0) return;
                const ep = toMap(e.data.x, e.data.y);
                this.ctx.beginPath();
                this.ctx.arc(ep.x, ep.y, 3, 0, Math.PI * 2);
                this.ctx.fill();
            });
        }

        // 5. Draw Player (Blue Arrow)
        // playerAngle is a pre-computed canvas rotation angle passed in from main.ts
        const pp = toMap(playerPos.x, playerPos.y);

        this.ctx.save();
        this.ctx.translate(pp.x, pp.y);
        this.ctx.rotate(playerAngle);

        // Triangle pointing up in local space → points toward the player's facing direction
        this.ctx.fillStyle = '#4488FF';
        this.ctx.strokeStyle = '#FFFFFF';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(0, -8);   // tip (forward)
        this.ctx.lineTo(-5, 5);   // back-left
        this.ctx.lineTo(5, 5);    // back-right
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();

        this.ctx.restore();
    }

    public toggle(visible: boolean) {
        this.canvas.style.display = visible ? 'block' : 'none';
    }

    public repositionForMobile() {
        this.canvas.style.right = '';
        this.canvas.style.left = '50%';
        this.canvas.style.transform = 'translateX(-50%)';
    }
}
