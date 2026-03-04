import './style.css'
import * as THREE from 'three';
import { Renderer } from './engine/Renderer';
import { AssetManager } from './engine/AssetManager';
import { LevelBuilder } from './engine/LevelBuilder';
import { EntityManager } from './engine/EntityManager';
import { Controls } from './engine/Controls';
import { DialogueUI } from './ui/DialogueUI';
import { ClueTrackerUI } from './ui/ClueTrackerUI';
import { LevelUpUI } from './ui/LevelUpUI';
import { MinimapUI } from './ui/MinimapUI';
import type { GameTask, Person, Clue } from '../../shared/src/data/GameData';
import { Dialogue } from './data/dialogue';
import { API_BASE, apiFetch } from './config/api';
import { AudioManager, ENTITY_HIT_SOUNDS, ALL_SFX } from './engine/AudioManager';
import { ModelManager } from './engine/ModelManager';
import { StartScreenUI } from './ui/StartScreenUI';
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
  templesCompleted: [] as string[]
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
  const manifestResponse = await fetch('/src/data/assets.json');
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

  // 4. Setup Controls (Early Init)
  const controls = new Controls(renderer.camera, renderer.renderer.domElement);

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

  const volumeSlider = document.getElementById('volume-slider') as HTMLInputElement;
  const volumeValue = document.getElementById('volume-value') as HTMLSpanElement;
  const savedVolume = parseFloat(localStorage.getItem('volume') ?? '1.0');
  volumeSlider.value = String(savedVolume);
  volumeValue.textContent = savedVolume.toFixed(2);
  audio.setMasterVolume(savedVolume);
  volumeSlider.addEventListener('input', () => {
    const v = parseFloat(volumeSlider.value);
    volumeValue.textContent = v.toFixed(2);
    audio.setMasterVolume(v);
    localStorage.setItem('volume', String(v));
    trackEvent('settings_changed', { setting: 'volume', value: v });
  });

  // Pause screen: Settings / Stats / How To Play tabs
  const pauseBtnSettings = document.getElementById('pause-btn-settings') as HTMLButtonElement;
  const pauseBtnStats = document.getElementById('pause-btn-stats') as HTMLButtonElement;
  const pauseBtnHowto = document.getElementById('pause-btn-howto') as HTMLButtonElement;
  const pauseBtnItems = document.getElementById('pause-btn-items') as HTMLButtonElement;
  const pauseSettingsPanel = document.getElementById('pause-settings') as HTMLDivElement;
  const pauseStatsPanel = document.getElementById('pause-stats') as HTMLDivElement;
  const pauseHowtoPanel = document.getElementById('pause-howto') as HTMLDivElement;
  const pauseItemsPanel = document.getElementById('pause-items') as HTMLDivElement;

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

  const showPauseTab = (tab: 'settings' | 'stats' | 'howto' | 'items') => {
    pauseSettingsPanel.style.display = tab === 'settings' ? 'flex' : 'none';
    pauseStatsPanel.style.display = tab === 'stats' ? 'flex' : 'none';
    pauseHowtoPanel.style.display = tab === 'howto' ? 'flex' : 'none';
    pauseItemsPanel.style.display = tab === 'items' ? 'flex' : 'none';
    pauseBtnSettings.classList.toggle('active', tab === 'settings');
    pauseBtnStats.classList.toggle('active', tab === 'stats');
    pauseBtnHowto.classList.toggle('active', tab === 'howto');
    pauseBtnItems.classList.toggle('active', tab === 'items');
    if (tab === 'stats') updatePauseStats();
    if (tab === 'items') updatePauseItems();
  };

  pauseBtnSettings.addEventListener('click', () => showPauseTab('settings'));
  pauseBtnStats.addEventListener('click', () => showPauseTab('stats'));
  pauseBtnHowto.addEventListener('click', () => showPauseTab('howto'));
  pauseBtnItems.addEventListener('click', () => showPauseTab('items'));

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

  // Fire Bombs (Fire)
  let activeBomb: { mesh: THREE.Mesh; timer: number; wx: number; wz: number } | null = null;

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
    if (activeBomb) { scene.remove(activeBomb.mesh); activeBomb = null; }
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
      const TEMPLE_ENEMY_TYPES = ['bee', 'man_eater_flower', 'arachne', 'eyeball', 'fire_skull'];
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

    // Fetch Initial State (Items)
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
    volumeSlider.value = localStorage.getItem('volume') ?? '1.0';
    volumeValue.textContent = parseFloat(volumeSlider.value).toFixed(2);
    controls.lock();
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
    if (pauseOpen || dialogueUI.isOpen || clueTracker.isOpen || levelUpUI.isOpen || powerPopupOpen || playerState.isDead) return;

    // RMB — Protection Aura (Earth Temple)
    if (e.button === 2 && playerState.templesCompleted.includes('earth') && document.pointerLockElement && !playerState.isDead) {
      auraActive = true;
      auraOverlay.style.display = 'block';
      return;
    }

    // LMB — Attack (blocked while aura is active)
    if (auraActive) return;

    // Check if we have ANY pointer lock (don't care if body or canvas)
    if (document.pointerLockElement && !attackState.isAttacking && !playerState.isDead) {
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
      if (!document.pointerLockElement) {
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
      display.innerText = `Press F to Level Up!`;
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
      const TEMPLE_ENEMY_TYPES = ['bee', 'man_eater_flower', 'arachne', 'eyeball', 'fire_skull'];
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
        const otherTownPeople = allPeople.filter((p: Person) => p.attributes.townId !== currentTownId && !p.hasMet);
        if (otherTownPeople.length === 0) return Dialogue.powers.introduceOneNone;
        const pick = otherTownPeople[Math.floor(Math.random() * otherTownPeople.length)];
        introducePerson(pick);
        const otherTownName = playerState.towns.find((t: any) => t.id === pick.attributes.townId)?.name || pick.attributes.townId;
        return Dialogue.powers.introduceOneFromTown(pick.name, otherTownName);
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
        const townPeople = allPeople.filter((p: Person) => p.attributes.townId === currentTownId && p.id !== person.id);
        townPeople.forEach(introducePerson);
        return Dialogue.powers.mayorIntroduced;
      }
      case 'Merchant': {
        const unmet = allPeople.filter((p: Person) => !p.hasMet && p.id !== person.id);
        const count = Math.min(Math.floor(Math.random() * 5) + 1, unmet.length);
        const shuffled = unmet.sort(() => Math.random() - 0.5).slice(0, count);
        shuffled.forEach(introducePerson);
        return Dialogue.powers.introduceMultiple(count);
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
      case 'Baker': {
        const townPeople = allPeople.filter((p: Person) =>
          p.attributes.townId === currentTownId && !p.isDemon && p.id !== person.id
        );
        if (townPeople.length === 0) return Dialogue.powers.bakerNone;
        const pick = townPeople[Math.floor(Math.random() * townPeople.length)];
        const clueText = Dialogue.powers.bakerInnocent(pick.name);
        addClue({ text: clueText, isGood: false, isSpecial: true });
        return clueText;
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

  // --- CLUE TRACKER ---
  const clueTracker = new ClueTrackerUI(assetManager);

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
          hp: playerState.strength * 15,
          maxHp: playerState.strength * 15,
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
    const locked = !!document.pointerLockElement;
    const canUsePower = locked && !playerState.isDead && !dialogueUI.isOpen && !clueTracker.isOpen && !levelUpUI.isOpen && gameStarted;

    // Q — Winged Boots (Sky Temple): toggle fly
    if (e.code === 'KeyQ' && canUsePower && playerState.templesCompleted.includes('sky')) {
      playerFly.flyTarget = playerFly.flyTarget > 0 ? 0 : 6;
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

    // Z — Fire Bomb (Fire Temple): place bomb (overworld only, 1 at a time)
    if (e.code === 'KeyZ' && canUsePower && playerState.templesCompleted.includes('fire')
      && !activeBomb && currentWorldData?.type === 'world') {
      const bx = renderer.camera.position.x;
      const bz = renderer.camera.position.z;
      const bombGeom = new THREE.SphereGeometry(0.35, 8, 8);
      const bombMat = new THREE.MeshBasicMaterial({ color: 0xff6600 });
      const bombMesh = new THREE.Mesh(bombGeom, bombMat);
      bombMesh.position.set(bx, 0.35, bz);
      scene.add(bombMesh);
      activeBomb = { mesh: bombMesh, timer: 3.0, wx: bx, wz: bz };
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
        clueTracker.show(knownPeople, playerState.knownClues, playerState.items, playerState.towns, playerState.activeTask, onSelectTask, currentWorldId);
      }
    }
  });

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
        playerFacingAngle
      );
    }

    const pauseScreen = document.getElementById('pause-screen');
    const isLocked = document.pointerLockElement !== null;
    const isPauseScreen = gameStarted && !isLocked && !playerState.isDead && !dialogueUI.isOpen && !clueTracker.isOpen && !levelUpUI.isOpen && !powerPopupOpen;

    // Pause / resume music when the pause screen appears or disappears
    if (isPauseScreen && !musicPaused) {
      audio.pauseMusic();
      musicPaused = true;
      pauseOpen = true;
      trackEvent('pause_opened');
      flushEvents();
      showPauseTab('settings'); // Always open to Settings tab
    } else if (!isPauseScreen && musicPaused) {
      audio.resumeMusic();
      musicPaused = false;
      pauseOpen = false;
    }

    if (dialogueUI.isOpen || clueTracker.isOpen || levelUpUI.isOpen || powerPopupOpen) {
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

    // Winged Boots (Sky Temple): smoothly interpolate camera height
    if (playerState.templesCompleted.includes('sky')) {
      playerFly.flyY += (playerFly.flyTarget - playerFly.flyY) * Math.min(delta * 5, 1);
      renderer.camera.position.y = 2 + playerFly.flyY;
    }

    // Fire Bomb countdown
    if (activeBomb) {
      activeBomb.timer -= delta;
      // Pulse bomb color as fuse shortens
      const pulse = Math.sin(activeBomb.timer * Math.PI * (4 - activeBomb.timer)) > 0;
      (activeBomb.mesh.material as THREE.MeshBasicMaterial).color.setHex(pulse ? 0xff6600 : 0xffcc00);

      if (activeBomb.timer <= 0) {
        // Explode
        const blastCenter = new THREE.Vector3(activeBomb.wx, 1, activeBomb.wz);
        const blastRadiusTiles = 5;
        const blastRadiusWorld = blastRadiusTiles * 2; // tileSize = 2

        // Damage enemies in radius
        entityManager.damageInRadius(blastCenter, blastRadiusWorld, 5);

        // Destroy overworld walls in blast radius
        if (currentWorldData?.type === 'world' && currentWorldData.walls) {
          const cx = Math.floor(activeBomb.wx / 2);
          const cz = Math.floor(activeBomb.wz / 2);
          for (let dx = -blastRadiusTiles; dx <= blastRadiusTiles; dx++) {
            for (let dz = -blastRadiusTiles; dz <= blastRadiusTiles; dz++) {
              if (Math.sqrt(dx * dx + dz * dz) <= blastRadiusTiles) {
                const tx = cx + dx, tz = cz + dz;
                if (tx > 0 && tx < currentWorldData.width - 1 && tz > 0 && tz < currentWorldData.height - 1) {
                  currentWorldData.walls[tx][tz] = false;
                }
              }
            }
          }
          // Rebuild level geometry with updated walls
          builder.clear();
          builder.build(currentWorldData);
        }

        scene.remove(activeBomb.mesh);
        activeBomb = null;
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
      const TEMPLE_ENEMY_TYPES = ['bee', 'man_eater_flower', 'arachne', 'eyeball', 'fire_skull'];
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
    const playerPos = e.detail.position;

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

    // 3. Check for Doors
    if (currentWorldData && currentWorldData.doors) {
      const startX = playerPos.x / 2; // tileSize 2
      const startY = playerPos.z / 2;

      const closestDoor = currentWorldData.doors.find((d: any) => {
        // FILTER: Ignore 'house' doors (decorative only)
        if (d.type === 'house') return false;

        const dx = d.x - startX;
        const dy = d.y - startY;
        return Math.sqrt(dx * dx + dy * dy) < 1.5; // Distance check
      });

      if (closestDoor) {
        console.log("Entering door...", closestDoor);
        try {
          // Enter Door
          const res = await apiFetch(`${API_BASE}/api/enter/${closestDoor.id}`, { method: 'POST' });
          const newWorld = await res.json();

          // LOAD NEW WORLD WITHOUT RELOAD
          await loadWorld(newWorld);
          flushEvents();

          // Refill HP only when entering a town
          const enteredTown = newWorld.type === 'city' || String(newWorld.customId || '').startsWith('town_');
          if (enteredTown) {
            playerState.hp = playerState.maxHp;
            updateHealthUI();
          }

        } catch (err) {
          console.error(err);
        }
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
