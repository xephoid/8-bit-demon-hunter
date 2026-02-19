import './style.css'
import * as THREE from 'three';
import { Renderer } from './engine/Renderer';
import { AssetManager } from './engine/AssetManager';
import { LevelBuilder } from './engine/LevelBuilder';
import { EntityManager } from './engine/EntityManager';
import { Controls } from './engine/Controls';
import { DialogueUI } from './ui/DialogueUI';
import { ClueTrackerUI } from './ui/ClueTrackerUI';
import { MinimapUI } from './ui/MinimapUI';
import type { GameTask, Person, Clue } from '../../shared/src/data/GameData';

const init = async () => {
  // 1. Setup Renderer
  const renderer = new Renderer();

  // 2. Load Assets
  const assetManager = new AssetManager();
  const manifestResponse = await fetch('/src/data/assets.json');
  const manifest = await manifestResponse.json();
  await assetManager.loadAssets(manifest);

  // 3. Setup Scene
  const scene = renderer.scene;
  const entityManager = new EntityManager(scene, assetManager);
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

    // 3. Spawn Player at SpawnPoint
    if (worldData.spawnPoints && worldData.spawnPoints.length > 0) {
      const spawnPoint = worldData.spawnPoints[0];
      renderer.camera.position.set(spawnPoint.x * 2, 2, spawnPoint.y * 2);
    }

    // 4. Update Controls reference
    controls.setWorldData(worldData);
  };

  // 5. Generate Initial World
  try {
    const response = await fetch('http://localhost:3000/api/generate');
    const worldData = await response.json();
    await loadWorld(worldData);
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

  // --- PLAYER STATE ---
  const playerState = {
    hp: 10,
    maxHp: 10,
    isDead: false,
    invulnTimer: 0,
    activeTask: null as GameTask | null,
    knownClues: [] as Clue[],
    visitedPeople: new Map<string, Person>(), // Track people met globally
    inventory: [] as string[]
  };

  // --- ATTACK LOGIC ---
  const attackState = {
    isAttacking: false,
    timer: 0,
    bbox: new THREE.Box3(),
    visual: null as THREE.Mesh | null
  };

  // Create Attack Visual (Slash)
  const slashGeo = new THREE.PlaneGeometry(2, 4);
  const slashTexture = assetManager.getTexture('slash');
  const slashMat = new THREE.MeshBasicMaterial({
    map: slashTexture,
    transparent: true,
    side: THREE.DoubleSide
  });
  attackState.visual = new THREE.Mesh(slashGeo, slashMat);
  attackState.visual.visible = false;
  attackState.visual.rotation.x = -Math.PI / 2; // Flat on ground
  scene.add(attackState.visual);

  // Direction Arrow
  const arrowGeo = new THREE.ConeGeometry(0.5, 1.5, 8);
  const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffff00 }); // Yellow arrow
  const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
  arrowMesh.visible = false;
  arrowMesh.rotation.x = Math.PI / 2; // Point forward? No, Cone points up Y by default. 
  // We want it to point at target. lookAt points Z axis. 
  // If we rotate cone to point along Z...
  arrowMesh.geometry.rotateX(-Math.PI / 2); // Point along -Z (Away from camera? No wait, towards Z- if lookAt aligns -Z)
  scene.add(arrowMesh);

  document.addEventListener('mousedown', () => {
    // Check UI state
    if (dialogueUI.isOpen || clueTracker.isOpen) return;

    // Check if we have ANY pointer lock (don't care if body or canvas)
    if (document.pointerLockElement && !attackState.isAttacking && !playerState.isDead) {
      // SLASH
      attackState.isAttacking = true;
      attackState.timer = 0.2; // 200ms slash
      attackState.visual!.visible = true;

      // Position slash in front of player
      const pPos = renderer.camera.position.clone();
      const dir = new THREE.Vector3();
      renderer.camera.getWorldDirection(dir);
      dir.y = 0; dir.normalize();

      // slashPos = pPos + (dir * 1.5)
      const slashPos = pPos.clone().add(dir.clone().multiplyScalar(2.5));

      attackState.visual!.position.copy(slashPos);
      attackState.visual!.position.y = 1.5; // Height (Chest level)

      // target = pPos + (dir * 2.0)
      const target = pPos.clone().add(dir.clone().multiplyScalar(2.0)); // Look 2u ahead of player
      target.y = attackState.visual!.position.y; // Force flat (same height)

      attackState.visual!.lookAt(target);
      attackState.visual!.rotateX(-60 * (Math.PI / 180)); // Tilt forward 15 deg
      attackState.visual!.rotateZ(Math.PI / 5); // Rotate texture 45 deg

      // Calculate Hitbox
      attackState.bbox.setFromCenterAndSize(slashPos, new THREE.Vector3(4, 2, 4));

      // Check Hit
      entityManager.checkAttack(attackState.bbox, 1);
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

  // Initial UI Render
  updateHealthUI();

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
      alert("YOU DIED");
      window.location.reload();
    }
  });

  // Interaction Listener
  // --- DIALOGUE UI ---
  const dialogueUI = new DialogueUI();

  // Task Acceptance Logic
  dialogueUI.onAcceptTask = (task: GameTask) => {
    console.log("Accepted Task:", task);
    playerState.activeTask = task;
    alert(`Accepted Task: ${task.description}`); // Temporary feedback
  };

  // Task Completion Logic (Handled in UI, just need to update state if needed)
  dialogueUI.onCompleteTask = (person: Person) => {
    console.log("Completed Task for:", person.name);
    playerState.activeTask = null; // Clear active task

    // Grant Clue (Good AND Bad)
    if (person.clues) {
      // Good Clue
      if (person.clues.good) {
        const clue = person.clues.good;
        if (!playerState.knownClues.some(c => c.text === clue.text)) {
          playerState.knownClues.push(clue);
          console.log("Good Clue Added:", clue);
        }
      }
      // Bad Clue (User Request)
      if (person.clues.bad) {
        const clue = person.clues.bad;
        if (!playerState.knownClues.some(c => c.text === clue.text)) {
          playerState.knownClues.push(clue);
          console.log("Bad Clue Added:", clue);
        }
      }
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
        taskHud.innerText = `TASK COMPLETED!\nReturn to ${playerState.activeTask.giverId}`; // TODO: Real Name
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

  // Toggle Clue Tracker
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyC') {
      // Use global state
      const knownPeople = Array.from(playerState.visitedPeople.values());

      if (clueTracker.isOpen) {
        clueTracker.hide();
        controls.lock();
      } else {
        controls.unlock();
        clueTracker.show(knownPeople, playerState.knownClues);
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
        (currentWorldData.customId || currentWorldData.id).toString()
      );
    }

    const pauseScreen = document.getElementById('pause-screen');
    const isLocked = document.pointerLockElement !== null;

    if (dialogueUI.isOpen || clueTracker.isOpen) {
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
    if (!playerState.isDead) controls.update(delta, currentWorldData);

    // Update Attack Visual
    if (attackState.isAttacking) {
      attackState.timer -= delta;
      if (attackState.timer <= 0) {
        attackState.isAttacking = false;
        attackState.visual!.visible = false;
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
      entityManager.update(renderer.camera, currentWorldData.walls);
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

      dialogueUI.show(person, playerState.activeTask);
      return;
    }

    // 2. Check for Doors
    if (currentWorldData && currentWorldData.doors) {
      const startX = playerPos.x / 2; // tileSize 2
      const startY = playerPos.z / 2;

      const closestDoor = currentWorldData.doors.find((d: any) => {
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
  window.addEventListener('entityKilled', (e: any) => {
    const entityData = e.detail;
    if (playerState.activeTask && !playerState.activeTask.isCompleted) {
      if (playerState.activeTask.type === 'KILL') {
        // Check target. Generic monsters like 'skeleton' vs 'skeleton_1'
        // Task targetId usually 'skeleton', 'slime' etc.
        if (entityData.type === playerState.activeTask.targetId) {
          playerState.activeTask.currentAmount++;
          console.log(`Task Progress: ${playerState.activeTask.currentAmount}/${playerState.activeTask.amount}`);

          if (playerState.activeTask.currentAmount >= playerState.activeTask.amount) {
            playerState.activeTask.isCompleted = true;
            console.log("TASK COMPLETE!");
            // Visual notification could go here
          }
        }
      }
    }
  });
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
