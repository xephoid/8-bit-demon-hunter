export const gameConfig = {
    renderer: {
        width: window.innerWidth,
        height: window.innerHeight,
        antialias: false, // Retro style often disables antialias
        pixelRatio: 1 // Fixed pixel ratio for consistent retro look?
    },
    camera: {
        fov: 75,
        near: 0.1,
        far: 1000
    },
    controls: {
        speed: 10.0,
        sensitivity: 0.002
    }
};
