import * as THREE from 'three';
import { gameConfig } from '../config/gameConfig';

export class Renderer {
    public scene: THREE.Scene;
    public camera: THREE.PerspectiveCamera;
    public renderer: THREE.WebGLRenderer;

    constructor() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB); // Sky blue
        this.scene.fog = new THREE.Fog(0x87CEEB, 0, 750);

        this.camera = new THREE.PerspectiveCamera(
            gameConfig.camera.fov,
            gameConfig.renderer.width / gameConfig.renderer.height,
            gameConfig.camera.near,
            gameConfig.camera.far
        );
        this.camera.position.y = 10; // Eye level

        this.renderer = new THREE.WebGLRenderer({ antialias: gameConfig.renderer.antialias });
        this.renderer.setSize(gameConfig.renderer.width, gameConfig.renderer.height);
        this.renderer.setPixelRatio(gameConfig.renderer.pixelRatio);

        // Pixelated look for retro style
        this.renderer.domElement.style.imageRendering = 'pixelated';

        document.body.appendChild(this.renderer.domElement);

        window.addEventListener('resize', this.onWindowResize.bind(this), false);
    }

    private onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    public render() {
        this.renderer.render(this.scene, this.camera);
    }
}
