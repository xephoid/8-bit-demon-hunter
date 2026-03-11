import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

export class Controls {
    private controls: PointerLockControls;
    private moveForward = false;
    private moveBackward = false;
    private moveLeft = false;
    private moveRight = false;
    private velocity = new THREE.Vector3();
    private direction = new THREE.Vector3();

    private camera: THREE.Camera;
    private worldData: any = null;
    private tileSize: number = 2;
    public isFlying: boolean = false;
    public autoLock: boolean = true;
    public isMobile: boolean = false;
    public mobileActive: boolean = false;

    get isActive(): boolean {
        return this.isMobile ? this.mobileActive : this.controls.isLocked;
    }

    constructor(camera: THREE.Camera, domElement: HTMLElement) {
        this.camera = camera;
        this.controls = new PointerLockControls(camera, domElement);

        domElement.addEventListener('click', () => {
            if (this.autoLock && !this.isMobile) this.controls.lock();
        });

        const onKeyDown = (event: KeyboardEvent) => {
            switch (event.code) {
                case 'ArrowUp':
                case 'KeyW':
                    this.moveForward = true;
                    break;
                case 'ArrowLeft':
                case 'KeyA':
                    this.moveLeft = true;
                    break;
                case 'ArrowDown':
                case 'KeyS':
                    this.moveBackward = true;
                    break;
                case 'ArrowRight':
                case 'KeyD':
                    this.moveRight = true;
                    break;
            }
        };

        const onKeyUp = (event: KeyboardEvent) => {
            switch (event.code) {
                case 'ArrowUp':
                case 'KeyW':
                    this.moveForward = false;
                    break;
                case 'ArrowLeft':
                case 'KeyA':
                    this.moveLeft = false;
                    break;
                case 'ArrowDown':
                case 'KeyS':
                    this.moveBackward = false;
                    break;
                case 'ArrowRight':
                case 'KeyD':
                    this.moveRight = false;
                    break;
            }
        };

        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);

        // Interaction (Space)
        document.addEventListener('keydown', (event) => {
            if (event.code === 'KeyE') {
                this.checkInteraction();
            }
        });
    }

    public setWorldData(worldData: any) {
        this.worldData = worldData;
    }

    public update(delta: number, agility: number = 1) {
        if (this.isMobile ? this.mobileActive : this.controls.isLocked) {
            this.velocity.x -= this.velocity.x * 10.0 * delta;
            this.velocity.z -= this.velocity.z * 10.0 * delta;

            this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
            this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
            this.direction.normalize();

            // Acceleration maps Agility 1 -> 200.0 up to Agility 5 -> 400.0
            const maxAgility = 5;
            const baseAcc = 150.0;
            const scalingAcc = 50.0; // 150 + (50 * 5) = 400 at max level
            const mobileMult = this.isMobile ? 0.65 : 1.0;
            const currentAcc = (baseAcc + (scalingAcc * Math.min(agility, maxAgility))) * mobileMult;

            // Acceleration
            if (this.moveForward || this.moveBackward) this.velocity.z -= this.direction.z * currentAcc * delta;
            if (this.moveLeft || this.moveRight) this.velocity.x -= this.direction.x * currentAcc * delta;

            const speedX = -this.velocity.x * delta;
            const speedZ = -this.velocity.z * delta;

            // Build camera-local right and forward vectors in world space
            const matrix = new THREE.Matrix4();
            matrix.extractRotation(this.camera.matrix);
            const right = new THREE.Vector3();
            right.setFromMatrixColumn(matrix, 0);
            const forward = new THREE.Vector3();
            forward.setFromMatrixColumn(matrix, 2);
            forward.negate(); // column 2 is back; negate for forward

            // Decompose into world-space X and Z so we can slide along walls.
            // Camera-local axes are diagonal in world space when the camera is rotated,
            // so testing camera-space axes independently blocks movement even when only
            // one world axis is obstructed.
            const worldDX = right.x * speedX + forward.x * speedZ;
            const worldDZ = right.z * speedX + forward.z * speedZ;

            const pos = this.camera.position;

            const nextPosX = pos.clone(); nextPosX.x += worldDX;
            const nextPosZ = pos.clone(); nextPosZ.z += worldDZ;

            if (!this.checkCollision(nextPosX)) {
                pos.x += worldDX;
            } else {
                this.velocity.x = 0;
                this.velocity.z = 0;
            }

            if (!this.checkCollision(nextPosZ)) {
                pos.z += worldDZ;
            } else {
                this.velocity.x = 0;
                this.velocity.z = 0;
            }
        }
    }

    private checkCollision(addr: THREE.Vector3): boolean {
        if (!this.worldData) return false;

        const buffer = 0.5; // Player radius buffer
        const x = addr.x;
        const z = addr.z;

        // Check 4 corners or just center? 
        // With buffer, we check center + buffer
        const corners = [
            { x: x + buffer, y: z + buffer },
            { x: x - buffer, y: z + buffer },
            { x: x + buffer, y: z - buffer },
            { x: x - buffer, y: z - buffer }
        ];

        for (const c of corners) {
            // Use floor and assume wall covers [n, n+1)
            const gridX = Math.floor(c.x / this.tileSize);
            const gridY = Math.floor(c.y / this.tileSize);

            if (gridX < 0 || gridX >= this.worldData.width || gridY < 0 || gridY >= this.worldData.height) {
                return true; // Out of bounds is collision
            }

            // Array is walls[x][y]
            if (this.worldData.walls[gridX][gridY]) {
                // Allow passage when flying over a rock wall
                if (this.isFlying && this.worldData.rockWalls?.[gridX]?.[gridY]) {
                    continue;
                }
                return true; // Hit wall
            }
        }

        return false;
    }

    public checkInteraction() {
        // Use stored camera position
        const event = new CustomEvent('playerInteract', {
            detail: { position: this.camera.position }
        });
        window.dispatchEvent(event);
    }



    public setSensitivity(value: number) {
        this.controls.pointerSpeed = value;
    }

    public setMobileMovement(forward: boolean, backward: boolean, left: boolean, right: boolean) {
        this.moveForward = forward;
        this.moveBackward = backward;
        this.moveLeft = left;
        this.moveRight = right;
    }

    public lock() {
        if (this.isMobile) { this.mobileActive = true; return; }
        this.controls.lock();
    }

    public unlock() {
        if (this.isMobile) { this.mobileActive = false; return; }
        this.controls.unlock();
    }

    public knockback(x: number, z: number) {
        const currentPos = this.camera.position.clone();
        const nextPos = currentPos.clone();
        nextPos.x += x;
        nextPos.z += z;

        // Try full move
        if (!this.checkCollision(nextPos)) {
            this.camera.position.copy(nextPos);
        } else {
            // Hit wall, try sliding (X only)
            const tryX = currentPos.clone();
            tryX.x += x;
            if (!this.checkCollision(tryX)) {
                this.camera.position.x = tryX.x;
            }

            // Try sliding (Z only) - re-clone from current (potentially updated X)
            const tryZ = this.camera.position.clone();
            tryZ.z += z;
            if (!this.checkCollision(tryZ)) {
                this.camera.position.z = tryZ.z;
            }
        }
    }
}
