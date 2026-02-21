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
  canLevelUp: false
};

let gameConfig: any;

const init = async () => {
  // 1. Setup Renderer
  const renderer = new Renderer();

  // 2. Load Assets
  const assetManager = new AssetManager();
  const manifestResponse = await fetch('/src/data/assets.json');
  const manifest = await manifestResponse.json();

  // Programmatically add all 52+ character skins (24 rows * 26 skins * 3 dirs)
  // Rows: 0-23
  // Cols: 0-77
  // Filename: sprites/sliced/character_ROW_COL.png
  // Key: character_ROW_COL
  for (let row = 0; row < 24; row++) {
    for (let col = 0; col < 78; col++) {
      const key = `character_${row}_${col}`;
      // Check if already in manifest to avoid overwrite (though simple overwrite is fine)
      if (!manifest.textures[key]) {
        manifest.textures[key] = `sprites/sliced/${key}.png`;
      }
    }
  }

  await assetManager.loadAssets(manifest);

  const configRes = await fetch('http://localhost:3000/api/config');
  gameConfig = await configRes.json();

  // 3. Setup Scene
  const scene = renderer.scene;
  const entityManager = new EntityManager(scene, assetManager, gameConfig);
  const builder = new LevelBuilder(scene, assetManager);

  // 4. Setup Controls (Early Init)
  const controls = new Controls(renderer.camera, renderer.renderer.domElement);

  // --- WORLD LOADING ---
  const loadWorld = async (worldData: any) => {
    currentWorldData = worldData;

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
      let name = "Unknown Location";
      if (worldData.customId === 'world_main') name = "Overworld";
      else if (worldData.customId.startsWith('town_')) {
        // Try to find town name from global registry if available?
        const townId = worldData.customId;
        const town = playerState.towns.find(t => t.id === townId);
        name = town ? town.name : `Town ${townId}`;
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
        console.log("ESCORT COMPLETE!");
        alert("Escort Mission Complete! You arrived at " + playerState.activeTask.targetName);
        // Clear Follower
        if (entityManager.follower) {
          scene.remove(entityManager.follower.sprite);
          entityManager.follower = null;
        }

        // Backend Update & Spawn
        const giverId = playerState.activeTask.giverId;
        const giver = playerState.visitedPeople.get(giverId);
        if (giver) {
          fetch('http://localhost:3000/api/escort/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ personId: giverId, targetTownId: currentId })
          }).then(res => res.json()).then(data => {
            if (data.success && data.updatedPerson) {
              playerState.visitedPeople.set(giverId, data.updatedPerson);

              // Spawn NPC as a proper entity in the destination town
              const tileX = Math.round((renderer.camera.position.x - 1) / 2);
              const tileY = Math.round((renderer.camera.position.z - 1) / 2) + 1;
              entityManager.spawnEntity({
                type: 'person',
                name: data.updatedPerson.name,
                x: tileX,
                y: tileY,
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
    const response = await fetch('http://localhost:3000/api/generate');
    const worldData = await response.json();

    // Extract global items from initial world load (hack: server sends them in worldData or we need separate fetch?)
    // WorldGenerator returns simple world, does NOT return items.
    // We need to fetch items separately or server needs to embed them?
    // Let's fetch them from a new endpoint or just assume we can get them.
    // Actually, DemonLogic returns items. WorldGenerator puts them in GameState.
    // We should add an endpoint to get GameState or Items.
    // For now, let's assume worldData MIGHT contain them if we modify server.
    // converting...
    await loadWorld(worldData);

    // Fetch Initial State (Items)
    const stateRes = await fetch('http://localhost:3000/api/state');
    const state = await stateRes.json();
    if (state.items) {
      playerState.items = state.items;
      console.log("Loaded Items:", playerState.items.length);
    }
    if (state.towns) {
      playerState.towns = state.towns;
      console.log("Loaded Towns:", playerState.towns.length, playerState.towns);
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

  document.addEventListener('mousedown', () => {
    // Check UI state
    if (dialogueUI.isOpen || clueTracker.isOpen || levelUpUI.isOpen || playerState.isDead) return;

    // Check if we have ANY pointer lock (don't care if body or canvas)
    if (document.pointerLockElement && !attackState.isAttacking && !playerState.isDead) {
      // SLASH (Cooldown tracking)
      attackState.isAttacking = true;
      attackState.timer = 0.3; // 300ms cooldown

      // Calculate direction from player camera
      const pPos = renderer.camera.position.clone();
      const dir = new THREE.Vector3();
      renderer.camera.getWorldDirection(dir);
      dir.y = 0; dir.normalize();

      // Ensure we spawn it slightly in front so it doesn't immediately "hit" the player unintentionally 
      // (Even though player projectiles ignore player box)
      const spawnX = pPos.x + (dir.x * 1.5);
      const spawnZ = pPos.z + (dir.z * 1.5);

      // Spawn projectile with range modifier
      entityManager.spawnProjectile(spawnX, spawnZ, dir, 'slash', true, playerState.range);

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
      display.innerText = `Press L to Level Up!`;
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
    if (deathScreen) deathScreen.style.display = 'flex';
  };

  const hideDeathScreen = () => {
    if (deathScreen) deathScreen.style.display = 'none';
  };

  document.getElementById('btn-new-game')?.addEventListener('click', () => {
    window.location.reload();
  });

  document.getElementById('btn-continue')?.addEventListener('click', () => {
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

    // Respawn at a random spawn point in the current world
    if (currentWorldData?.spawnPoints?.length > 0) {
      const idx = Math.floor(Math.random() * currentWorldData.spawnPoints.length);
      const sp = currentWorldData.spawnPoints[idx];
      renderer.camera.position.set((sp.x * 2) + 1, 2, (sp.y * 2) + 1);
    }

    hideDeathScreen();
    updateHealthUI();
    updateXPUI();
    controls.lock();
  });

  // Listen for Damage
  window.addEventListener('playerDamaged', (e: any) => {
    if (playerState.isDead || Date.now() < playerState.invulnTimer) return;

    const dmg = e.detail.damage;
    const srcPos = e.detail.srcPos;

    playerState.hp -= dmg;
    console.log(`Player Hit! HP: ${playerState.hp}`);

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
      playerState.isDead = true;
      console.log("GAME OVER");
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

    if (!wasBlacksmith) {
      // Check if another level is pending
      const prog = gameConfig.playerProgression;
      if (playerState.level < prog.maxLevel) {
        const nextXpNeeded = prog.xpCurve[playerState.level - 1];
        playerState.canLevelUp = playerState.xp >= nextXpNeeded;
      } else {
        playerState.canLevelUp = false;
      }
    }
    updateXPUI();
  };

  window.addEventListener('entityKilled', (e: any) => {
    const entityData = e.detail;

    // 1. Task Check
    if (playerState.activeTask && !playerState.activeTask.isCompleted) {
      if (playerState.activeTask.type === 'KILL' && entityData.type === playerState.activeTask.targetId) {
        playerState.activeTask.currentAmount++;
        if (playerState.activeTask.currentAmount >= playerState.activeTask.amount) {
          playerState.activeTask.isCompleted = true;
        }
        updateTaskHud();
      }
    }

    // 2. XP Gain
    const enemyTemplate = gameConfig.enemies?.find((e: any) => e.id === entityData.type);
    const xpGain = enemyTemplate?.xp || 1;
    playerState.xp += xpGain;
    console.log(`Gained ${xpGain} XP! Total: ${playerState.xp}`);

    // 3. Level Up Check
    const prog = gameConfig.playerProgression;
    if (playerState.level < prog.maxLevel) {
      const xpNeeded = prog.xpCurve[playerState.level - 1];
      if (playerState.xp >= xpNeeded && !playerState.canLevelUp) {
        playerState.canLevelUp = true;
      }
    }
    updateXPUI();
  });

  // Interaction Listener
  // --- DIALOGUE UI ---
  const dialogueUI = new DialogueUI();

  // Task Acceptance Logic
  dialogueUI.onAcceptTask = (task: GameTask) => {
    console.log("Accepted Task:", task);
    playerState.activeTask = task;
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

  // Task Completion Logic
  dialogueUI.onCompleteTask = (person: Person, rewardChoice: 'CLUE' | 'POWER'): string | void => {
    console.log("Completed Task for:", person.name);
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

  // Toggle Clue Tracker or Level Up UI
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyL' && playerState.canLevelUp) {
      if (levelUpUI.isOpen) {
        levelUpUI.hide();
        controls.lock();
      } else {
        controls.unlock();
        levelUpUI.show(playerState.level + 1, playerState, gameConfig.playerProgression.stats);
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
        };

        clueTracker.show(knownPeople, playerState.knownClues, playerState.items, playerState.towns, playerState.activeTask, onSelectTask);
      }
    }
  });

  const animate = () => {
    requestAnimationFrame(animate);

    const delta = clock.getDelta(); // Always consume time to prevent jump on unpause
    updateTaskHud(); // Keep HUD updated

    // Minimap Update
    if (currentWorldData) {
      // Player Pos in Grid Coords
      const pp = { x: renderer.camera.position.x / 2, y: renderer.camera.position.z / 2 };

      minimap.update(
        pp,
        { width: currentWorldData.width, height: currentWorldData.height },
        currentWorldData.doors || [],
        entityManager.activeEntities,
        playerState.activeTask,
        playerState.visitedPeople,
        (currentWorldData.customId || currentWorldData.id || "unknown").toString(),
        clueTracker.currentTab,
        currentWorldData.walls || null
      );
    }

    const pauseScreen = document.getElementById('pause-screen');
    const isLocked = document.pointerLockElement !== null;

    if (dialogueUI.isOpen || clueTracker.isOpen || levelUpUI.isOpen) {
      // DIALOGUE MODE: Logic Paused, Cursor Free, UI Visible
      if (pauseScreen) pauseScreen.style.display = 'none';

      // Don't update controls or physics (effectively paused)
      // But RENDER so we see the dialogue box over the game
      renderer.render();
      return;
    } else if (!isLocked && !playerState.isDead) {
      // PAUSE MODE: Logic Paused, Cursor Free, Pause Screen Visible
      if (pauseScreen) pauseScreen.style.display = 'flex';
      renderer.render();
      return;
    }

    // GAME LOOP
    if (pauseScreen) pauseScreen.style.display = 'none';

    // 1. Controls (Movement)
    if (!playerState.isDead) controls.update(delta, playerState.agility);

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

    if (currentWorldData) {
      entityManager.update(renderer.camera, currentWorldData.walls, delta);
    }
    renderer.render();
  };

  animate();





  // Interaction Listener
  window.addEventListener('playerInteract', async (e: any) => {
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

      dialogueUI.show(person, playerState.activeTask, playerState.items, playerState.towns);
      return;
    }

    // 2. Check for Doors
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
          const res = await fetch(`http://localhost:3000/api/enter/${closestDoor.id}`, { method: 'POST' });
          const newWorld = await res.json();

          // LOAD NEW WORLD WITHOUT RELOAD
          await loadWorld(newWorld);

          // Refill HP (User Request)
          playerState.hp = playerState.maxHp;
          updateHealthUI();
          console.log("HP Refilled!");

        } catch (err) {
          console.error(err);
        }
      }
    }
  });

  // --- TASK TRACKING EVENTS ---
};

let currentWorldData: any = null;

init().catch(err => {
  console.error(err);
  const msg = err?.message || JSON.stringify(err);
  const stack = err?.stack || 'No stack trace';
  document.body.innerHTML = `<div style="color: red; padding: 20px; font-family: monospace;">
        <h1>Game Error</h1>
        <pre>${msg}\n${stack}</pre>
    </div>`;
});
