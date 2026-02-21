# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mini Burger is a detective-style puzzle RPG where the player must find a hidden demon among a procedurally generated world of NPCs. Built as a TypeScript monorepo with a Three.js browser client and an Express REST API backend.

## Monorepo Structure

```
miniburger-ts/
├── client/    # Three.js browser game (Vite)
├── server/    # Express REST API (ts-node)
└── shared/    # Shared TypeScript types/data
```

## Development Commands

Run both servers simultaneously in separate terminals:

```bash
# Server (port 3000)
cd server && npm run dev     # nodemon + ts-node, auto-restarts on changes

# Client (port 5173)
cd client && npm run dev     # Vite dev server with HMR
```

Other commands:
```bash
cd client && npm run build   # tsc + Vite bundle to dist/
cd shared && npm run build   # tsc to dist/ (required if shared types change)
cd server && npm start       # ts-node without nodemon (production)
```

No test framework is configured.

## Architecture

### Client-Server Communication

The client fetches from `http://localhost:3000` via plain `fetch()` REST calls. The server holds all game state in memory as a singleton (`GameState.ts`). MongoDB/Mongoose is present as a dependency but currently disabled.

Key API endpoints:
- `GET /api/config` — game configuration
- `GET /api/generate` — procedurally generate world, returns terrain + entity data
- `POST /api/enter/:doorId` — transition between overworld and a town
- `POST /api/accuse` — win/lose check
- `POST /api/escort/complete`, `POST /api/item/take` — task actions

### Game State Flow

1. Client calls `/api/generate` → server runs `WorldGenerator.generateDemonHunterWorld()`, stores result in `GameState` singleton
2. Client renders overworld via Three.js; player walks to town doors
3. Door proximity triggers `POST /api/enter/:doorId` → server returns town layout + NPCs
4. NPC interaction flows through `DialogueUI.ts`; tasks tracked client-side with server validation
5. Accusation calls `/api/accuse` for win/lose resolution

### Key Shared Types (`shared/src/data/GameData.ts`)

- `Person` — NPC with `attributes` (occupation, pet, color, item, townId), `clues` (good/bad), `task`, `isDemon`, `isMinion`
- `DemonHunterState` — top-level game state: `demonId`, `towns[]`, `items[]`, `knownClues[]`, `gameOver`, `gameWon`
- `TaskType` — `KILL | FIND_PERSON | FIND_ITEM | ESCORT`

### Client Engine (`client/src/engine/`)

- **`Renderer.ts`** — Three.js `WebGLRenderer` setup; perspective camera at 10-unit eye level; `NearestFilter` for pixel art aesthetic
- **`EntityManager.ts`** — manages Three.js `Sprite` objects for all entities; handles directional animation (up/down/side frames), projectile tracking, and escort follower logic
- **`LevelBuilder.ts`** — converts server-provided 2D tile arrays into 3D geometry (floors, walls, doors) for both overworld and towns
- **`Controls.ts`** — `PointerLockControls` for FPS-style movement; WASD input

### Server Services (`server/src/services/`)

- **`WorldGenerator.ts`** — procedural generation: 3 towns × 10 NPCs, random demon + minions, clue assignment, task generation and distribution
- **`GameState.ts`** — singleton holding `DemonHunterState`; mutated by controller actions
- **`DemonLogic.ts`** — clue validation, accusation resolution, good/bad clue determination

### Configuration (`server/src/config/gameConfig.ts`)

All tunable numbers live here: world dimensions (200×200 tiles), 8 enemy types with HP/XP/speed/spawn limits, XP curve (`[4, 8, 16, 32, 64, 128, 256, 512, 1024]`), player stat caps (strength/agility max 5, health max 10, range max 5), minion count per town.

## Game Design Rules (Critical for Logic Changes)

- **5 good clues** per demon (town, color, pet, occupation, item) — only revealed after completing a person's task
- **Demon always lies**: gives exactly 1 bad clue that contradicts a good clue (not location)
- **Item conflict**: if player takes demon's item, the person with the item clue must report demon has nothing
- **Escort updates clue data**: if the demon is escorted, location-based clues must update
- **Occupations unique per town** (fixed list of 10); items unique per person across entire world
- **Accuse wrong person → instant game loss**; correct accusation unlocks dungeon fight

## UI Components (`client/src/ui/`)

- **`DialogueUI.ts`** — 2-column layout: left for interaction options, right for NPC attributes
- **`ClueTrackerUI.ts`** — pause-menu clue/person log with active task management
- **`MinimapUI.ts`** — overhead minimap with task markers for active targets
- **`LevelUpUI.ts`** — stat distribution screen shown on level-up
