export class AudioManager {
    private context: AudioContext;
    private sfxGain: GainNode;
    private buffers = new Map<string, AudioBuffer>();

    // HTMLAudioElement is fine for long looping music (streaming, low memory)
    private musicEl = new Audio();
    private currentSrc = '';

    constructor() {
        this.context = new AudioContext(); // starts suspended until resume() is called
        this.sfxGain = this.context.createGain();
        this.sfxGain.gain.value = 0.7;
        this.sfxGain.connect(this.context.destination);

        this.musicEl.loop = true;
        this.musicEl.volume = 0.4;
    }

    /** Call once after the first user gesture so the AudioContext can run. */
    public resume() {
        if (this.context.state === 'suspended') this.context.resume();
    }

    /** Pre-fetch and decode a sound file into the buffer cache. */
    public async preload(src: string): Promise<void> {
        if (this.buffers.has(src)) return;
        try {
            const res = await fetch(src);
            const arr = await res.arrayBuffer();
            const buf = await this.context.decodeAudioData(arr);
            this.buffers.set(src, buf);
        } catch (e) {
            console.warn(`AudioManager: failed to preload ${src}`, e);
        }
    }

    /** Pre-load every SFX in the list concurrently. */
    public async preloadAll(srcs: string[]): Promise<void> {
        await Promise.all(srcs.map(s => this.preload(s)));
    }

    /**
     * Play a pre-loaded sound from its buffer.
     * Creating a BufferSourceNode is near-zero cost — no I/O, no decoding.
     */
    public playSound(src: string) {
        const buf = this.buffers.get(src);
        if (!buf) return;
        const node = this.context.createBufferSource();
        node.buffer = buf;
        node.connect(this.sfxGain);
        node.start(0);
    }

    /** Switch looping background music track. No-op if already playing. */
    public playMusic(src: string) {
        if (src === this.currentSrc) return;
        this.currentSrc = src;
        this.musicEl.src = src;
        this.musicEl.currentTime = 0;
        this.musicEl.play().catch(() => { });
    }

    public setMusicVolume(v: number) { this.musicEl.volume = 0.4 * v; }
    public setSfxVolume(v: number) { this.sfxGain.gain.value = 0.7 * v; }

    /** Scale both music and SFX together. v is 0–1. */
    public setMasterVolume(v: number) {
        this.setMusicVolume(v);
        this.setSfxVolume(v);
    }

    public pauseMusic() { this.musicEl.pause(); }
    public resumeMusic() { if (this.currentSrc) this.musicEl.play().catch(() => { }); }
}

/** Maps enemy entity type → hit sound path. */
export const ENTITY_HIT_SOUNDS: Record<string, string> = {
    slime: '/sounds/slime_hit.wav',
    mushroom: '/sounds/mushroom_hit.wav',
    snake: '/sounds/snake_hit.wav',
    druid: '/sounds/wizard_hit.wav',
    skeleton: '/sounds/skeleton_hit.wav',
    dude: '/sounds/bandit_hit.wav',
    chick: '/sounds/bandit_hit.wav',
    soldier: '/sounds/soldier_hit.wav',
    demon: '/sounds/demon_hit.wav',
    bee: '/sounds/bee_hit.wav',
    man_eater_flower: '/sounds/man_eater_hit.wav',
    arachne: '/sounds/arachne_hit.wav',
    eyeball: '/sounds/eye_hit.wav',
    fire_skull: '/sounds/fire_skull_hit.wav',
};

/** All SFX paths to pre-load at startup. */
export const ALL_SFX: string[] = [
    ...Object.values(ENTITY_HIT_SOUNDS).filter((v, i, a) => a.indexOf(v) === i),
    '/sounds/player_slash.wav',
    '/sounds/player_hit.wav',
    '/sounds/player_block.wav',
    '/sounds/level_up.wav',
    '/sounds/wizard_teleport.wav',
    '/sounds/wizard_fire.wav',
    '/sounds/skeleton_shoot.wav',
    '/sounds/demon_shoot.wav',
    '/sounds/demon_death.mp3',
    '/sounds/eye_shoot.wav',
    '/sounds/temple_cleared.wav',
    '/sounds/open_chest.wav',
    '/sounds/task_complete.wav',
    '/sounds/bomb_blast.wav',
    '/sounds/minion-cackle.ogg',
    '/sounds/binding_found.wav',
    '/sounds/player_rest.wav',
    '/sounds/player_train.wav',
];
