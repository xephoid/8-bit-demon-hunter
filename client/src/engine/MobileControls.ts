import * as THREE from 'three';
import type { Controls } from './Controls';

export class MobileControls {
    private controls: Controls;

    // Callbacks
    public onInteract: (() => void) | null = null;
    public onClueTracker: (() => void) | null = null;
    public onBomb: (() => void) | null = null;
    public onFly: (() => void) | null = null;
    public onPause: (() => void) | null = null;
    public onTeleport: (() => void) | null = null;
    public onLevelUp: (() => void) | null = null;
    public onAttack: (() => void) | null = null;

    // Look state
    private yaw: number = 0;
    private pitch: number = 0;
    private lookTouchId: number | null = null;
    private lookLastX: number = 0;
    private lookLastY: number = 0;
    private lookStartX: number = 0;
    private lookStartY: number = 0;
    private readonly sensitivity = 0.008;

    // Hold-to-fly timer
    private flyHoldTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly FLY_HOLD_MS = 400;

    // Joystick state (bottom-left)
    private joystickTouchId: number | null = null;
    private joystickCenterX: number = 0;
    private joystickCenterY: number = 0;
    private readonly joystickRadius = 40;
    private joystickKnob: HTMLElement;
    private joystickBase: HTMLElement;

    // Movement flags driven by joystick
    private mfwd = false;
    private mbwd = false;
    private mlft = false;
    private mrgt = false;

    // Button elements
    private btnInteract: HTMLElement; // TALK button (was FLY slot)
    private btnClue: HTMLElement;
    private btnBomb: HTMLElement;
    private btnAttack: HTMLElement;  // ATTACK button (bottom of diamond)
    private btnPause: HTMLElement;
    private btnWarp: HTMLElement;
    private overlay: HTMLElement;

    static isMobileDevice(): boolean {
        return navigator.maxTouchPoints > 0 && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    }

    constructor(controls: Controls) {
        this.controls = controls;
        this.overlay = this.createOverlay();
        this.joystickBase = this.overlay.querySelector('#mc-joystick-base')!;
        this.joystickKnob = this.overlay.querySelector('#mc-joystick-knob')!;
        this.btnInteract = this.overlay.querySelector('#mc-btn-interact')!;
        this.btnClue = this.overlay.querySelector('#mc-btn-clue')!;
        this.btnBomb = this.overlay.querySelector('#mc-btn-bomb')!;
        this.btnAttack = this.overlay.querySelector('#mc-btn-attack')!;
        this.btnPause = this.overlay.querySelector('#mc-btn-pause')!;
        this.btnWarp = this.overlay.querySelector('#mc-btn-warp')!;

        this.bindEvents();
    }

    private createOverlay(): HTMLElement {
        const overlay = document.createElement('div');
        overlay.id = 'mobile-controls';
        Object.assign(overlay.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: '500',
            touchAction: 'none',
            userSelect: 'none',
        });

        const btnStyle = (extra: Partial<CSSStyleDeclaration> = {}): Partial<CSSStyleDeclaration> => ({
            position: 'absolute',
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.5)',
            border: '2px solid rgba(255,255,255,0.6)',
            color: 'white',
            fontFamily: "'Press Start 2P', monospace",
            fontSize: '9px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            pointerEvents: 'auto',
            touchAction: 'none',
            cursor: 'pointer',
            lineHeight: '1.2',
            ...extra,
        });

        const smallBtnStyle = (extra: Partial<CSSStyleDeclaration> = {}): Partial<CSSStyleDeclaration> => ({
            ...btnStyle(),
            width: '60px',
            height: '60px',
            fontSize: '8px',
            ...extra,
        });

        // --- Joystick (bottom-left) ---
        const joystickBase = document.createElement('div');
        joystickBase.id = 'mc-joystick-base';
        Object.assign(joystickBase.style, {
            position: 'absolute',
            bottom: '20px',
            left: '20px',
            width: '110px',
            height: '110px',
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.35)',
            border: '2px solid rgba(255,255,255,0.4)',
            pointerEvents: 'auto',
            touchAction: 'none',
        });

        const joystickKnob = document.createElement('div');
        joystickKnob.id = 'mc-joystick-knob';
        Object.assign(joystickKnob.style, {
            position: 'absolute',
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.5)',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%,-50%)',
            pointerEvents: 'none',
        });
        joystickBase.appendChild(joystickKnob);
        overlay.appendChild(joystickBase);

        // --- Utility buttons above joystick (bottom-left area) ---
        const btnPause = document.createElement('div');
        btnPause.id = 'mc-btn-pause';
        btnPause.innerText = 'PAUSE';
        Object.assign(btnPause.style, smallBtnStyle({ bottom: '150px', left: '20px' }));
        overlay.appendChild(btnPause);

        const btnWarp = document.createElement('div');
        btnWarp.id = 'mc-btn-warp';
        btnWarp.innerText = 'WARP';
        Object.assign(btnWarp.style, smallBtnStyle({ bottom: '150px', left: '90px', display: 'none' }));
        overlay.appendChild(btnWarp);

        // --- Diamond action buttons (bottom-right) ---
        // Layout: CLUE top, TALK left (hold-anywhere triggers FLY), BOMB right, ATTACK bottom
        const btnClue = document.createElement('div');
        btnClue.id = 'mc-btn-clue';
        btnClue.innerText = 'CLUE';
        Object.assign(btnClue.style, btnStyle({ bottom: '180px', right: '90px' }));
        overlay.appendChild(btnClue);

        // Diamond: center at 130px from right, 150px from bottom, 70px offset between centers
        // CLUE (top):   center=(130R, 220B) → right=90,  bottom=180
        // TALK (left):  center=(200R, 150B) → right=160, bottom=110
        // BOMB (right): center=(60R,  150B) → right=20,  bottom=110
        // ATTACK (bot): center=(130R, 80B)  → right=90,  bottom=40

        const btnInteract = document.createElement('div');
        btnInteract.id = 'mc-btn-interact';
        btnInteract.innerText = 'TALK';
        Object.assign(btnInteract.style, btnStyle({ bottom: '110px', right: '160px' }));
        overlay.appendChild(btnInteract);

        const btnBomb = document.createElement('div');
        btnBomb.id = 'mc-btn-bomb';
        btnBomb.innerText = 'BOMB';
        Object.assign(btnBomb.style, btnStyle({ bottom: '110px', right: '20px' }));
        overlay.appendChild(btnBomb);

        const btnAttack = document.createElement('div');
        btnAttack.id = 'mc-btn-attack';
        btnAttack.innerText = 'ATTACK';
        Object.assign(btnAttack.style, btnStyle({ bottom: '40px', right: '90px' }));
        overlay.appendChild(btnAttack);

        document.body.appendChild(overlay);
        return overlay;
    }

    private bindEvents() {
        // Button taps — only intercept when game is active so UI modals behind the
        // overlay can still receive touches when mobileActive is false.
        const btn = (el: HTMLElement, cb: () => void) => {
            el.addEventListener('touchstart', (e) => {
                if (!this.controls.mobileActive) return;
                e.preventDefault();
                e.stopPropagation();
                cb();
            }, { passive: false });
        };

        // TALK behaves like the E key — fires regardless of mobileActive so it can
        // both open dialogue and close it (inn, dialogue box, etc.)
        this.btnInteract.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.onInteract?.();
        }, { passive: false });

        btn(this.btnAttack, () => this.onAttack?.());

        // CLUE is a toggle — must fire whether the tracker is open or closed.
        this.btnClue.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.onClueTracker?.();
        }, { passive: false });

        btn(this.btnBomb, () => this.onBomb?.());
        btn(this.btnPause, () => this.onPause?.());
        btn(this.btnWarp, () => this.onTeleport?.());

        // Joystick gets its own non-passive listener so it can preventDefault without
        // poisoning the document-level listener (which would block scroll in modals).
        this.joystickBase.addEventListener('touchstart', (e) => {
            if (!this.controls.mobileActive) return;
            e.preventDefault();
            const t = e.changedTouches[0];
            if (this.joystickTouchId !== null) return;
            this.joystickTouchId = t.identifier;
            const r = this.joystickBase.getBoundingClientRect();
            this.joystickCenterX = r.left + r.width / 2;
            this.joystickCenterY = r.top + r.height / 2;
            this.updateJoystick(t.clientX, t.clientY);
        }, { passive: false });

        // Document-level listeners are all passive so iOS never blocks scroll.
        document.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: true });
        document.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: true });
        document.addEventListener('touchend', this.onTouchEnd.bind(this), { passive: true });
        document.addEventListener('touchcancel', this.onTouchEnd.bind(this), { passive: true });
    }

    private isInsideElement(el: HTMLElement, x: number, y: number): boolean {
        const r = el.getBoundingClientRect();
        return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    }

    private isInsideAnyButton(x: number, y: number): boolean {
        return (
            this.isInsideElement(this.btnInteract, x, y) ||
            this.isInsideElement(this.btnClue, x, y) ||
            this.isInsideElement(this.btnBomb, x, y) ||
            this.isInsideElement(this.btnAttack, x, y) ||
            this.isInsideElement(this.btnPause, x, y) ||
            this.isInsideElement(this.btnWarp, x, y)
        );
    }

    private cancelFlyHold() {
        if (this.flyHoldTimer !== null) {
            clearTimeout(this.flyHoldTimer);
            this.flyHoldTimer = null;
        }
    }

    private onTouchStart(e: TouchEvent) {
        // Only intercept touches when the game is actively running.
        if (!this.controls.mobileActive) return;

        for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            const x = t.clientX, y = t.clientY;

            // Skip buttons and joystick (joystick handled by its own element listener)
            if (this.isInsideAnyButton(x, y)) continue;
            if (this.isInsideElement(this.joystickBase, x, y)) continue;

            // Look zone — claim for camera drag; start hold timer for fly toggle
            if (this.lookTouchId === null) {
                this.lookTouchId = t.identifier;
                this.lookLastX = x;
                this.lookLastY = y;
                this.lookStartX = x;
                this.lookStartY = y;

                this.flyHoldTimer = setTimeout(() => {
                    this.flyHoldTimer = null;
                    this.onFly?.();
                }, this.FLY_HOLD_MS);
            }
        }
    }

    private onTouchMove(e: TouchEvent) {
        if (!this.controls.mobileActive) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            if (t.identifier === this.joystickTouchId) {
                this.updateJoystick(t.clientX, t.clientY);
            } else if (t.identifier === this.lookTouchId) {
                const dx = t.clientX - this.lookLastX;
                const dy = t.clientY - this.lookLastY;
                this.lookLastX = t.clientX;
                this.lookLastY = t.clientY;
                this.yaw -= dx * this.sensitivity;
                this.pitch -= dy * this.sensitivity;
                const limit = Math.PI / 2 * 0.9;
                this.pitch = Math.max(-limit, Math.min(limit, this.pitch));

                // Cancel fly hold if finger has drifted more than 10px
                const totalDx = t.clientX - this.lookStartX;
                const totalDy = t.clientY - this.lookStartY;
                if (Math.sqrt(totalDx * totalDx + totalDy * totalDy) > 10) {
                    this.cancelFlyHold();
                }
            }
        }
    }

    private onTouchEnd(e: TouchEvent) {
        for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            if (t.identifier === this.joystickTouchId) {
                this.joystickTouchId = null;
                this.resetJoystick();
            } else if (t.identifier === this.lookTouchId) {
                this.lookTouchId = null;
                this.cancelFlyHold();
            }
        }
    }

    private updateJoystick(touchX: number, touchY: number) {
        let dx = touchX - this.joystickCenterX;
        let dy = touchY - this.joystickCenterY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > this.joystickRadius) {
            dx = (dx / dist) * this.joystickRadius;
            dy = (dy / dist) * this.joystickRadius;
        }

        this.joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

        const nx = dx / this.joystickRadius;
        const ny = dy / this.joystickRadius;
        this.mfwd = ny < -0.25;
        this.mbwd = ny > 0.25;
        this.mlft = nx < -0.25;
        this.mrgt = nx > 0.25;
        this.controls.setMobileMovement(this.mfwd, this.mbwd, this.mlft, this.mrgt);
    }

    private resetJoystick() {
        this.joystickKnob.style.transform = 'translate(-50%, -50%)';
        this.mfwd = this.mbwd = this.mlft = this.mrgt = false;
        this.controls.setMobileMovement(false, false, false, false);
    }

    public applyLook(camera: THREE.Camera) {
        camera.rotation.order = 'YXZ';
        camera.rotation.y = this.yaw;
        camera.rotation.x = this.pitch;
    }

    public setJoystickVisible(visible: boolean) {
        this.joystickBase.style.display = visible ? 'block' : 'none';
        this.btnPause.style.display = visible ? 'flex' : 'none';
        // WARP follows the same rule but only shows when teleport is unlocked;
        // hide it here and let updateState re-show it when appropriate.
        if (!visible) this.btnWarp.style.display = 'none';
    }

    public updateState(canFly: boolean, canTeleport: boolean, canLevelUp: boolean) {
        this.btnWarp.style.display = canTeleport ? 'flex' : 'none';

        const xpDisplay = document.getElementById('xp-display');
        if (xpDisplay) {
            if (canLevelUp) {
                xpDisplay.style.pointerEvents = 'auto';
                xpDisplay.style.cursor = 'pointer';
            } else {
                xpDisplay.style.pointerEvents = 'none';
                xpDisplay.style.cursor = 'default';
            }
        }
    }
}
