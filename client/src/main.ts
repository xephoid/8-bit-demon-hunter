import './style.css'
import * as THREE from 'three';
import { Renderer } from './engine/Renderer';
import { AssetManager } from './engine/AssetManager';
import { LevelBuilder } from './engine/LevelBuilder';
import { EntityManager } from './engine/EntityManager';
import { Controls } from './engine/Controls';
import { MobileControls } from './engine/MobileControls';
import { DialogueUI } from './ui/DialogueUI';
import { ClueTrackerUI } from './ui/ClueTrackerUI';
import { LevelUpUI } from './ui/LevelUpUI';
import { MinimapUI } from './ui/MinimapUI';
import type { GameTask, Person, Clue } from '../../shared/src/data/GameData';
import { RESOURCE_BASE_VALUE, RESOURCE_DISPLAY_NAME, TEMPLE_ENEMY_TYPES } from '../../shared/src/data/GameData';
import { Dialogue } from './data/dialogue';
import { API_BASE, apiFetch } from './config/api';
import { AudioManager, ENTITY_HIT_SOUNDS, ALL_SFX } from './engine/AudioManager';
import { ModelManager } from './engine/ModelManager';
import { StartScreenUI } from './ui/StartScreenUI';
import { InnUI } from './ui/InnUI';
import { BanditTradeUI } from './ui/BanditTradeUI';
import { HOW_TO_HTML } from './ui/howToContent';
import { trackEvent, flushEvents } from './analytics';

// --- PLAYER STATE ---
const playerState = {
  level: 1,
  xp: 0,
  strength: 1,
  agility: 1,
  range: 1,
  hp: 3,
  maxHp: 3,
  isDead: false,
  invulnTimer: 0,
  activeTask: null as GameTask | null,
  knownClues: [] as Clue[],
  visitedPeople: new Map<string, Person>(), // Track people met globally
  inventory: [] as string[],
  items: [] as any[], // Global item registry
  towns: [] as any[], // Global town registry
  visitedTownIds: [] as string[],
  canLevelUp: false,
  templesCompleted: [] as string[],
  hasLocksmithPower: false,
  unlockedHouses: new Set<string>(),
  demonBindings: [] as string[],
  suspectedPeople: new Set<string>(),
  shuckles: 5,
  resources: { plant_fiber: 0, wood: 0, demon_powder: 0, demon_ichor: 0, iron_ore: 0, gold: 0 },
  bombs: 0,
  lockpicks: 0,
  innStocks: {} as { [townId: string]: { [resource: string]: number } }
};

let gameConfig: any;
let inDemonArena = false;
let worldCleared = false;
const arenaSize = { w: 30, h: 30 };

const init = async () => {
  // 1. Setup Renderer
  const renderer = new Renderer();

  // 2. Load Assets
  const assetManager = new AssetManager();
  const manifestResponse = await fetch('/data/assets.json');
  const manifest = await manifestResponse.json();

  await assetManager.loadAssets(manifest);

  const configRes = await apiFetch(`${API_BASE}/api/config`);
  gameConfig = await configRes.json();

  // 3. Setup Scene
  const scene = renderer.scene;
  const entityManager = new EntityManager(scene, assetManager, gameConfig);
  const builder = new LevelBuilder(scene, assetManager);

  // Audio
  const audio = new AudioManager();

  // 3D Model landmarks
  const modelManager = new ModelManager(scene);
  entityManager.onDemonPhase2 = () => {
    const pool: string[] = (gameConfig.enemies ?? [])
      .map((e: any) => e.id)
      .filter((id: string) => id !== 'bat' && id !== 'demon');
    const enemyTypes: string[] = [];
    const available = pool.slice();
    for (let i = 0; i < 3; i++) {
      if (available.length === 0) break;
      const idx = Math.floor(Math.random() * available.length);
      enemyTypes.push(available.splice(idx, 1)[0]);
    }
    const cx = Math.floor(arenaSize.w / 2), cz = Math.floor(arenaSize.h / 2);
    enemyTypes.forEach((type, i) => {
      const angle = (i / 3) * Math.PI * 2;
      entityManager.addEntity({
        type,
        name: 'Demon Minion',
        x: Math.round(cx + Math.cos(angle) * 4),
        y: Math.round(cz + Math.sin(angle) * 4),
        properties: { hp: 10 }
      });
    });
  };

  entityManager.onDemonDying = () => {
    audio.pauseMusic();
    audio.playSound('/sounds/demon_death.mp3');
  };

  entityManager.onEntityHit = (type) => {
    const src = ENTITY_HIT_SOUNDS[type];
    if (src) audio.playSound(src);
  };
  entityManager.onEntityTeleport = () => audio.playSound('/sounds/wizard_teleport.wav');
  entityManager.onEntityShoot = (type) => {
    if (type === 'fireball') audio.playSound('/sounds/wizard_fire.wav');
    else if (type === 'evil') audio.playSound('/sounds/demon_shoot.wav');
    else if (type === 'eye_lazer') audio.playSound('/sounds/eye_shoot.wav');
    else audio.playSound('/sounds/skeleton_shoot.wav');
  };
  entityManager.onEntityKilled = (type, _x, _z) => {
    const isTemple = currentWorldData?.type === 'temple';
    let resource: string | null = null;
    if (type === 'plant') resource = 'plant_fiber';
    else if (type === 'tree') resource = 'wood';
    else if (isTemple) resource = 'demon_ichor';
    else if (!['dude', 'chick'].includes(type)) resource = 'demon_powder';
    if (resource) {
      (playerState.resources as Record<string, number>)[resource]++;
      showResourcePickup(resource, (playerState.resources as Record<string, number>)[resource]);
    }
  };

  // 4. Setup Controls (Early Init)
  const controls = new Controls(renderer.camera, renderer.renderer.domElement);

  // Mobile detection + setup
  const isMobile = MobileControls.isMobileDevice();
  let mobileControls: MobileControls | null = null;

  if (isMobile) {
    controls.isMobile = true;
    controls.mobileActive = false;
  }

  // Sensitivity slider
  const sensitivitySlider = document.getElementById('sensitivity-slider') as HTMLInputElement;
  const sensitivityValue = document.getElementById('sensitivity-value') as HTMLSpanElement;
  const savedSensitivity = parseFloat(localStorage.getItem('sensitivity') ?? '1.0');
  sensitivitySlider.value = String(savedSensitivity);
  sensitivityValue.textContent = savedSensitivity.toFixed(1);
  controls.setSensitivity(savedSensitivity);
  sensitivitySlider.addEventListener('input', () => {
    const v = parseFloat(sensitivitySlider.value);
    sensitivityValue.textContent = v.toFixed(1);
    controls.setSensitivity(v);
    trackEvent('settings_changed', { setting: 'sensitivity', value: v });
    localStorage.setItem('sensitivity', String(v));
  });

  const musicVolumeSlider = document.getElementById('music-volume-slider') as HTMLInputElement;
  const musicVolumeValue = document.getElementById('music-volume-value') as HTMLSpanElement;
  const savedMusicVolume = parseFloat(localStorage.getItem('music-volume') ?? '1.0');
  musicVolumeSlider.value = String(savedMusicVolume);
  musicVolumeValue.textContent = savedMusicVolume.toFixed(1);
  audio.setMusicVolume(savedMusicVolume);
  musicVolumeSlider.addEventListener('input', () => {
    const v = parseFloat(musicVolumeSlider.value);
    musicVolumeValue.textContent = v.toFixed(1);
    audio.setMusicVolume(v);
    localStorage.setItem('music-volume', String(v));
    trackEvent('settings_changed', { setting: 'music_volume', value: v });
  });

  const sfxVolumeSlider = document.getElementById('sfx-volume-slider') as HTMLInputElement;
  const sfxVolumeValue = document.getElementById('sfx-volume-value') as HTMLSpanElement;
  const savedSfxVolume = parseFloat(localStorage.getItem('sfx-volume') ?? '1.0');
  sfxVolumeSlider.value = String(savedSfxVolume);
  sfxVolumeValue.textContent = savedSfxVolume.toFixed(1);
  audio.setSfxVolume(savedSfxVolume);
  sfxVolumeSlider.addEventListener('input', () => {
    const v = parseFloat(sfxVolumeSlider.value);
    sfxVolumeValue.textContent = v.toFixed(1);
    audio.setSfxVolume(v);
    localStorage.setItem('sfx-volume', String(v));
    trackEvent('settings_changed', { setting: 'sfx_volume', value: v });
  });

  // Pause screen: Settings / Stats / How To Play tabs
  const pauseBtnSettings = document.getElementById('pause-btn-settings') as HTMLButtonElement;
  const pauseBtnStats = document.getElementById('pause-btn-stats') as HTMLButtonElement;
  const pauseBtnHowto = document.getElementById('pause-btn-howto') as HTMLButtonElement;
  const pauseBtnItems = document.getElementById('pause-btn-items') as HTMLButtonElement;
  const pauseBtnResources = document.getElementById('pause-btn-resources') as HTMLButtonElement;
  const pauseSettingsPanel = document.getElementById('pause-settings') as HTMLDivElement;
  const pauseStatsPanel = document.getElementById('pause-stats') as HTMLDivElement;
  const pauseHowtoPanel = document.getElementById('pause-howto') as HTMLDivElement;
  const pauseItemsPanel = document.getElementById('pause-items') as HTMLDivElement;
  const pauseResourcesPanel = document.getElementById('pause-resources') as HTMLDivElement;

  pauseHowtoPanel.innerHTML = `<div style="overflow-y:auto;max-height:55vh;width:100%;background:#111;border:2px solid #444;padding:16px 22px;box-sizing:border-box;line-height:1.8;font-size:10px;color:#ddd;text-align:left;">${HOW_TO_HTML}</div>`;

  const updatePauseStats = () => {
    const prog = gameConfig.playerProgression;
    const maxStats = prog.stats;
    const xpText = playerState.level >= prog.maxLevel
      ? 'MAX'
      : `${playerState.xp} / ${prog.xpCurve[playerState.level - 1]}`;
    pauseStatsPanel.innerHTML = `
<div style="background:#111;border:2px solid #444;padding:24px 32px;width:100%;box-sizing:border-box;font-size:11px;line-height:2.2;color:#ddd;">
  <div style="color:#FFD700;margin-bottom:4px;">LEVEL</div>
  <div style="margin-bottom:16px;">${playerState.level} / ${prog.maxLevel}</div>
  <div style="color:#FFD700;margin-bottom:4px;">XP</div>
  <div style="margin-bottom:24px;">${xpText}</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 32px;">
    <div style="color:#aaa;">STRENGTH</div><div>${playerState.strength} / ${maxStats.strength.max}</div>
    <div style="color:#aaa;">AGILITY</div><div>${playerState.agility} / ${maxStats.agility.max}</div>
    <div style="color:#aaa;">HEALTH</div><div>${playerState.maxHp} / ${maxStats.health.max}</div>
    <div style="color:#aaa;">RANGE</div><div>${playerState.range} / ${maxStats.range.max}</div>
  </div>
</div>`.trim();
  };

  const updatePauseItems = () => {
    if (playerState.templesCompleted.length === 0) {
      pauseItemsPanel.innerHTML = `<div style="color:#666;font-size:10px;padding:20px;">No magic items collected yet.</div>`;
      return;
    }
    pauseItemsPanel.innerHTML = playerState.templesCompleted.map(type => {
      const d = MAGIC_ITEM_DATA[type];
      if (!d) return '';
      return `<div style="display:flex;align-items:center;gap:16px;background:#111;border:1px solid #444;padding:16px;margin-bottom:10px;width:100%;box-sizing:border-box;">
        <img src="/sprites/sliced/${d.iconKey}.png" style="width:48px;height:48px;image-rendering:pixelated;flex-shrink:0;">
        <div>
          <div style="color:#FFD700;font-size:10px;margin-bottom:6px;">${d.name}</div>
          <div style="color:#ccc;font-size:8px;line-height:1.8;">${d.description}</div>
        </div>
      </div>`;
    }).join('');
  };

  const updatePauseResources = () => {
    const res = playerState.resources as Record<string, number>;
    const resourceIconFile = (key: string) => key === 'gold' ? 'resource_gold_ore' : `resource_${key}`;
    const rows = Object.entries(RESOURCE_DISPLAY_NAME).map(([key, name]) =>
      `<div style="color:#aaa;display:flex;align-items:center;gap:4px;"><img src="/sprites/sliced/${resourceIconFile(key)}.png" style="width:14px;height:14px;image-rendering:pixelated;">${name}</div><div>${res[key] ?? 0}</div>`
    ).join('');
    pauseResourcesPanel.innerHTML = `
<div style="background:#111;border:2px solid #444;padding:24px 32px;width:100%;box-sizing:border-box;font-size:11px;line-height:2.2;color:#ddd;">
  <div style="color:#aaffaa;margin-bottom:4px;">SHUCKLES</div>
  <div style="margin-bottom:16px;">\uD83D\uDC1A ${playerState.shuckles}</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 32px;">${rows}</div>
  <div style="border-top:1px solid #444;margin-top:16px;padding-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:8px 32px;">
    <div style="color:#aaa;">Bombs</div><div>${playerState.bombs}</div>
    <div style="color:#aaa;">Lockpicks</div><div>${playerState.lockpicks}</div>
  </div>
</div>`.trim();
  };

  let lastPauseTab: 'settings' | 'stats' | 'howto' | 'items' | 'resources' = 'settings';
  const showPauseTab = (tab: 'settings' | 'stats' | 'howto' | 'items' | 'resources') => {
    lastPauseTab = tab;
    pauseSettingsPanel.style.display = tab === 'settings' ? 'flex' : 'none';
    pauseStatsPanel.style.display = tab === 'stats' ? 'flex' : 'none';
    pauseHowtoPanel.style.display = tab === 'howto' ? 'flex' : 'none';
    pauseItemsPanel.style.display = tab === 'items' ? 'flex' : 'none';
    pauseResourcesPanel.style.display = tab === 'resources' ? 'flex' : 'none';
    pauseBtnSettings.classList.toggle('active', tab === 'settings');
    pauseBtnStats.classList.toggle('active', tab === 'stats');
    pauseBtnHowto.classList.toggle('active', tab === 'howto');
    pauseBtnItems.classList.toggle('active', tab === 'items');
    pauseBtnResources.classList.toggle('active', tab === 'resources');
    if (tab === 'stats') updatePauseStats();
    if (tab === 'items') updatePauseItems();
    if (tab === 'resources') updatePauseResources();
  };

  pauseBtnSettings.addEventListener('click', () => showPauseTab('settings'));
  pauseBtnStats.addEventListener('click', () => showPauseTab('stats'));
  pauseBtnHowto.addEventListener('click', () => showPauseTab('howto'));
  pauseBtnItems.addEventListener('click', () => showPauseTab('items'));
  pauseBtnResources.addEventListener('click', () => showPauseTab('resources'));

  const pauseBtnResume = document.getElementById('pause-btn-resume') as HTMLButtonElement;
  pauseBtnResume.addEventListener('click', () => {
    controls.lock();
  });

  // Pre-load all sound effects into AudioBuffers (zero I/O on playback)
  audio.preloadAll(ALL_SFX).catch(e => console.warn('SFX preload error:', e));

  // --- TEMPLE POWERS STATE ---
  // Winged Boots (Sky)
  const playerFly = { flyY: 0, flyTarget: 0 };

  // Protection Aura (Earth)
  let auraActive = false;
  const auraOverlay = document.createElement('div');
  Object.assign(auraOverlay.style, {
    position: 'fixed', inset: '0', border: '8px solid #44ff88',
    boxShadow: 'inset 0 0 40px rgba(68,255,136,0.35)',
    pointerEvents: 'none', display: 'none', zIndex: '50', transition: 'opacity 0.1s'
  });
  document.body.appendChild(auraOverlay);

  // Pending lockpick confirmation state
  let pendingLockpickPersonId: string | null = null;

  // Fire Bombs (Fire)
  let activeBomb: { sprite: THREE.Sprite; timer: number; wx: number; wz: number } | null = null;
  let activeExplosion: { sprite: THREE.Sprite; frame: number; elapsed: number } | null = null;
  const EXPLOSION_FRAMES = 12;
  const EXPLOSION_FRAME_TIME = 0.07; // seconds per frame

  // Teleport Cape (Space) — built once, reused
  const teleportMenu = document.createElement('div');
  Object.assign(teleportMenu.style, {
    position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
    background: 'rgba(0,0,0,0.92)', border: '2px solid #ffd700',
    padding: '30px', color: 'white', fontFamily: '"Press Start 2P", monospace',
    display: 'none', flexDirection: 'column', gap: '12px', zIndex: '300',
    minWidth: '280px', textAlign: 'center'
  });
  teleportMenu.innerHTML = '<div style="color:#ffd700;margin-bottom:12px;font-size:1.1em">TELEPORT</div>';
  const teleportList = document.createElement('div');
  Object.assign(teleportList.style, { display: 'flex', flexDirection: 'column', gap: '8px' });
  teleportMenu.appendChild(teleportList);
  const teleportClose = document.createElement('button');
  teleportClose.innerText = 'Cancel';
  Object.assign(teleportClose.style, {
    marginTop: '10px', padding: '8px 16px', background: '#333',
    color: 'white', border: '1px solid #666', cursor: 'pointer', fontFamily: 'inherit'
  });
  teleportClose.onclick = () => { teleportMenu.style.display = 'none'; controls.lock(); };
  teleportMenu.appendChild(teleportClose);
  document.body.appendChild(teleportMenu);

  // --- MAGIC ITEM DATA ---
  const MAGIC_ITEM_DATA: Record<string, { iconKey: string; name: string; description: string }> = {
    sky: {
      iconKey: 'magic_amulet_of_flight', name: 'Amulet of Flight',
      description: 'Press Q to ascend. Press Q again to descend.'
    },
    earth: {
      iconKey: 'magic_aura_of_protection', name: 'Aura of Protection',
      description: 'Hold RMB to become invulnerable. Cannot move or attack while active.'
    },
    space: {
      iconKey: 'magic_cape_of_teleportation', name: 'Cape of Teleportation',
      description: 'Press X to open the warp menu. Select any town to teleport there.'
    },
    light: {
      iconKey: 'magic_eye_of_truth', name: 'Eye of Truth',
      description: 'Passive. Demon and minion rumors appear in red during dialogue.'
    },
    fire: {
      iconKey: 'magic_bomb_lit', name: 'Fire Bomb',
      description: 'Press Z to place a bomb (overworld only). 3 second fuse. 5-tile blast radius. One at a time.'
    },
  };

  // --- POWER POPUP ---
  let powerPopupOpen = false;
  let chestMarker: { x: number; y: number } | null = null;

  const powerPopup = document.createElement('div');
  Object.assign(powerPopup.style, {
    position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.85)',
    display: 'none', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: '18px', zIndex: '260', pointerEvents: 'all',
    fontFamily: '"Press Start 2P", monospace'
  });

  const powerIconEl = document.createElement('img');
  Object.assign(powerIconEl.style, {
    width: '96px', height: '96px', imageRendering: 'pixelated',
    animation: 'power-rise 0.8s ease-out forwards'
  });

  const powerNameEl = document.createElement('div');
  Object.assign(powerNameEl.style, {
    color: '#ffd700', fontSize: '18px', textAlign: 'center',
    opacity: '0', animation: 'power-fade-in 0.5s ease-out 1.2s forwards'
  });

  const powerDescEl = document.createElement('div');
  Object.assign(powerDescEl.style, {
    color: '#ddd', fontSize: '10px', maxWidth: '380px', textAlign: 'center',
    lineHeight: '2', opacity: '0', animation: 'power-fade-in 0.5s ease-out 1.7s forwards'
  });

  const powerHintEl = document.createElement('button');
  Object.assign(powerHintEl.style, {
    marginTop: '12px', padding: '12px 32px',
    background: 'transparent', border: '2px solid #ffd700',
    color: '#ffd700', fontFamily: '"Press Start 2P", monospace',
    fontSize: '11px', cursor: 'pointer',
    opacity: '0', animation: 'power-fade-in 0.5s ease-out 2.2s forwards'
  });
  powerHintEl.innerText = 'CONTINUE';

  powerPopup.append(powerIconEl, powerNameEl, powerDescEl, powerHintEl);
  document.body.appendChild(powerPopup);

  const showPowerPopup = (templeType: string) => {
    const data = MAGIC_ITEM_DATA[templeType];
    if (!data) return;
    controls.unlock();
    powerPopupOpen = true;
    powerIconEl.src = `/sprites/sliced/${data.iconKey}.png`;
    powerNameEl.innerText = data.name;
    powerDescEl.innerText = data.description;
    powerPopup.style.display = 'flex';
    // Restart CSS animations via forced reflow
    [powerIconEl, powerNameEl, powerDescEl, powerHintEl].forEach(el => {
      el.style.animation = 'none';
      void el.offsetHeight;
      el.style.animation = '';
    });
    powerIconEl.style.animation = 'power-rise 0.8s ease-out forwards';
    powerNameEl.style.animation = 'power-fade-in 0.5s ease-out 1.2s forwards';
    powerDescEl.style.animation = 'power-fade-in 0.5s ease-out 1.7s forwards';
    powerHintEl.style.animation = 'power-fade-in 0.5s ease-out 2.2s forwards';
  };

  const hidePowerPopup = () => {
    powerPopupOpen = false;
    powerPopup.style.display = 'none';
    controls.lock();
  };
  powerPopup.addEventListener('click', hidePowerPopup);

  // --- SIMPLE NOTIFICATION BANNER ---
  const notifBanner = document.createElement('div');
  Object.assign(notifBanner.style, {
    position: 'fixed', top: '30%', left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.85)', border: '2px solid #ffd700', color: '#fff',
    fontFamily: '"Press Start 2P", monospace', fontSize: '11px',
    padding: '14px 24px', borderRadius: '4px', zIndex: '270',
    display: 'none', pointerEvents: 'none', textAlign: 'center', maxWidth: '400px',
    lineHeight: '1.8'
  });
  document.body.appendChild(notifBanner);
  let notifTimer: ReturnType<typeof setTimeout> | null = null;
  const showNotif = (text: string, durationMs: number = 2500) => {
    notifBanner.innerText = text;
    notifBanner.style.display = 'block';
    if (notifTimer) clearTimeout(notifTimer);
    notifTimer = setTimeout(() => { notifBanner.style.display = 'none'; }, durationMs);
  };

  // --- RESOURCE PICKUP HUD ---
  const resourceNotifStack: HTMLElement[] = [];
  const RESOURCE_DISPLAY_NAMES: Record<string, string> = {
    ...RESOURCE_DISPLAY_NAME,
    shuckles: 'Shuckles', bombs: 'Bombs', lockpicks: 'Lockpicks',
  };
  const showResourcePickup = (resourceKey: string, total: number) => {
    // Trim stack to 2 before adding a 3rd
    while (resourceNotifStack.length >= 3) {
      const old = resourceNotifStack.shift();
      old?.remove();
    }
    // Shift existing notifs up
    resourceNotifStack.forEach((el, i) => {
      el.style.bottom = `${80 + (resourceNotifStack.length - i) * 44}px`;
    });
    const el = document.createElement('div');
    const name = RESOURCE_DISPLAY_NAMES[resourceKey] ?? resourceKey;
    el.innerText = `+1 ${name}: ${total}`;
    Object.assign(el.style, {
      position: 'fixed', left: '16px',
      bottom: `${80 + resourceNotifStack.length * 44}px`,
      background: 'rgba(0,0,0,0.75)', border: '1px solid #888',
      color: '#fff', fontFamily: '"Press Start 2P", monospace', fontSize: '11px',
      padding: '8px 14px', borderRadius: '3px', zIndex: '260',
      pointerEvents: 'none', transition: 'opacity 0.4s',
    });
    document.body.appendChild(el);
    resourceNotifStack.push(el);
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => {
        el.remove();
        const idx = resourceNotifStack.indexOf(el);
        if (idx !== -1) resourceNotifStack.splice(idx, 1);
      }, 400);
    }, 2100);
  };

  // --- WORLD LOADING ---
  const loadWorld = async (worldData: any) => {
    currentWorldData = worldData;
    worldCleared = false;

    // If the player already collected this temple's item, suppress chest reveal
    if (worldData.type === 'temple') {
      const templeType = String(worldData.customId || '').replace('temple_', '');
      if (playerState.templesCompleted.includes(templeType)) {
        worldCleared = true;
      }
    }

    // Reset per-area power state
    playerFly.flyY = 0;
    playerFly.flyTarget = 0;
    renderer.camera.position.y = 2;
    auraActive = false;
    auraOverlay.style.display = 'none';
    if (activeBomb) { scene.remove(activeBomb.sprite); activeBomb = null; }
    if (activeExplosion) { scene.remove(activeExplosion.sprite); activeExplosion = null; }
    teleportMenu.style.display = 'none';
    powerPopupOpen = false;
    powerPopup.style.display = 'none';
    chestMarker = null;

    // Set sky colour based on world type
    if (worldData.type === 'temple') {
      renderer.scene.background = new THREE.Color(0x888888);
    } else if (worldData.type !== 'arena') {
      renderer.scene.background = new THREE.Color(0x87CEEB);
      const oldArenaLight = renderer.scene.getObjectByName('arenaAmbient');
      if (oldArenaLight) renderer.scene.remove(oldArenaLight);
    }

    // Music: towns use town.mp3, temples use temple.mp3, overworld uses overworld.mp3, arena uses boss.mp3
    const isTown = worldData.type === 'city' || String(worldData.customId || '').startsWith('town_');
    const isTemple = worldData.type === 'temple';
    if (isTown) {
      lastTownId = worldData.customId;
      if (!playerState.visitedTownIds.includes(worldData.customId)) {
        playerState.visitedTownIds.push(worldData.customId);
      }
    }
    trackEvent('world_entered', {
      world_id: (worldData.customId ?? worldData.id ?? 'unknown').toString(),
      world_type: isTown ? 'town' : isTemple ? 'temple' : (worldData.type ?? 'overworld'),
    });
    if (worldData.type !== 'arena') {
      if (isTown) pendingMusicTrack = '/music/town.mp3';
      else if (isTemple) pendingMusicTrack = '/music/temple.mp3';
      else pendingMusicTrack = '/music/overworld.mp3';
      if (gameStarted) audio.playMusic(pendingMusicTrack);
    }

    // Town landmark model
    modelManager.clearLandmark();
    if (isTown && worldData.walls) {
      modelManager.placeTownLandmark(worldData.customId, worldData.walls);
    }

    // 1. Clear Previous
    entityManager.spawnEntities([]); // Clears entities
    builder.clear(); // Clears level meshes

    // 2. Build New
    builder.build(worldData);

    // Merge global state (hasMet) into new entities
    if (worldData.entities) {
      worldData.entities.forEach((e: any) => {
        if (e.type === 'person' && e.properties && e.properties.personId) {
          if (playerState.visitedPeople.has(e.properties.personId)) {
            e.properties.hasMet = true;
          }
        }
      });
    }

    entityManager.spawnEntities(worldData.entities);

    // If a temple spawned with no enemies (edge case from spawn filtering), reveal chest immediately
    if (worldData.type === 'temple') {
      const hasEnemies = entityManager.activeEntities.some(e => TEMPLE_ENEMY_TYPES.includes(e.data.type));
      if (!hasEnemies) {
        worldCleared = true;
        chestMarker = entityManager.revealTempleChest();
      }
    }

    // 3. Spawn Player at SpawnPoint (Center of tile)
    if (worldData.spawnPoints && worldData.spawnPoints.length > 0) {
      const spawnPoint = worldData.spawnPoints[0];
      renderer.camera.position.set((spawnPoint.x * 2) + 1, 2, (spawnPoint.y * 2) + 1);
    }

    // 4. Update Controls reference
    controls.setWorldData(worldData);

    // 5. Update Location UI
    const locDisplay = document.getElementById('location-display');
    if (locDisplay) {
      // Use customId to determine name if possible, or fallback to targetName from door?
      // Actually worldData doesn't have a clean 'name' property usually?
      // WorldGenerator sends: customId, width, height, type, walls, entities.
      // It does NOT send 'name' explicitly in IWorld interface.
      // Use customId.
      const TEMPLE_NAMES: Record<string, string> = {
        temple_sky: 'Sky Temple',
        temple_earth: 'Earth Temple',
        temple_space: 'Space Temple',
        temple_light: 'Light Temple',
        temple_fire: 'Fire Temple',
      };
      let name = "Unknown Location";
      if (worldData.customId === 'world_main') name = "Overworld";
      else if (worldData.customId === 'arena') name = '????';
      else if (worldData.customId.startsWith('town_')) {
        const townId = worldData.customId;
        const town = playerState.towns.find(t => t.id === townId);
        name = town ? town.name : `Town ${townId}`;
      } else if (TEMPLE_NAMES[worldData.customId]) {
        name = TEMPLE_NAMES[worldData.customId];
      } else {
        name = worldData.customId;
      }
      locDisplay.innerText = name;
    }

    // 6. Handle Escort Task
    if (playerState.activeTask && playerState.activeTask.type === 'ESCORT' && !playerState.activeTask.isCompleted) {
      const currentId = currentWorldData.customId; // Corrected from worldData
      console.log("Checking Escort Task in World:", currentId, "Target:", playerState.activeTask.targetId);

      if (currentId === playerState.activeTask.targetId) {
        // SUCCESS!
        playerState.activeTask.isCompleted = true;
        playerState.activeTask.currentAmount = 1;
        audio.playSound('/sounds/task_complete.wav');
        console.log("ESCORT COMPLETE!");
        // Clear Follower
        if (entityManager.follower) {
          scene.remove(entityManager.follower.sprite);
          entityManager.follower = null;
        }

        // Backend Update & Spawn
        const giverId = playerState.activeTask.giverId;
        const giver = playerState.visitedPeople.get(giverId);
        if (giver) {
          apiFetch(`${API_BASE}/api/escort/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ personId: giverId, targetTownId: currentId })
          }).then(res => res.json()).then(data => {
            if (data.success && data.updatedPerson) {
              playerState.visitedPeople.set(giverId, data.updatedPerson);

              // Move person in playerState.towns from origin to destination
              const destTownEntry = (playerState.towns as any[]).find(t => t.id === currentId);
              if (destTownEntry) {
                // Remove from whichever origin town holds them
                for (const t of playerState.towns as any[]) {
                  const idx = (t.people ?? []).findIndex((p: any) => p.id === giverId);
                  if (idx !== -1 && t.id !== currentId) {
                    t.people.splice(idx, 1);
                    break;
                  }
                }
                // Add to destination if not already there
                destTownEntry.people = destTownEntry.people ?? [];
                if (!destTownEntry.people.some((p: any) => p.id === giverId)) {
                  destTownEntry.people.push(data.updatedPerson);
                }
              }

              // Find a clear tile in the upper half of the town (away from exit at y=39).
              const walls = currentWorldData?.walls;
              let spawnX = 20, spawnY = 10;
              if (walls) {
                outer: for (let r = 3; r < 20; r++) {
                  for (let dx = 0; dx <= r; dx++) {
                    for (const cx of [20 + dx, 20 - dx]) {
                      const cy = 10 + (r - dx);
                      if (cx > 0 && cx < walls.length && cy > 0 && cy < walls[0].length && !walls[cx][cy]) {
                        spawnX = cx; spawnY = cy;
                        break outer;
                      }
                    }
                  }
                }
              }
              entityManager.spawnEntity({
                type: 'person',
                name: data.updatedPerson.name,
                x: spawnX,
                y: spawnY,
                properties: { ...data.updatedPerson, personId: data.updatedPerson.id, hasMet: true }
              });
            }
          }).catch(e => console.error("Escort sync failed:", e));
        }
      } else {
        // SPAWN FOLLOWER (If not in target town)
        // Check if we already have follower? 
        // spawnFollower clears existing, so it's safe to call.
        const giverId = playerState.activeTask.giverId;
        const giver = playerState.visitedPeople.get(giverId);
        console.log("Attempting to spawn follower:", giverId, "Found:", !!giver);

        if (giver) {
          // Spawn slightly behind player
          const spawnPos = renderer.camera.position.clone();
          // We don't have direction easily here, just offset Z
          spawnPos.z += 2;

          entityManager.spawnFollower({
            ...giver,
            x: spawnPos.x,
            y: spawnPos.z
          });
        } else {
          console.warn("Could not find Giver in visitedPeople:", giverId);
        }
      }
    }
  };

  // 5. Generate Initial World
  try {
    const response = await apiFetch(`${API_BASE}/api/generate`);
    const worldData = await response.json();

    // Extract global items from initial world load (hack: server sends them in worldData or we need separate fetch?)
    // WorldGenerator returns simple world, does NOT return items.
    // We need to fetch items separately or server needs to embed them?
    // Let's fetch them from a new endpoint or just assume we can get them.
    // Actually, DemonLogic returns items. WorldGenerator puts them in GameState.
    // We should add an endpoint to get GameState or Items.
    // For now, let's assume worldData MIGHT contain them if we modify server.
    // converting...
    overworldData = worldData; // Save for cheat teleport
    await loadWorld(worldData);

    // Fetch Initial State (Items + Towns) BEFORE auto-entering the starting town
    // so playerState.towns is populated when loadWorld looks up the town name.
    const stateRes = await apiFetch(`${API_BASE}/api/state`);
    const state = await stateRes.json();
    if (state.items) {
      playerState.items = state.items;
      console.log("Loaded Items:", playerState.items.length);
    }
    if (state.towns) {
      playerState.towns = state.towns;
      console.log("Loaded Towns:", playerState.towns.length, playerState.towns);

      // Load only the character sprites actually used by NPCs in this game session
      const allPeople = playerState.towns.flatMap((t: any) => t.people ?? []);
      const charManifest: { textures: Record<string, string> } = { textures: {} };
      const seenSprites = new Set<string>();
      for (const person of allPeople) {
        const spriteId: string = (person as any).sprite ?? '';
        const match = spriteId.match(/^character_(\d+)_(\d+)$/);
        if (!match || seenSprites.has(spriteId)) continue;
        seenSprites.add(spriteId);
        const row = parseInt(match[1]);
        const skin = parseInt(match[2]);
        // Load all 4 walk frames (rows baseRow+0 through baseRow+3) × 3 directions
        for (let f = 0; f < 4; f++) {
          for (let offset = 0; offset < 3; offset++) {
            const col = skin * 3 + offset;
            const key = `character_${row + f}_${col}`;
            charManifest.textures[key] = `sprites/sliced/${key}.png`;
          }
        }
      }
      await assetManager.loadAssets(charManifest);
    }

    // Auto-enter starting town (now that playerState.towns is populated for name lookup)
    if (worldData.startingDoorId) {
      try {
        const townRes = await apiFetch(`${API_BASE}/api/enter/${worldData.startingDoorId}`, { method: 'POST' });
        const townData = await townRes.json();
        await loadWorld(townData);
      } catch (e) {
        console.warn("Failed to auto-enter starting town:", e);
      }
    }
  } catch (e) {
    console.error("Failed to fetch world:", e);
  }

  // 6. Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambientLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
  dirLight.position.set(100, 100, 50);
  scene.add(dirLight);

  // --- START SCREEN ---
  const startScreen = new StartScreenUI();
  startScreen.show();

  startScreen.onFirstInteract = () => {
    audio.resume();
    audio.playMusic('/music/start.mp3');
  };

  startScreen.onSensitivityChange = (v) => {
    controls.setSensitivity(v);
    trackEvent('settings_changed', { setting: 'sensitivity', value: v });
  };

  startScreen.onVolumeChange = (v) => {
    audio.setMasterVolume(v);
    trackEvent('settings_changed', { setting: 'volume', value: v });
  };

  startScreen.onStart = () => {
    gameStarted = true;
    startScreen.hide();
    audio.resume();
    audio.playMusic(pendingMusicTrack);
    trackEvent('game_started', {
      sensitivity: parseFloat(localStorage.getItem('sensitivity') ?? '1.0'),
      volume: parseFloat(localStorage.getItem('volume') ?? '1.0'),
    });
    // Sync pause screen slider displays in case settings changed on start screen
    sensitivitySlider.value = localStorage.getItem('sensitivity') ?? '1.0';
    sensitivityValue.textContent = parseFloat(sensitivitySlider.value).toFixed(1);
    musicVolumeSlider.value = localStorage.getItem('music-volume') ?? '1.0';
    musicVolumeValue.textContent = parseFloat(musicVolumeSlider.value).toFixed(1);
    sfxVolumeSlider.value = localStorage.getItem('sfx-volume') ?? '1.0';
    sfxVolumeValue.textContent = parseFloat(sfxVolumeSlider.value).toFixed(1);
    controls.lock();
    if (isMobile && mobileControls) {
      controls.lock(); // sets mobileActive = true
    }
  };

  // 7. Loop
  const clock = new THREE.Clock();

  // --- PLAYER STATE MOVED TO GLOBAL SCOPE ---


  // --- ATTACK LOGIC ---
  const attackState = {
    isAttacking: false,
    timer: 0 // Used purely for cooldown now
  };

  // Direction Arrow
  const arrowGeo = new THREE.ConeGeometry(0.5, 1.5, 8);
  const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffff00 }); // Yellow arrow
  const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
  arrowMesh.visible = false;
  arrowMesh.rotation.x = Math.PI / 2; // Point forward? No, Cone points up Y by default. 
  // We want it to point at target. lookAt points Z axis. 
  // If we rotate cone to point along Z...
  arrowMesh.geometry.rotateX(Math.PI / 2); // Point along +Z so lookAt points it downwards.
  scene.add(arrowMesh);

  document.addEventListener('contextmenu', (e) => e.preventDefault());

  document.addEventListener('mousedown', (e: MouseEvent) => {
    audio.resume(); // Unblock AudioContext after first user gesture
    if (!gameStarted) return;
    // Check UI state
    if (pauseOpen || dialogueUI.isOpen || clueTracker.isOpen || levelUpUI.isOpen || powerPopupOpen || playerState.isDead || innUI.isOpen || banditTradeUI.isOpen) return;

    // RMB — Protection Aura (Earth Temple)
    if (e.button === 2 && playerState.templesCompleted.includes('earth') && controls.isActive && !playerState.isDead) {
      auraActive = true;
      auraOverlay.style.display = 'block';
      return;
    }

    // LMB — Attack (blocked while aura is active)
    if (auraActive) return;

    // Check if we have ANY pointer lock (don't care if body or canvas)
    if (controls.isActive && !attackState.isAttacking && !playerState.isDead) {
      // SLASH (Cooldown tracking)
      attackState.isAttacking = true;
      attackState.timer = 0.3; // 300ms cooldown
      audio.playSound('/sounds/player_slash.wav');

      // Calculate direction from player camera
      const pPos = renderer.camera.position.clone();
      const dir = new THREE.Vector3();
      renderer.camera.getWorldDirection(dir);
      dir.normalize();

      // Ensure we spawn it slightly in front so it doesn't immediately "hit" the player unintentionally
      // (Even though player projectiles ignore player box)
      const spawnX = pPos.x + (dir.x * 1.5);
      const spawnZ = pPos.z + (dir.z * 1.5);

      // Spawn at camera height minus 1 (weapon height offset); ground case matches original y=1.0
      entityManager.spawnProjectile(spawnX, spawnZ, dir, 'slash', true, playerState.range, pPos.y - 1.0);
      trackEvent('player_attacked');

      // Inject damage into the newly spawned projectile (last one in array)
      const newProj = entityManager.projectiles[entityManager.projectiles.length - 1];
      if (newProj && newProj.isPlayer) {
        (newProj as any).damage = playerState.strength;
      }
    } else {
      if (!controls.isActive) {
        controls.lock();
      }
    }
  });

  document.addEventListener('mouseup', (e: MouseEvent) => {
    if (e.button === 2) {
      auraActive = false;
      auraOverlay.style.display = 'none';
    }
  });

  // UI Update Function
  const heartFull = "❤️";
  const heartEmpty = "🖤";

  const updateHealthUI = () => {
    const display = document.getElementById('health-display');
    if (display) {
      let hearts = "";
      for (let i = 0; i < playerState.maxHp; i++) {
        hearts += (i < playerState.hp) ? heartFull : heartEmpty;
      }
      display.innerText = hearts;
    }
  };

  const updateXPUI = () => {
    const display = document.getElementById('xp-display');
    if (!display) return;
    const prog = gameConfig.playerProgression;
    if (playerState.level >= prog.maxLevel) {
      display.innerText = `XP: MAX`;
      display.style.color = '#ffd700'; // gold
      return;
    }
    const xpNeeded = prog.xpCurve[playerState.level - 1];
    if (playerState.xp >= xpNeeded) {
      display.innerText = isMobile ? 'TAP TO LEVEL UP!' : `Press F to Level Up!`;
      display.style.color = '#00ff00';
      display.style.animation = 'pulse 1s infinite alternate';
    } else {
      display.innerText = `XP: ${playerState.xp}/${xpNeeded}`;
      display.style.color = 'white';
      display.style.animation = 'none';
    }
  };

  // Initial UI Render
  updateHealthUI();
  updateXPUI();

  // --- DEATH SCREEN ---
  const deathScreen = document.getElementById('death-screen');

  const showDeathScreen = () => {
    if (!deathScreen) return;
    deathScreen.style.display = 'flex';
    // Hide buttons for 1 second to prevent accidental clicks
    const deathButtons = document.getElementById('death-buttons');
    if (deathButtons) {
      deathButtons.style.visibility = 'hidden';
      deathButtons.style.pointerEvents = 'none';
      setTimeout(() => {
        deathButtons.style.visibility = 'visible';
        deathButtons.style.pointerEvents = 'all';
      }, 1000);
    }
  };

  const hideDeathScreen = () => {
    if (deathScreen) deathScreen.style.display = 'none';
  };

  document.getElementById('btn-new-game')?.addEventListener('click', () => {
    trackEvent('game_new', { level: playerState.level });
    window.location.reload();
  });

  document.getElementById('btn-continue')?.addEventListener('click', async () => {
    trackEvent('game_continue', { level: playerState.level, last_town_id: lastTownId ?? '' });
    // Reset to base stats
    playerState.level = 1;
    playerState.xp = 0;
    playerState.strength = 1;
    playerState.agility = 1;
    playerState.range = 1;
    playerState.maxHp = 3;
    playerState.hp = 3;
    playerState.isDead = false;
    playerState.canLevelUp = false;

    if (lastTownId) {
      // Respawn in the last visited town — always has a safe spawn point, no enemies
      try {
        const res = await apiFetch(`${API_BASE}/api/enter/${lastTownId}`, { method: 'POST' });
        const townData = await res.json();
        await loadWorld(townData);
      } catch (e) {
        console.error('Failed to load last town on respawn:', e);
      }
    } else {
      // Never visited a town — reload the overworld and place the player at a safe spawn point.
      if (overworldData) {
        try {
          await loadWorld(overworldData);
          // loadWorld positions camera at spawnPoints[0]; try to find a safer open tile
          const world = overworldData;
          let spawnX = world?.spawnPoints?.[0]?.x ?? 1;
          let spawnZ = world?.spawnPoints?.[0]?.y ?? 1;
          if (world?.walls) {
            for (let attempt = 0; attempt < 500; attempt++) {
              const sx = Math.floor(Math.random() * (world.width - 2)) + 1;
              const sy = Math.floor(Math.random() * (world.height - 2)) + 1;
              if (world.walls[sx][sy] || world.walls[sx + 1]?.[sy] || world.walls[sx - 1]?.[sy] ||
                world.walls[sx]?.[sy + 1] || world.walls[sx]?.[sy - 1]) continue;
              const tooClose = entityManager.activeEntities.some(e => {
                const ex = Math.floor(e.sprite.position.x / 2);
                const ez = Math.floor(e.sprite.position.z / 2);
                return Math.sqrt((ex - sx) ** 2 + (ez - sy) ** 2) < 15;
              });
              if (!tooClose) { spawnX = sx; spawnZ = sy; break; }
            }
          }
          renderer.camera.position.set((spawnX * 2) + 1, 2, (spawnZ * 2) + 1);
        } catch (e) {
          console.error('Failed to reload overworld on respawn:', e);
        }
      }
    }

    hideDeathScreen();
    minimap.toggle(true);
    updateHealthUI();
    updateXPUI();
    audio.resumeMusic();
    controls.lock();
  });

  // Listen for Damage
  window.addEventListener('playerDamaged', (e: any) => {
    if (playerState.isDead || Date.now() < playerState.invulnTimer) return;

    const dmg = e.detail.damage;
    const srcPos = e.detail.srcPos;
    const sourceType: string | undefined = e.detail.sourceType;

    if (auraActive) {
      // Protection Aura: block damage but still apply knockback
      audio.playSound('/sounds/player_block.wav');
      const pushDir = new THREE.Vector3().subVectors(renderer.camera.position, srcPos).normalize();
      pushDir.y = 0;
      controls.knockback(pushDir.x * 2.0, pushDir.z * 2.0);
      return;
    }

    audio.playSound('/sounds/player_hit.wav');

    playerState.hp -= dmg;
    console.log(`Player Hit! HP: ${playerState.hp}`);
    trackEvent('player_damaged', { hp_remaining: playerState.hp, damage_amount: dmg });

    updateHealthUI(); // Update UI

    // Knockback
    const pushDir = new THREE.Vector3().subVectors(renderer.camera.position, srcPos).normalize();
    pushDir.y = 0;
    const force = pushDir.multiplyScalar(2.0);
    controls.knockback(force.x, force.z);

    // Flash / Visual Feedback (Screen Shake?)
    document.body.style.backgroundColor = 'red';
    setTimeout(() => document.body.style.backgroundColor = '', 100);

    playerState.invulnTimer = Date.now() + 500; // 0.5s invuln

    if (playerState.hp <= 0) {
      if (inDemonArena) {
        inDemonArena = false;
        // Defer loadWorld so it doesn't mutate projectiles[] mid-loop
        if (overworldData) setTimeout(() => loadWorld(overworldData), 0);
      }
      playerState.isDead = true;
      audio.pauseMusic();
      console.log("GAME OVER");
      trackEvent('player_died', {
        level: playerState.level,
        xp: playerState.xp,
        location_id: (currentWorldData?.customId ?? currentWorldData?.id ?? 'unknown').toString(),
      });
      const killerEl = document.getElementById('death-killer');
      if (killerEl) {
        const killerName = sourceType
          ? (gameConfig.enemies?.find((e: any) => e.id === sourceType)?.name ?? sourceType)
          : null;
        killerEl.textContent = killerName ? `Killed by a ${killerName}` : '';
      }
      controls.unlock();
      if (isMobile) minimap.toggle(false);
      showDeathScreen();
    }
  });

  let isBlacksmithUpgrade = false;

  const levelUpUI = new LevelUpUI();
  levelUpUI.onUpgradeStat = (stat) => {
    const wasBlacksmith = isBlacksmithUpgrade;
    isBlacksmithUpgrade = false;

    if (!wasBlacksmith) {
      playerState.level++; // Consume the level up
    }

    if (stat === 'health') {
      playerState.maxHp++;
      playerState.hp = playerState.maxHp; // Heal to full
      updateHealthUI();
    } else {
      playerState[stat]++;
    }
    console.log(`Upgraded ${stat} to ${stat === 'health' ? playerState.maxHp : playerState[stat]}`)
    trackEvent('stat_upgraded', {
      stat,
      new_value: stat === 'health' ? playerState.maxHp : playerState[stat],
      player_level: playerState.level,
      is_blacksmith: wasBlacksmith,
    });

    if (!wasBlacksmith) {
      // Check if another level is pending
      const prog = gameConfig.playerProgression;
      if (playerState.level < prog.maxLevel) {
        const nextXpNeeded = prog.xpCurve[playerState.level - 1];
        playerState.canLevelUp = playerState.xp >= nextXpNeeded;
        if (playerState.canLevelUp) audio.playSound('/sounds/level_up.wav');
      } else {
        playerState.canLevelUp = false;
      }
    }
    updateXPUI();
  };
  levelUpUI.onClose = () => { controls.lock(); };

  window.addEventListener('entityKilled', (e: any) => {
    const entityData = e.detail;

    // Demon boss killed → freeze game, clear enemies, release pointer, show win screen
    if (entityData.type === 'demon') {
      inDemonArena = false;
      playerState.isDead = true;  // stops movement and blocks further damage
      controls.unlock();           // releases pointer lock so the modal is clickable
      entityManager.clearEnemies(); // instantly remove remaining arena minions
      trackEvent('game_won', { level: playerState.level, xp: playerState.xp });
      clueTracker.showResultModal(true);
      return;
    }

    // Harvestable entities — resource handled by onEntityKilled; skip XP/task/kill-all
    if (entityData.type === 'plant' || entityData.type === 'tree') return;

    // 1. Task Check
    if (playerState.activeTask && !playerState.activeTask.isCompleted) {
      if (playerState.activeTask.type === 'KILL' && entityData.type === playerState.activeTask.targetId) {
        playerState.activeTask.currentAmount++;
        if (playerState.activeTask.currentAmount >= playerState.activeTask.amount) {
          playerState.activeTask.isCompleted = true;
          audio.playSound('/sounds/task_complete.wav');
        }
        updateTaskHud();
      }
    }

    // 2. XP Gain
    const enemyTemplate = gameConfig.enemies?.find((e: any) => e.id === entityData.type);
    const xpGain = enemyTemplate?.xp || 1;
    playerState.xp += xpGain;
    console.log(`Gained ${xpGain} XP! Total: ${playerState.xp}`);
    trackEvent('enemy_killed', { enemy_type: entityData.type, player_level: playerState.level });

    // 3. Level Up Check
    const prog = gameConfig.playerProgression;
    if (playerState.level < prog.maxLevel) {
      const xpNeeded = prog.xpCurve[playerState.level - 1];
      if (playerState.xp >= xpNeeded && !playerState.canLevelUp) {
        playerState.canLevelUp = true;
        audio.playSound('/sounds/level_up.wav');
      }
    }
    updateXPUI();

    // 4. Kill-all bonus (overworld / towns only)
    if (!worldCleared && !inDemonArena && currentWorldData?.type !== 'temple') {
      const remainingEnemies = entityManager.activeEntities.filter(
        e => e.data.type !== 'person' && e.data.type !== 'chest' && e.data.type !== 'chest_temple'
          && e.data.type !== 'plant' && e.data.type !== 'tree'
      );
      if (remainingEnemies.length === 0) {
        worldCleared = true;
        playerState.xp += 100;
        audio.playSound('/sounds/high_xp.wav');
        if (playerState.level < prog.maxLevel) {
          const xpNeeded = prog.xpCurve[playerState.level - 1];
          if (playerState.xp >= xpNeeded && !playerState.canLevelUp) {
            playerState.canLevelUp = true;
            audio.playSound('/sounds/level_up.wav');
          }
        }
        updateXPUI();
      }
    }

    // 5. Temple cleared — reveal chest when all temple enemies are dead
    if (!worldCleared && currentWorldData?.type === 'temple') {
      const remainingTempleEnemies = entityManager.activeEntities.filter(
        e => TEMPLE_ENEMY_TYPES.includes(e.data.type)
      );
      if (remainingTempleEnemies.length === 0) {
        worldCleared = true;
        chestMarker = entityManager.revealTempleChest();
        audio.playSound('/sounds/temple_cleared.wav');
      }
    }
  });

  // Interaction Listener
  // --- DIALOGUE UI ---
  const dialogueUI = new DialogueUI();

  // Task Acceptance Logic
  dialogueUI.onAcceptTask = (task: GameTask) => {
    console.log("Accepted Task:", task);
    playerState.activeTask = task;
    trackEvent('task_accepted', { task_type: task.type, task_id: task.id });
    // If the player already has this magic item, immediately complete the task
    if (task.type === 'FIND_ITEM' && playerState.templesCompleted.includes(task.targetId)) {
      task.currentAmount = 1;
      task.isCompleted = true;
      audio.playSound('/sounds/task_complete.wav');
      updateTaskHud();
    }
  };

  // Helper: add a clue to knownClues if not already present
  const addClue = (clue: Clue) => {
    if (!playerState.knownClues.some(c => c.text === clue.text)) {
      playerState.knownClues.push(clue);
    }
  };

  // Helper: introduce a person (mark met, add to visitedPeople, add their bad clue)
  const introducePerson = (p: Person) => {
    p.hasMet = true;
    playerState.visitedPeople.set(p.id, p);
    if (p.clues?.bad) addClue(p.clues.bad);
  };

  // Occupation power logic — returns dialog text to show
  const triggerOccupationPower = (person: Person): string => {
    trackEvent('power_activated', { occupation: person.attributes.occupation ?? 'minion', person_id: person.id });
    const allPeople = playerState.towns.flatMap((t: any) => t.people as Person[]);
    const currentTownId = person.attributes.townId;
    const currentTownName = playerState.towns.find((t: any) => t.id === currentTownId)?.name || currentTownId;

    if (person.isMinion) {
      return Dialogue.powers.minionReveal;
    }

    switch (person.attributes.occupation) {
      case 'Farmer': {
        const demon = allPeople.find((p: Person) => p.isDemon);
        const hasMet = demon ? playerState.visitedPeople.has(demon.id) : false;
        return hasMet ? Dialogue.powers.farmerMet : Dialogue.powers.farmerNotMet;
      }
      case 'Musician': {
        const townPeople = allPeople.filter((p: Person) => p.attributes.townId === currentTownId);
        const minionCount = townPeople.filter((p: Person) => p.isMinion).length;
        return Dialogue.powers.musicianMinions(minionCount);
      }
      case 'Barber': {
        // Barber now does what Merchant used to: introduce some people from anywhere
        const unmet = allPeople.filter((p: Person) => !p.hasMet && p.id !== person.id);
        const count = Math.min(Math.floor(Math.random() * 5) + 1, unmet.length);
        const shuffled = unmet.sort(() => Math.random() - 0.5).slice(0, count);
        shuffled.forEach(introducePerson);
        return Dialogue.powers.introduceMultiple(count);
      }
      case 'Tailor': {
        const townPeople = allPeople.filter((p: Person) => p.attributes.townId === currentTownId);
        const hasLiar = townPeople.some((p: Person) => p.isMinion || p.isDemon);
        const clueText = hasLiar
          ? Dialogue.powers.tailorLiars(currentTownName)
          : Dialogue.powers.tailorNoLiars(currentTownName);
        addClue({ text: clueText, isGood: false, isSpecial: true });
        return clueText;
      }
      case 'Mayor': {
        playerState.resources.gold++;
        showResourcePickup('gold', playerState.resources.gold);
        return Dialogue.powers.mayorGold;
      }
      case 'Merchant': {
        // Merchant now gives 50 shuckles
        playerState.shuckles += 50;
        showResourcePickup('shuckles', playerState.shuckles);
        return Dialogue.powers.merchantShuckles;
      }
      case 'Soldier': {
        playerState.xp += 20;
        const prog = gameConfig.playerProgression;
        if (playerState.level < prog.maxLevel) {
          const xpNeeded = prog.xpCurve[playerState.level - 1];
          if (playerState.xp >= xpNeeded && !playerState.canLevelUp) {
            playerState.canLevelUp = true;
            audio.playSound('/sounds/level_up.wav');
          }
        }
        updateXPUI();
        return Dialogue.powers.soldierXP;
      }
      case 'Blacksmith': {
        isBlacksmithUpgrade = true;
        levelUpUI.show(playerState.level, playerState, gameConfig.playerProgression.stats);
        return Dialogue.powers.blacksmithUpgrade;
      }
      case 'Carpenter': {
        const demon = allPeople.find((p: Person) => p.isDemon);
        const demonTownId = demon?.attributes.townId;
        const candidateTowns = playerState.towns.filter((t: any) =>
          t.id !== demonTownId &&
          !playerState.knownClues.some((c: Clue) => c.text === Dialogue.powers.carpenterClue(t.name))
        );
        if (candidateTowns.length === 0) return Dialogue.powers.carpenterNone;
        const pick = candidateTowns[Math.floor(Math.random() * candidateTowns.length)];
        const clueText = Dialogue.powers.carpenterClue(pick.name);
        addClue({ text: clueText, isGood: false });
        return clueText;
      }
      case 'Locksmith': {
        playerState.hasLocksmithPower = true;
        return Dialogue.powers.locksimthUnlock;
      }
      default:
        return Dialogue.powers.fallback;
    }
  };

  dialogueUI.onTaskCompleted = () => audio.playSound('/sounds/task_complete.wav');

  // Task Completion Logic
  dialogueUI.onCompleteTask = (person: Person, rewardChoice: 'CLUE' | 'POWER'): string | void => {
    console.log("Completed Task for:", person.name);
    trackEvent('task_completed', { task_type: person.task?.type ?? 'unknown', reward_choice: rewardChoice });
    playerState.activeTask = null; // Clear active task
    person.taskCompleted = true; // Permanently mark as completed
    person.task.isCompleted = true; // Also mark the task itself as completed
    if (person.isMinion) audio.playSound('/sounds/minion-cackle.ogg');

    if (rewardChoice === 'CLUE') {
      // Grant Clue (Good AND Bad)
      if (person.clues) {
        if (person.clues.good) addClue(person.clues.good);
        if (person.clues.bad) addClue(person.clues.bad);
      }
    } else if (rewardChoice === 'POWER') {
      return triggerOccupationPower(person);
    }
  };

  // Close Handler
  dialogueUI.onClose = () => {
    if (isMobile) minimap.toggle(true);
    controls.lock();
  };

  // --- TASK HUD UPDATE ---
  const updateTaskHud = () => {
    const taskHud = document.getElementById('task-hud');
    if (!taskHud) return;

    if (playerState.activeTask) {
      if (playerState.activeTask.isCompleted) {
        // Find Giver Info
        const giverId = playerState.activeTask.giverId;
        const giver = playerState.visitedPeople.get(giverId);

        let targetText = giverId;
        if (giver) {
          // Check if we are in the same town
          const currentWorldId = currentWorldData ? (currentWorldData.customId || currentWorldData.id) : "";

          if (currentWorldId === giver.attributes.townId) {
            // In same town -> "Find [Person Name]"
            targetText = `Find ${giver.name}`;
          } else {
            // Different town -> "Return to [Town Name]"
            const town = playerState.towns.find(t => t.id === giver.attributes.townId);
            const townName = town ? town.name : giver.attributes.townId;
            targetText = `Return to ${townName}`;
          }
        }

        taskHud.innerText = `TASK COMPLETED!\n${targetText}`;
        taskHud.style.color = '#00ff00';
      } else {
        taskHud.innerText = `CURRENT TASK:\n${playerState.activeTask.description}\n(${playerState.activeTask.currentAmount}/${playerState.activeTask.amount})`;
        taskHud.style.color = 'white';
      }
    } else {
      taskHud.innerText = "NO ACTIVE TASK";
      taskHud.style.color = '#888';
    }
  };

  // --- MINIMAP ---
  const minimap = new MinimapUI();
  if (isMobile) minimap.repositionForMobile();

  // --- CLUE TRACKER ---
  const clueTracker = new ClueTrackerUI(assetManager);

  // --- INN UI ---
  const innUI = new InnUI();
  innUI.onSleep = () => {
    if (playerState.shuckles < 5) { showNotif(Dialogue.inn.notEnoughShuckles); return; }
    playerState.shuckles -= 5;
    playerState.hp = playerState.maxHp;
    updateHealthUI();
    audio.playSound('/sounds/player_rest.wav');
    showNotif(Dialogue.inn.sleptWell);
  };
  innUI.onTrain = () => {
    if (playerState.shuckles < 50) { showNotif(Dialogue.inn.notEnoughShuckles); return; }
    playerState.shuckles -= 50;
    audio.playSound('/sounds/player_train.wav');
    playerState.xp += 20;
    const prog = gameConfig.playerProgression;
    if (playerState.level < prog.maxLevel) {
      const xpNeeded = prog.xpCurve[playerState.level - 1];
      if (playerState.xp >= xpNeeded && !playerState.canLevelUp) {
        playerState.canLevelUp = true;
      }
    }
    updateXPUI();
    showNotif(Dialogue.inn.trained);
  };
  innUI.onBuy = (resource) => {
    const mult = (currentWorldData as any)?.priceMultipliers?.[resource] ?? 1;
    const sellPrice = (RESOURCE_BASE_VALUE[resource] ?? 1) * mult;
    const buyPrice = Math.ceil(sellPrice * 1.5);
    const townId = (currentWorldData as any)?.customId ?? '';
    if (playerState.shuckles < buyPrice) return;
    playerState.shuckles -= buyPrice;
    (playerState.resources as Record<string, number>)[resource] = ((playerState.resources as Record<string, number>)[resource] ?? 0) + 1;
    if (playerState.innStocks[townId]) playerState.innStocks[townId][resource] = Math.max(0, (playerState.innStocks[townId][resource] ?? 0) - 1);
    showResourcePickup(resource, (playerState.resources as Record<string, number>)[resource]);
  };
  innUI.onSell = (resource) => {
    const mult = (currentWorldData as any)?.priceMultipliers?.[resource] ?? 1;
    const sellPrice = (RESOURCE_BASE_VALUE[resource] ?? 1) * mult;
    const townId = (currentWorldData as any)?.customId ?? '';
    if (((playerState.resources as Record<string, number>)[resource] ?? 0) <= 0) return;
    (playerState.resources as Record<string, number>)[resource]--;
    playerState.shuckles += sellPrice;
    if (playerState.innStocks[townId]) playerState.innStocks[townId][resource] = (playerState.innStocks[townId][resource] ?? 0) + 1;
    showResourcePickup('shuckles', playerState.shuckles);
  };
  innUI.onEscort = async (townId) => {
    if (playerState.shuckles < 50) { showNotif(Dialogue.inn.notEnoughShuckles); return; }
    playerState.shuckles -= 50;
    try {
      const res = await apiFetch(`${API_BASE}/api/enter/${townId}`, { method: 'POST' });
      const newWorld = await res.json();
      await loadWorld(newWorld);
    } catch (err) {
      console.error('Escort failed:', err);
    }
  };
  innUI.onClose = () => { controls.autoLock = true; controls.lock(); };

  // --- BANDIT TRADE UI ---
  const banditTradeUI = new BanditTradeUI();
  banditTradeUI.onBuy = (item) => {
    if (item === 'bomb') {
      if (playerState.shuckles < 10) return false;
      playerState.shuckles -= 10;
      playerState.bombs++;
      showResourcePickup('bombs', playerState.bombs);
      return true;
    } else {
      if (playerState.shuckles < 200) return false;
      playerState.shuckles -= 200;
      playerState.lockpicks++;
      showResourcePickup('lockpicks', playerState.lockpicks);
      return true;
    }
  };
  let banditEntityName: string | null = null;
  banditTradeUI.onClose = (purchased) => {
    controls.autoLock = true;
    controls.lock();
    if (purchased && banditEntityName) {
      entityManager.removeEntityByName(banditEntityName);
      banditEntityName = null;
    }
  };

  // --- DEMON ARENA ---
  const generateDemonArena = () => {
    // Build the walls array — pillars scattered randomly, avoiding a 6-tile radius around centre
    const W = arenaSize.w, H = arenaSize.h;
    const centreX = Math.floor(W / 2), centreZ = Math.floor(H / 2);
    const walls: boolean[][] = Array.from({ length: W }, () => new Array(H).fill(false));

    // Solid border so the demon can't drift off the edge
    for (let x = 0; x < W; x++) { walls[x][0] = true; walls[x][H - 1] = true; }
    for (let z = 0; z < H; z++) { walls[0][z] = true; walls[W - 1][z] = true; }

    const clearanceR = 6;
    const PILLAR_COUNT = 20;
    let placed = 0;
    let attempts = 0;
    while (placed < PILLAR_COUNT && attempts < 500) {
      attempts++;
      const px = 1 + Math.floor(Math.random() * (W - 2));
      const pz = 1 + Math.floor(Math.random() * (H - 2));
      const dx = Math.abs(px - centreX), dz = Math.abs(pz - centreZ);
      // Keep centre clear and keep player spawn (x=2, z=centreZ) clear
      if (dx <= clearanceR && dz <= clearanceR) continue;
      if (Math.abs(px - 2) <= 3 && Math.abs(pz - centreZ) <= 3) continue;
      walls[px][pz] = true;
      placed++;
    }

    const arenaData: any = {
      type: 'arena',
      width: W,
      height: H,
      walls,
      entities: [],
      doors: [],
      customId: 'arena',
      spawnPoints: [{ x: 2, y: centreZ }]
    };

    // Darken the scene
    renderer.scene.background = new THREE.Color(0x000000);
    const arenaAmbient = new THREE.AmbientLight(0x440000, 1.2);
    arenaAmbient.name = 'arenaAmbient';
    renderer.scene.add(arenaAmbient);

    loadWorld(arenaData).then(() => {
      // Spawn demon at centre
      entityManager.arenaCenter = { x: centreX * 2 + 1, z: centreZ * 2 + 1 };
      entityManager.addEntity({
        type: 'demon',
        name: 'The Demon',
        x: centreX,
        y: centreZ,
        properties: {
          hp: Math.max(1, 20 - playerState.demonBindings.length * 3) * playerState.strength,
          maxHp: Math.max(1, 20 - playerState.demonBindings.length * 3) * playerState.strength,
          phase2Done: false,
          attackTimer: 0,
          backTimer: 0,
          flyY: 0,
          flyTarget: 0,
          isCharging: false,
          chargeDir: { x: 0, z: 0 },
          isDying: false,
          deathFrame: 0,
          deathTimer: 0
        }
      });

      // Place player near edge
      renderer.camera.position.set(5, 2, centreZ * 2 + 1);

      // Boss music
      audio.playMusic('/music/boss.mp3');

      // Lock pointer so game starts immediately
      controls.lock();
    });
  };

  clueTracker.onDemonAccused = () => {
    inDemonArena = true;
    minimap.toggle(true); // clueTracker.hide() didn't restore the minimap
    generateDemonArena();
  };

  clueTracker.onAccuseResult = (won, personId) => {
    trackEvent('accusation_result', { won, accused_person_id: personId });
  };

  // --- CHEAT CONSOLE ---
  const cheatOverlay = document.getElementById('cheat-overlay')!;
  const cheatInput = document.getElementById('cheat-input') as HTMLInputElement;
  const cheatOutput = document.getElementById('cheat-output')!;
  let cheatOpen = false;

  const openCheat = () => {
    cheatOpen = true;
    controls.unlock();
    cheatOverlay.classList.add('open');
    cheatInput.value = '';
    cheatOutput.innerText = '';
    cheatInput.focus();
  };

  const closeCheat = () => {
    cheatOpen = false;
    cheatOverlay.classList.remove('open');
    controls.lock();
  };

  const runCheat = async (raw: string) => {
    const parts = raw.trim().toLowerCase().split(/\s+/);
    const cmd = parts[0];

    const allPeople = playerState.towns.flatMap((t: any) => t.people as Person[]);

    if (cmd === 'liliana') {
      const demon = allPeople.find((p: Person) => p.isDemon);
      if (!demon) { cheatOutput.innerText = 'No demon found in loaded data.'; return; }
      const townId = demon.attributes.townId;
      const door = overworldData?.doors?.find((d: any) => d.target === townId || d.id === townId);
      if (!door) { cheatOutput.innerText = `Cannot find overworld door to ${townId}.`; return; }
      closeCheat();
      const res = await apiFetch(`${API_BASE}/api/enter/${door.id}`, { method: 'POST' });
      const newWorld = await res.json();
      await loadWorld(newWorld);
      playerState.hp = playerState.maxHp;
      updateHealthUI();
      // Position player next to the demon entity in the town
      const demonEntity = newWorld.entities?.find((e: any) => e.properties?.isDemon);
      if (demonEntity) {
        renderer.camera.position.set((demonEntity.x * 2) + 1, 2, (demonEntity.y * 2) + 3);
      }

    } else if (cmd === 'urza') {
      const maxStats = gameConfig.playerProgression?.stats || {};
      playerState.strength = maxStats.strength?.max ?? 5;
      playerState.agility = maxStats.agility?.max ?? 5;
      playerState.range = maxStats.range?.max ?? 5;
      playerState.maxHp = maxStats.health?.max ?? 10;
      playerState.hp = playerState.maxHp;
      playerState.level = gameConfig.playerProgression?.maxLevel ?? 10;
      playerState.xp = 9999;
      updateHealthUI();
      updateXPUI();
      cheatOutput.innerText = 'Stats maxed out.';
      closeCheat();

    } else if (cmd === 'jace') {
      let added = 0;
      allPeople.forEach((p: Person) => {
        if (p.clues?.good) {
          if (!playerState.knownClues.some(c => c.text === p.clues!.good!.text)) {
            playerState.knownClues.push(p.clues.good);
            added++;
          }
        }
      });
      cheatOutput.innerText = `Revealed ${added} good clue${added !== 1 ? 's' : ''}.`;
      closeCheat();

    } else if (cmd === 'passport') {
      const townId = parts[1];
      if (!townId) { cheatOutput.innerText = 'Usage: passport [town_id]'; return; }
      const door = overworldData?.doors?.find((d: any) => d.target === townId || d.id === townId);
      if (!door) { cheatOutput.innerText = `No door found for town "${townId}".`; return; }
      closeCheat();
      const res = await apiFetch(`${API_BASE}/api/enter/${door.id}`, { method: 'POST' });
      const newWorld = await res.json();
      await loadWorld(newWorld);
      playerState.hp = playerState.maxHp;
      updateHealthUI();

    } else if (cmd === 'krang') {
      playerState.xp += 100;
      updateXPUI();
      cheatOutput.innerText = '+100 XP';
      closeCheat();

    } else if (cmd === 'strange') {
      const allTemples = ['sky', 'earth', 'space', 'light', 'fire'];
      allTemples.forEach(t => {
        if (!playerState.templesCompleted.includes(t)) playerState.templesCompleted.push(t);
      });
      updatePauseItems();
      cheatOutput.innerText = 'All magic items granted.';
      closeCheat();

    } else {
      cheatOutput.innerText = `Unknown command: ${cmd}`;
    }
  };

  cheatInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      runCheat(cheatInput.value).catch(err => { cheatOutput.innerText = `Error: ${err.message}`; });
    } else if (e.key === 'Escape') {
      closeCheat();
    }
  });

  // Toggle Clue Tracker or Level Up UI
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && pauseOpen) {
      controls.lock();
      return;
    }

    if (e.key === '`' || e.key === '~') {
      e.preventDefault();
      if (cheatOpen) closeCheat(); else openCheat();
      return;
    }

    if (e.code === 'KeyF' && playerState.canLevelUp) {
      if (levelUpUI.isOpen) {
        levelUpUI.hide();
        controls.lock();
      } else {
        controls.unlock();
        levelUpUI.show(playerState.level + 1, playerState, gameConfig.playerProgression.stats);
      }
    }

    // --- TEMPLE POWER KEYS ---
    const locked = controls.isActive;
    const canUsePower = locked && !playerState.isDead && !dialogueUI.isOpen && !clueTracker.isOpen && !levelUpUI.isOpen && gameStarted;

    // Q — Winged Boots (Sky Temple): toggle fly
    if (e.code === 'KeyQ' && canUsePower && playerState.templesCompleted.includes('sky')) {
      if (playerFly.flyTarget > 0) {
        // Only land if not hovering over a rock wall
        const gx = Math.floor(renderer.camera.position.x / 2);
        const gz = Math.floor(renderer.camera.position.z / 2);
        const onRock = (currentWorldData as any)?.rockWalls?.[gx]?.[gz];
        if (!onRock) playerFly.flyTarget = 0;
      } else {
        playerFly.flyTarget = 6;
      }
    }

    // X — Teleportation Cape (Space Temple): open town list
    if (e.code === 'KeyX' && canUsePower && playerState.templesCompleted.includes('space')) {
      const towns = (playerState.towns as any[]).filter(t => playerState.visitedTownIds.includes(t.id));
      if (towns.length > 0) {
        controls.unlock();
        teleportList.innerHTML = '';
        towns.forEach((t: any) => {
          const btn = document.createElement('button');
          btn.innerText = t.name ?? t.id;
          Object.assign(btn.style, {
            padding: '8px 12px', background: '#222', color: '#ffd700',
            border: '1px solid #555', cursor: 'pointer', fontFamily: 'inherit',
            fontSize: '0.75em'
          });
          btn.onmouseover = () => (btn.style.background = '#444');
          btn.onmouseout = () => (btn.style.background = '#222');
          btn.onclick = async () => {
            teleportMenu.style.display = 'none';
            try {
              const res = await apiFetch(`${API_BASE}/api/enter/${t.id}`, { method: 'POST' });
              const townData = await res.json();
              await loadWorld(townData);
              playerState.hp = playerState.maxHp;
              updateHealthUI();
            } catch (err) { console.error('Teleport failed:', err); }
            controls.lock();
          };
          teleportList.appendChild(btn);
        });
        teleportMenu.style.display = 'flex';
      }
    }

    // Z — Place bomb (overworld only, 1 at a time)
    // Uses single-use bombs first; falls back to fire-temple free bomb ability
    if (e.code === 'KeyZ' && canUsePower && !activeBomb && currentWorldData?.type === 'world') {
      const canUseFire = playerState.templesCompleted.includes('fire');
      const hasSingleUseBomb = playerState.bombs > 0;
      if (canUseFire || hasSingleUseBomb) {
        if (!canUseFire && hasSingleUseBomb) {
          playerState.bombs--;
          showResourcePickup('bombs', playerState.bombs);
        }
        const bx = renderer.camera.position.x;
        const bz = renderer.camera.position.z;
        const bombSpriteMat = new THREE.SpriteMaterial({ map: assetManager.getTexture('magic_bomb_unlit') });
        const bombSprite = new THREE.Sprite(bombSpriteMat);
        bombSprite.scale.set(1, 1, 1);
        bombSprite.position.set(bx, 0.5, bz);
        scene.add(bombSprite);
        activeBomb = { sprite: bombSprite, timer: 3.0, wx: bx, wz: bz };
      }
    }

    if (e.code === 'KeyC') {
      // Use global state
      const knownPeople = Array.from(playerState.visitedPeople.values());

      if (clueTracker.isOpen) {
        clueTracker.hide();
        minimap.toggle(true); // Show minimap
        controls.lock();
      } else {
        controls.unlock();
        minimap.toggle(false); // Hide minimap
        const onSelectTask = (task: GameTask) => {
          playerState.activeTask = task;
          updateTaskHud();
          console.log("Task Switched to:", task.description);
          // Immediately complete if player already has the magic item
          if (task.type === 'FIND_ITEM' && playerState.templesCompleted.includes(task.targetId)) {
            task.currentAmount = 1;
            task.isCompleted = true;
            audio.playSound('/sounds/task_complete.wav');
            updateTaskHud();
          }
        };

        const currentWorldId = currentWorldData ? (currentWorldData.customId || currentWorldData.id || '').toString() : '';
        trackEvent('clue_tracker_opened', {
          clue_count: playerState.knownClues.length,
          people_count: knownPeople.length,
        });
        flushEvents();
        clueTracker.show(knownPeople, playerState.knownClues, playerState.items, playerState.towns, playerState.activeTask, onSelectTask, currentWorldId, playerState.demonBindings, playerState.suspectedPeople, playerState.towns.length * 2);
      }
    }
  });

  // --- MOBILE CONTROLS SETUP ---
  if (isMobile) {
    mobileControls = new MobileControls(controls);

    mobileControls.onInteract = () => { controls.checkInteraction(); };

    mobileControls.onAttack = () => {
      if (attackState.isAttacking || playerState.isDead) return;
      attackState.isAttacking = true;
      attackState.timer = 0.3;
      audio.playSound('/sounds/player_slash.wav');
      const pPos = renderer.camera.position.clone();
      const dir = new THREE.Vector3();
      renderer.camera.getWorldDirection(dir);
      dir.normalize();
      entityManager.spawnProjectile(
        pPos.x + dir.x * 1.5,
        pPos.z + dir.z * 1.5,
        dir, 'slash', true, playerState.range, pPos.y - 1.0
      );
      const newProj = entityManager.projectiles[entityManager.projectiles.length - 1];
      if (newProj && newProj.isPlayer) (newProj as any).damage = playerState.strength;
      trackEvent('player_attacked');
    };

    mobileControls.onClueTracker = () => {
      const knownPeople = Array.from(playerState.visitedPeople.values());
      if (clueTracker.isOpen) {
        clueTracker.hide();
        minimap.toggle(true);
        controls.lock();
      } else {
        controls.unlock();
        minimap.toggle(false);
        const onSelectTask = (task: GameTask) => {
          playerState.activeTask = task;
          updateTaskHud();
          if (task.type === 'FIND_ITEM' && playerState.templesCompleted.includes(task.targetId)) {
            task.currentAmount = 1;
            task.isCompleted = true;
            updateTaskHud();
          }
        };
        const currentWorldId = currentWorldData ? (currentWorldData.customId || currentWorldData.id || '').toString() : '';
        clueTracker.show(knownPeople, playerState.knownClues, playerState.items, playerState.towns, playerState.activeTask, onSelectTask, currentWorldId, playerState.demonBindings, playerState.suspectedPeople, playerState.towns.length * 2);
      }
    };

    mobileControls.onBomb = () => {
      if (!controls.isActive || playerState.isDead || activeBomb || currentWorldData?.type !== 'world') return;
      const canUseFire = playerState.templesCompleted.includes('fire');
      const hasSingleUseBomb = playerState.bombs > 0;
      if (canUseFire || hasSingleUseBomb) {
        if (!canUseFire && hasSingleUseBomb) {
          playerState.bombs--;
          showResourcePickup('bombs', playerState.bombs);
        }
        const bx = renderer.camera.position.x;
        const bz = renderer.camera.position.z;
        const bombSpriteMat = new THREE.SpriteMaterial({ map: assetManager.getTexture('magic_bomb_unlit') });
        const bombSprite = new THREE.Sprite(bombSpriteMat);
        bombSprite.scale.set(1, 1, 1);
        bombSprite.position.set(bx, 0.5, bz);
        scene.add(bombSprite);
        activeBomb = { sprite: bombSprite, timer: 3.0, wx: bx, wz: bz };
      }
    };

    mobileControls.onFly = () => {
      if (!controls.isActive || playerState.isDead || !playerState.templesCompleted.includes('sky')) return;
      if (playerFly.flyTarget > 0) {
        const gx = Math.floor(renderer.camera.position.x / 2);
        const gz = Math.floor(renderer.camera.position.z / 2);
        const onRock = (currentWorldData as any)?.rockWalls?.[gx]?.[gz];
        if (!onRock) playerFly.flyTarget = 0;
      } else {
        playerFly.flyTarget = 6;
      }
    };

    mobileControls.onPause = () => { controls.unlock(); };

    mobileControls.onTeleport = () => {
      if (!controls.isActive || playerState.isDead || !playerState.templesCompleted.includes('space')) return;
      const towns = (playerState.towns as any[]).filter(t => playerState.visitedTownIds.includes(t.id));
      if (towns.length > 0) {
        controls.unlock();
        teleportList.innerHTML = '';
        towns.forEach((t: any) => {
          const btn = document.createElement('button');
          btn.innerText = t.name ?? t.id;
          Object.assign(btn.style, {
            padding: '8px 12px', background: '#222', color: '#ffd700',
            border: '1px solid #555', cursor: 'pointer', fontFamily: 'inherit',
            fontSize: '0.75em'
          });
          btn.onmouseover = () => (btn.style.background = '#444');
          btn.onmouseout = () => (btn.style.background = '#222');
          btn.onclick = async () => {
            teleportMenu.style.display = 'none';
            try {
              const res = await apiFetch(`${API_BASE}/api/enter/${t.id}`, { method: 'POST' });
              const townData = await res.json();
              await loadWorld(townData);
              playerState.hp = playerState.maxHp;
              updateHealthUI();
            } catch (err) { console.error('Teleport failed:', err); }
            controls.lock();
          };
          teleportList.appendChild(btn);
        });
        teleportMenu.style.display = 'flex';
      }
    };

    mobileControls.onLevelUp = () => {
      if (!playerState.canLevelUp) return;
      if (levelUpUI.isOpen) {
        levelUpUI.hide();
        controls.lock();
      } else {
        controls.unlock();
        levelUpUI.show(playerState.level + 1, playerState, gameConfig.playerProgression.stats);
      }
    };

    // Make xp-display tappable for level up
    const xpDisplay = document.getElementById('xp-display');
    if (xpDisplay) {
      xpDisplay.addEventListener('touchstart', (e) => {
        if (playerState.canLevelUp) {
          e.preventDefault();
          mobileControls!.onLevelUp?.();
        }
      }, { passive: false });
    }
  }

  let musicPaused = false;

  const animate = () => {
    requestAnimationFrame(animate);

    const delta = clock.getDelta(); // Always consume time to prevent jump on unpause
    updateTaskHud(); // Keep HUD updated

    // Minimap Update
    if (currentWorldData) {
      // Player Pos in Grid Coords
      const pp = { x: renderer.camera.position.x / 2, y: renderer.camera.position.z / 2 };

      // Derive facing angle from the camera's actual world-space forward direction.
      // getWorldDirection() avoids Euler-decomposition issues from PointerLockControls'
      // quaternion-based rotation. Canvas "up" (-Y) maps to world -Z, so:
      //   canvasAngle = atan2(dir.x, -dir.z)
      const _camDir = new THREE.Vector3();
      renderer.camera.getWorldDirection(_camDir);
      const playerFacingAngle = Math.atan2(_camDir.x, -_camDir.z);

      minimap.update(
        pp,
        { width: currentWorldData.width, height: currentWorldData.height },
        currentWorldData.doors || [],
        entityManager.activeEntities,
        playerState.activeTask,
        playerState.visitedPeople,
        (currentWorldData.customId || currentWorldData.id || "unknown").toString(),
        clueTracker.currentTab,
        currentWorldData.walls || null,
        chestMarker,
        currentWorldData.type === 'temple',
        playerFacingAngle,
        playerState.suspectedPeople,
        currentWorldData.housePeople
      );
    }

    const pauseScreen = document.getElementById('pause-screen');
    const isLocked = controls.isActive;
    const isPauseScreen = gameStarted && !isLocked && !playerState.isDead && !dialogueUI.isOpen && !clueTracker.isOpen && !levelUpUI.isOpen && !powerPopupOpen && !innUI.isOpen && !banditTradeUI.isOpen;

    // Pause / resume music when the pause screen appears or disappears
    if (isPauseScreen && !musicPaused) {
      audio.pauseMusic();
      musicPaused = true;
      pauseOpen = true;
      if (isMobile) minimap.toggle(false);
      trackEvent('pause_opened');
      flushEvents();
      showPauseTab(lastPauseTab);
    } else if (!isPauseScreen && musicPaused) {
      audio.resumeMusic();
      musicPaused = false;
      pauseOpen = false;
      if (isMobile) minimap.toggle(true);
    }

    // Hide joystick whenever any modal is blocking input
    if (isMobile && mobileControls) {
      mobileControls.setJoystickVisible(isLocked);
    }

    if (dialogueUI.isOpen || clueTracker.isOpen || levelUpUI.isOpen || powerPopupOpen || innUI.isOpen || banditTradeUI.isOpen) {
      // DIALOGUE MODE: Logic Paused, Cursor Free, UI Visible
      if (pauseScreen) pauseScreen.style.display = 'none';

      // Don't update controls or physics (effectively paused)
      // But RENDER so we see the dialogue box over the game
      renderer.render();
      return;
    } else if (!isLocked && !playerState.isDead) {
      // PAUSE MODE: Logic Paused, Cursor Free, Pause Screen Visible (only if game has started)
      if (pauseScreen) pauseScreen.style.display = gameStarted ? 'flex' : 'none';
      renderer.render();
      return;
    }

    // GAME LOOP
    if (pauseScreen) pauseScreen.style.display = 'none';

    // 1. Controls
    if (!playerState.isDead) controls.update(delta, playerState.agility);

    if (isMobile && mobileControls) {
      mobileControls.applyLook(renderer.camera);
      mobileControls.updateState(
        playerState.templesCompleted.includes('sky'),
        playerState.templesCompleted.includes('space'),
        playerState.canLevelUp
      );
    }

    // Winged Boots (Sky Temple): smoothly interpolate camera height
    if (playerState.templesCompleted.includes('sky')) {
      playerFly.flyY += (playerFly.flyTarget - playerFly.flyY) * Math.min(delta * 5, 1);
      renderer.camera.position.y = 2 + playerFly.flyY;
      controls.isFlying = playerFly.flyY > 0.5;
    }

    // Fire Bomb countdown
    if (activeBomb) {
      activeBomb.timer -= delta;
      // Alternate lit/unlit sprite as fuse shortens
      const pulse = Math.sin(activeBomb.timer * Math.PI * (4 - activeBomb.timer)) > 0;
      (activeBomb.sprite.material as THREE.SpriteMaterial).map = assetManager.getTexture(pulse ? 'magic_bomb_lit' : 'magic_bomb_unlit') ?? null;

      if (activeBomb.timer <= 0) {
        // Explode
        const blastCenter = new THREE.Vector3(activeBomb.wx, 1, activeBomb.wz);
        const blastRadiusTiles = 3;
        const blastRadiusWorld = blastRadiusTiles * 2; // tileSize = 2

        audio.playSound('/sounds/bomb_blast.wav');

        // Damage enemies in radius
        entityManager.damageInRadius(blastCenter, blastRadiusWorld, 5);

        // Destroy rock walls in blast radius (forest walls are indestructible)
        if (currentWorldData?.type === 'world' && currentWorldData.walls && currentWorldData.rockWalls) {
          const cx = Math.floor(activeBomb.wx / 2);
          const cz = Math.floor(activeBomb.wz / 2);
          for (let dx = -blastRadiusTiles; dx <= blastRadiusTiles; dx++) {
            for (let dz = -blastRadiusTiles; dz <= blastRadiusTiles; dz++) {
              if (Math.sqrt(dx * dx + dz * dz) <= blastRadiusTiles) {
                const tx = cx + dx, tz = cz + dz;
                if (tx > 0 && tx < currentWorldData.width - 1 && tz > 0 && tz < currentWorldData.height - 1) {
                  if (currentWorldData.rockWalls[tx][tz]) {
                    currentWorldData.walls[tx][tz] = false;
                    currentWorldData.rockWalls[tx][tz] = false;
                  }
                }
              }
            }
          }
          // Rock wall ore drops
          const oreRoll = Math.random();
          if (oreRoll < 0.10) {
            playerState.resources.gold++;
            showResourcePickup('gold', playerState.resources.gold);
          } else if (oreRoll < 0.50) {
            playerState.resources.iron_ore++;
            showResourcePickup('iron_ore', playerState.resources.iron_ore);
          }

          // Rebuild level geometry with updated walls
          builder.clear();
          builder.build(currentWorldData);
        }

        // Start explosion animation
        if (activeExplosion) { scene.remove(activeExplosion.sprite); }
        const exMat = new THREE.SpriteMaterial({ map: assetManager.getTexture('explosion_0'), transparent: true });
        const exSprite = new THREE.Sprite(exMat);
        exSprite.scale.set(6, 6, 6);
        exSprite.position.set(activeBomb.wx, 3, activeBomb.wz);
        scene.add(exSprite);
        activeExplosion = { sprite: exSprite, frame: 0, elapsed: 0 };

        scene.remove(activeBomb.sprite);
        activeBomb = null;
      }
    }

    // Explosion animation
    if (activeExplosion) {
      activeExplosion.elapsed += delta;
      const frame = Math.floor(activeExplosion.elapsed / EXPLOSION_FRAME_TIME);
      if (frame >= EXPLOSION_FRAMES) {
        scene.remove(activeExplosion.sprite);
        activeExplosion = null;
      } else if (frame !== activeExplosion.frame) {
        activeExplosion.frame = frame;
        (activeExplosion.sprite.material as THREE.SpriteMaterial).map = assetManager.getTexture(`explosion_${frame}`) ?? null;
      }
    }

    // Cooldown logic
    if (attackState.isAttacking) {
      attackState.timer -= delta;
      if (attackState.timer <= 0) {
        attackState.isAttacking = false;
      }
    }

    // --- DIRECTION ARROW LOGIC ---
    if (playerState.activeTask) {
      // Simple logic: If the Quest Giver is in the current scene, point to them.
      const giverId = playerState.activeTask.giverId;
      const targetEntity = entityManager.getEntityByPersonId(giverId);

      if (targetEntity) {
        arrowMesh.visible = true;
        // Position ABOVE the target entity
        arrowMesh.position.copy(targetEntity.sprite.position);
        arrowMesh.position.y += 2.5; // Float above head

        // Point DOWN at the entity
        arrowMesh.lookAt(targetEntity.sprite.position);
      } else {
        // TODO: Point to the town they are in? 
        arrowMesh.visible = false;
      }
    } else {
      arrowMesh.visible = false;
    }

    if (currentWorldData && !playerState.isDead) {
      entityManager.update(renderer.camera, currentWorldData.walls, delta, playerState.agility);
    }

    // Fallback temple-clear check — catches cases where entityKilled didn't trigger the reveal
    if (!worldCleared && currentWorldData?.type === 'temple') {
      const hasEnemies = entityManager.activeEntities.some(e => TEMPLE_ENEMY_TYPES.includes(e.data.type));
      if (!hasEnemies) {
        worldCleared = true;
        chestMarker = entityManager.revealTempleChest();
        audio.playSound('/sounds/temple_cleared.wav');
      }
    }

    renderer.render();
  };

  animate();





  // Interaction Listener
  window.addEventListener('playerInteract', async (e: any) => {
    // E key while inn open → close
    if (innUI.isOpen) {
      innUI.hide();
      return;
    }
    // E key while power popup open → dismiss
    if (powerPopupOpen) {
      hidePowerPopup();
      return;
    }
    // E key while dialogue open → dismiss
    if (dialogueUI.isOpen) {
      dialogueUI.hide();
      return;
    }
    // Pending lockpick confirmation: E pressed again to confirm use
    if (pendingLockpickPersonId) {
      const pId = pendingLockpickPersonId;
      pendingLockpickPersonId = null;
      playerState.lockpicks--;
      playerState.unlockedHouses.add(pId);
      showResourcePickup('lockpicks', playerState.lockpicks);
      const allPeople = playerState.towns.flatMap((t: any) => t.people ?? []);
      const owner = allPeople.find((p: any) => p.id === pId);
      if (owner?.isMinion) {
        const names: string[] = gameConfig.bindingNameRegistry ?? [];
        const nextName = names[playerState.demonBindings.length] ?? `Demon Binding ${playerState.demonBindings.length + 1}`;
        playerState.demonBindings.push(nextName);
        audio.playSound('/sounds/binding_found.wav');
        showNotif(Dialogue.house.binding, 3000);
      } else {
        showNotif(Dialogue.house.empty);
      }
      return;
    }
    const playerPos = e.detail.position;

    // 0. Check for Bandit (chick) — trade before NPC dialogue
    const nearbyChick = entityManager.activeEntities.find(en => {
      if (en.data.type !== 'chick') return false;
      if (en.data.properties.attacked) return false; // already attacked, no trade
      return en.sprite.position.distanceTo(playerPos) < 2.5;
    });
    if (nearbyChick) {
      banditEntityName = nearbyChick.data.name;
      controls.autoLock = false;
      controls.unlock();
      banditTradeUI.show(() => playerState.shuckles);
      return;
    }

    // 1. Check for NPCs
    const npcEntity = entityManager.checkForInteraction(playerPos);
    if (npcEntity) {
      console.log("Interacting with NPC:", npcEntity);
      controls.unlock();

      // Cast properties to Person (assuming WorldGenerator passes full data)
      const person = npcEntity.properties as Person;
      person.hasMet = true; // Mark as met locally

      // Update global visited registry
      if (!playerState.visitedPeople.has(person.id)) {
        playerState.visitedPeople.set(person.id, person);
      } else {
        // Update existing record (e.g. task status changes)
        playerState.visitedPeople.set(person.id, person);
      }

      // Automatically add "Bad Clue" (Rumor) to known clues on meeting
      if (person.clues && person.clues.bad) {
        const rumor = person.clues.bad;
        if (!playerState.knownClues.some(c => c.text === rumor.text)) {
          playerState.knownClues.push(rumor);
          console.log("Rumor collected:", rumor);
        }
      }

      // Update Label Color
      entityManager.updatePersonLabel(person.id, true);

      // Check if person is the one we have a task for
      // And update the Person object in real-time if needed?
      // Since we modified playerState.activeTask, we pass that.

      trackEvent('npc_dialogue_opened', { person_id: person.id, person_name: person.name });
      const hasEyeOfTruth = playerState.templesCompleted.includes('light');
      if (isMobile) minimap.toggle(false);
      dialogueUI.show(person, playerState.activeTask, playerState.items, playerState.towns, hasEyeOfTruth);
      return;
    }

    // 2. Check for temple chest
    if (currentWorldData?.type === 'temple') {
      const chestEntity = entityManager.checkForChest(playerPos);
      if (chestEntity) {
        const templeType = chestEntity.properties.templeType as string;
        if (!playerState.templesCompleted.includes(templeType)) {
          playerState.templesCompleted.push(templeType);
          entityManager.collectTempleChest(templeType);
          audio.playSound('/sounds/open_chest.wav');
          chestMarker = null;
          // Complete a FIND_ITEM task for this magic item if the player has one active
          if (playerState.activeTask && !playerState.activeTask.isCompleted
            && playerState.activeTask.type === 'FIND_ITEM'
            && playerState.activeTask.targetId === templeType) {
            playerState.activeTask.currentAmount = 1;
            playerState.activeTask.isCompleted = true;
            audio.playSound('/sounds/task_complete.wav');
            updateTaskHud();
          }
          setTimeout(() => showPowerPopup(templeType), 700);
        }
        return;
      }
    }

    // 3. Check for Signs and Doors
    if (currentWorldData && currentWorldData.doors) {
      const startX = playerPos.x / 2;
      const startY = playerPos.z / 2;

      // 3a. Portal / Inn door (non-house, non-locked doors)
      const closestDoor = currentWorldData.doors.find((d: any) => {
        if (d.type === 'house') return false;
        const dx = d.x - startX;
        const dy = d.y - startY;
        return Math.sqrt(dx * dx + dy * dy) < 1.5;
      });

      if (closestDoor) {
        if (closestDoor.type === 'inn') {
          // Initialize inn stock on first visit for this town
          const townId = (currentWorldData as any)?.customId ?? '';
          const priceMultipliers = (currentWorldData as any)?.priceMultipliers ?? {};
          if (!playerState.innStocks[townId]) {
            playerState.innStocks[townId] = {};
            for (const [r, mult] of Object.entries(priceMultipliers)) {
              playerState.innStocks[townId][r] = (7 - (mult as number)) * 10;
            }
          }
          controls.autoLock = false;
          controls.unlock();
          innUI.show(
            priceMultipliers,
            playerState.innStocks[townId] ?? {},
            playerState.resources as Record<string, number>,
            () => playerState.shuckles,
            playerState.towns,
            () => playerState.hp,
            playerState.maxHp,
          );
          return;
        }
        // Normal portal door — enter new world
        try {
          const res = await apiFetch(`${API_BASE}/api/enter/${closestDoor.id}`, { method: 'POST' });
          const newWorld = await res.json();
          await loadWorld(newWorld);
          flushEvents();
        } catch (err) {
          console.error(err);
        }
        return;
      }

      // 3b. House door interaction (locked / unlock / search) — checked before signs
      const houseDoor = currentWorldData.doors.find((d: any) => {
        if (d.type !== 'house') return false;
        const dx = d.x - startX;
        const dy = d.y - startY;
        return Math.sqrt(dx * dx + dy * dy) < 1.5;
      });

      if (houseDoor && currentWorldData.housePeople) {
        const personId = currentWorldData.housePeople[houseDoor.id];
        if (!personId) { showNotif(Dialogue.house.locked); return; }

        if (playerState.unlockedHouses.has(personId)) {
          showNotif(Dialogue.house.searched);
        } else if (playerState.hasLocksmithPower) {
          playerState.unlockedHouses.add(personId);
          playerState.hasLocksmithPower = false;
          const allPeople = playerState.towns.flatMap((t: any) => t.people ?? []);
          const owner = allPeople.find((p: any) => p.id === personId);
          if (owner?.isMinion) {
            const names: string[] = gameConfig.bindingNameRegistry ?? [];
            const nextName = names[playerState.demonBindings.length] ?? `Demon Binding ${playerState.demonBindings.length + 1}`;
            playerState.demonBindings.push(nextName);
            audio.playSound('/sounds/binding_found.wav');
            showNotif(Dialogue.house.binding, 3000);
          } else {
            showNotif(Dialogue.house.empty);
          }
        } else if (playerState.lockpicks > 0) {
          pendingLockpickPersonId = personId;
          showNotif(Dialogue.house.useLockpick, 3000);
        } else {
          showNotif(Dialogue.house.locked);
        }
        return;
      }

      // 3c. Sign check — only fires when not near any door
      const signEntry = builder.signSprites.find(({ sprite }) => {
        const sx = sprite.position.x / 2;
        const sz = sprite.position.z / 2;
        const dx = sx - startX;
        const dz = sz - startY;
        return Math.sqrt(dx * dx + dz * dz) < 1.5;
      });
      if (signEntry) {
        const allPeople = playerState.towns.flatMap((t: any) => t.people ?? []);
        const owner = allPeople.find((p: any) => p.id === signEntry.personId);
        if (owner) showNotif(Dialogue.house.sign(owner.name));
        return;
      }
    }
  });

  // --- TASK TRACKING EVENTS ---
};

let currentWorldData: any = null;
let overworldData: any = null; // Saved reference to the overworld for cheat teleport
let gameStarted = false;
let pendingMusicTrack = '/music/overworld.mp3';
let pauseOpen = false;
let lastTownId: string | null = null;

init().catch(err => {
  console.error(err);
  const msg = err?.message || JSON.stringify(err);
  const stack = err?.stack || 'No stack trace';
  document.body.innerHTML = `<div style="color: red; padding: 20px; font-family: monospace;">
        <h1>Game Error</h1>
        <pre>${msg}\n${stack}</pre>
    </div>`;
});
