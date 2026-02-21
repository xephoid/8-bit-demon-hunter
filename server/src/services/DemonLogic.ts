import { Person, Town, Clue, GameTask, TaskType, DemonHunterState, Occupation, Pet, Color, Item } from '../../../shared/src/data/GameData';
import { gameConfig } from '../config/gameConfig';

export class DemonLogic {

    public static generatePuzzle(towns: Town[], people: Person[]): Partial<DemonHunterState> {
        // 1. Select Demon
        const demon = people[Math.floor(Math.random() * people.length)];
        demon.isDemon = true;
        console.log(`Demon Selected: ${demon.name} (${demon.id}) in ${demon.attributes.townId}`);

        // Select Minions
        const minionCount = towns.length * (gameConfig.world.minionsPerTown || 1);
        const candidates = people.filter(p => !p.isDemon);
        DemonLogic.shuffle(candidates);
        for (let i = 0; i < Math.min(minionCount, candidates.length); i++) {
            candidates[i].isMinion = true;
            console.log(`Minion Selected: ${candidates[i].name} (${candidates[i].id}) in ${candidates[i].attributes.townId}`);
        }

        // 2. Generate Items (Unique per world)
        // README: "Generate ten times that number of items... 1 unique per person"
        const items: Item[] = [];
        const itemRegistry = [...gameConfig.itemNameRegistry];
        DemonLogic.shuffle(itemRegistry); // Randomize order

        for (let i = 0; i < people.length; i++) {
            const name = i < itemRegistry.length ? itemRegistry[i] : `Item ${i}`;
            items.push({ id: `item_${i}`, name: name, description: `A unique ${name}.` });
        }

        // 3. Assign Attributes
        const occupations = Object.values(Occupation);
        const pets = Object.values(Pet);
        const colors = Object.values(Color);

        // Ensure unique occupations per town if possible (README: "Occupations should be unique per town")
        // Current implementation in WorldGenerator handles this mostly, but let's trust input 'people' has attributes or we overwrite?
        // WorldGenerator already assigns attributes. We might overwrite items to ensure uniqueness.
        people.forEach((p, index) => {
            // p.attributes.occupation set by WorldGenerator
            // p.attributes.pet set by WorldGenerator
            // p.attributes.color set by WorldGenerator
            p.attributes.item = items[index].id; // Assign unique item
        });

        // 4. Generate Clues
        const tempState = {
            demonId: demon.id,
            knownClues: [],
            activeTask: null,
            towns: towns,
            items: items,
            gameOver: false,
            gameWon: false
        } as DemonHunterState;
        DemonLogic.regenerateClues(tempState);

        // 5. Generate Tasks
        DemonLogic.generateTasks(people, items, towns);

        return {
            demonId: demon.id,
            items: items,
            towns: towns
        };
    }

    public static regenerateClues(state: DemonHunterState) {
        if (!state.demonId) return;

        const allPeople = state.towns.flatMap(t => t.people);
        const demon = allPeople.find(p => p.id === state.demonId);
        if (!demon) return;

        // Clear existing clues
        allPeople.forEach(p => {
            p.clues = {};
        });

        // Truth about the Demon
        const truth = {
            occupation: demon.attributes.occupation,
            pet: demon.attributes.pet,
            color: demon.attributes.color,
            townId: demon.attributes.townId,
            item: demon.attributes.item
        };

        const goodClues: Clue[] = [
            { text: `The demon is a ${truth.occupation}`, isGood: true, relatedAttribute: { key: 'occupation', value: truth.occupation } },
            { text: `The demon has a ${truth.pet}`, isGood: true, relatedAttribute: { key: 'pet', value: truth.pet } },
            { text: `The demon likes ${truth.color}`, isGood: true, relatedAttribute: { key: 'color', value: truth.color } },
            { text: `The demon is in ${state.towns.find(t => t.id === truth.townId)?.name || 'Unknown Town'}`, isGood: true, relatedAttribute: { key: 'townId', value: truth.townId } }
        ];

        // Item Clue
        if (truth.item && truth.item !== 'None') {
            const itemName = state.items.find(i => i.id === truth.item)?.name || truth.item;
            goodClues.push({ text: `The demon has ${itemName}`, isGood: true, relatedAttribute: { key: 'item', value: truth.item } });
        }

        // Bad Clue Pool
        const badCluePool: Clue[] = [];
        const worldOccs = new Set(allPeople.map(p => p.attributes.occupation));
        const worldPets = new Set(allPeople.map(p => p.attributes.pet));
        const worldColors = new Set(allPeople.map(p => p.attributes.color));
        const worldTowns = new Set(allPeople.map(p => p.attributes.townId));
        const worldItems = new Set(allPeople.map(p => p.attributes.item).filter(i => i && i !== 'None'));

        worldOccs.forEach(occ => {
            if (occ !== truth.occupation) badCluePool.push({ text: `The demon is not a ${occ}`, isGood: false, relatedAttribute: { key: 'occupation', value: occ } });
        });
        worldPets.forEach(pet => {
            if (pet !== truth.pet) badCluePool.push({ text: `The demon does not have a ${pet}`, isGood: false, relatedAttribute: { key: 'pet', value: pet } });
        });
        worldColors.forEach(col => {
            if (col !== truth.color) badCluePool.push({ text: `The demon does not like ${col}`, isGood: false, relatedAttribute: { key: 'color', value: col } });
        });
        worldTowns.forEach(tId => {
            if (tId !== truth.townId) {
                const tName = state.towns.find(t => t.id === tId)?.name || "Unknown Town";
                badCluePool.push({ text: `The demon is not in ${tName}`, isGood: false, relatedAttribute: { key: 'townId', value: tId } });
            }
        });
        worldItems.forEach(itemId => {
            if (itemId !== truth.item) {
                const iName = state.items.find(i => i.id === itemId)?.name || itemId;
                badCluePool.push({ text: `The demon does not have ${iName}`, isGood: false, relatedAttribute: { key: 'item', value: itemId } });
            }
        });

        // Distribute
        const innocents = allPeople.filter(p => !p.isDemon && !p.isMinion);
        const minions = allPeople.filter(p => p.isMinion);
        DemonLogic.shuffle(badCluePool);
        DemonLogic.shuffle(goodClues);

        // Group innocents by town so we can guarantee spread
        const innocentsByTown = new Map<string, Person[]>();
        for (const p of innocents) {
            if (!innocentsByTown.has(p.attributes.townId)) {
                innocentsByTown.set(p.attributes.townId, []);
            }
            innocentsByTown.get(p.attributes.townId)!.push(p);
        }
        const townIds = Array.from(innocentsByTown.keys());
        DemonLogic.shuffle(townIds);

        // First pass: one good-clue holder per town (as many towns as there are good clues)
        const goodClueHolders = new Set<string>();
        for (let i = 0; i < Math.min(townIds.length, goodClues.length); i++) {
            const pool = innocentsByTown.get(townIds[i])!;
            const holder = pool[Math.floor(Math.random() * pool.length)];
            holder.clues.good = goodClues[i];
            goodClueHolders.add(holder.id);
        }

        // Second pass: scatter leftover good clues among remaining innocents
        let goodClueIdx = Math.min(townIds.length, goodClues.length);
        if (goodClueIdx < goodClues.length) {
            const unassigned = innocents.filter(p => !goodClueHolders.has(p.id));
            DemonLogic.shuffle(unassigned);
            for (const p of unassigned) {
                if (goodClueIdx >= goodClues.length) break;
                p.clues.good = goodClues[goodClueIdx++];
                goodClueHolders.add(p.id);
            }
        }

        // Third pass: bad clues for everyone without a good clue
        let badClueIdx = 0;
        for (const p of innocents) {
            if (!goodClueHolders.has(p.id)) {
                if (badClueIdx < badCluePool.length) p.clues.bad = badCluePool[badClueIdx++];
                else if (badCluePool.length > 0) p.clues.bad = badCluePool[Math.floor(Math.random() * badCluePool.length)];
            }
        }

        // Demon & Minion Lies
        const liars = [demon, ...minions];
        liars.forEach(liar => {
            const lieTarget = Math.random();
            let lieText = "", lieAttr: any = undefined;
            if (lieTarget < 0.25) { lieText = `The demon is not a ${demon.attributes.occupation}`; lieAttr = { key: 'occupation', value: demon.attributes.occupation || "" }; }
            else if (lieTarget < 0.5) { lieText = `The demon does not have a ${demon.attributes.pet}`; lieAttr = { key: 'pet', value: demon.attributes.pet || "" }; }
            else if (lieTarget < 0.75) { lieText = `The demon does not like ${demon.attributes.color}`; lieAttr = { key: 'color', value: demon.attributes.color || "" }; }
            else {
                const demonTownName = state.towns.find(t => t.id === demon.attributes.townId)?.name || "Unknown Town";
                lieText = `The demon is not in ${demonTownName}`; lieAttr = { key: 'townId', value: demon.attributes.townId || "" };
            }
            liar.clues.bad = { text: lieText, isGood: false, relatedAttribute: lieAttr };
        });
    }

    private static generateTasks(people: Person[], items: Item[], towns: Town[]) {
        const taskPool: GameTask[] = [];

        // 1. Kill Tasks (1 per monster type)
        gameConfig.enemies.forEach(m => {
            taskPool.push({
                id: `task_kill_${m.id}`,
                type: TaskType.KILL,
                targetId: m.id,
                targetName: m.name.toUpperCase(),
                amount: m.toKill,
                currentAmount: 0,
                description: `Kill ${m.toKill} ${m.name}s`,
                reward: 'CLUE',
                giverId: '', // Assigned later
                isCompleted: false
            });
        });

        // 2. Find Tasks (Pool of unique attributes in the world)
        // Find Occupation
        const uniqueOccs = Array.from(new Set(people.map(p => p.attributes.occupation)));
        uniqueOccs.forEach(occ => {
            taskPool.push({
                id: `task_find_occ_${occ}`,
                type: TaskType.FIND_PERSON,
                targetId: occ,
                targetName: occ,
                amount: 1,
                currentAmount: 0,
                description: `Find a ${occ}`,
                reward: 'CLUE',
                giverId: '',
                isCompleted: false
            });
        });

        // Find Pet
        const uniquePets = Array.from(new Set(people.map(p => p.attributes.pet)));
        uniquePets.forEach(pet => {
            taskPool.push({
                id: `task_find_pet_${pet}`,
                type: TaskType.FIND_PERSON,
                targetId: pet,
                targetName: pet,
                amount: 1,
                currentAmount: 0,
                description: `Find someone with a ${pet}`,
                reward: 'CLUE',
                giverId: '',
                isCompleted: false
            });
        });

        // Find Color
        const uniqueColors = Array.from(new Set(people.map(p => p.attributes.color)));
        uniqueColors.forEach(col => {
            taskPool.push({
                id: `task_find_col_${col}`,
                type: TaskType.FIND_PERSON,
                targetId: col,
                targetName: col,
                amount: 1,
                currentAmount: 0,
                description: `Find someone who likes ${col}`,
                reward: 'CLUE',
                giverId: '',
                isCompleted: false
            });
        });

        // Find Item (1 per Item)
        items.forEach(item => {
            taskPool.push({
                id: `task_find_item_${item.id}`,
                type: TaskType.FIND_ITEM,
                targetId: item.id,
                targetName: item.name,
                amount: 1,
                currentAmount: 0,
                description: `Find someone with ${item.name}`,
                reward: 'CLUE',
                giverId: '',
                isCompleted: false
            });
        });

        // Escort Tasks (1 per Town)
        towns.forEach(town => {
            // Target is ANY OTHER town
            const otherTowns = towns.filter(t => t.id !== town.id);
            if (otherTowns.length > 0) {
                const targetTown = otherTowns[Math.floor(Math.random() * otherTowns.length)];

                // We create a generic "Escort" task template for this town
                // It will be assigned to a person IN this town effectively by the shuffler
                // But wait, the shuffler assigns tasks randomly to ANYONE.
                // If a person in Town A gets "Escort to Town B", that works.
                // If a person in Town A gets "Escort to Town A"... that's bad.
                // We need to handle this in conflict check.

                taskPool.push({
                    id: `task_escort_from_${town.id}_to_${targetTown.id}`,
                    type: TaskType.ESCORT,
                    targetId: targetTown.id,
                    targetName: targetTown.name,
                    amount: 1,
                    currentAmount: 0,
                    description: `Escort me to ${targetTown.name}`,
                    reward: 'CLUE',
                    giverId: '',
                    isCompleted: false
                });
            }
        });

        // 3. Assign kill tasks to good-clue holders, then distribute the rest
        const killTasks = taskPool.filter(t => t.type === TaskType.KILL);
        const escortTasks = taskPool.filter(t => t.type === TaskType.ESCORT);
        const otherTasks = taskPool.filter(t => t.type !== TaskType.KILL && t.type !== TaskType.ESCORT);
        this.shuffle(killTasks);
        this.shuffle(escortTasks);
        this.shuffle(otherTasks);

        const goodClueHolders = people.filter(p => p.clues?.good);
        const assigned = new Set<string>();

        // First pass: give every Merchant an escort task (Merchants are travel traders — escort fits their role)
        // Retry shuffle until a valid conflict-free assignment exists for all merchants.
        const merchants = people.filter(p => p.attributes.occupation === 'Merchant');
        let merchantAssignments: Array<[Person, GameTask]> | null = null;
        for (let attempt = 0; attempt < 20; attempt++) {
            this.shuffle(escortTasks);
            const usedTasks = new Set<GameTask>();
            const tempAssignments: Array<[Person, GameTask]> = [];
            let allAssigned = true;
            for (const merchant of merchants) {
                const task = escortTasks.find(t => !usedTasks.has(t) && t.targetId !== merchant.attributes.townId);
                if (!task) { allAssigned = false; break; }
                tempAssignments.push([merchant, task]);
                usedTasks.add(task);
            }
            if (allAssigned) { merchantAssignments = tempAssignments; break; }
        }
        if (merchantAssignments) {
            for (const [merchant, task] of merchantAssignments) {
                escortTasks.splice(escortTasks.indexOf(task), 1);
                merchant.task = task;
                merchant.task.giverId = merchant.id;
                merchant.task.reward = merchant.clues?.good ? 'CLUE' : 'ITEM';
                assigned.add(merchant.id);
            }
        }

        // Second pass: give every good-clue holder a kill task
        for (const p of goodClueHolders) {
            if (assigned.has(p.id)) continue; // Merchant already assigned
            if (killTasks.length === 0) break;
            p.task = killTasks.shift()!;
            p.task.giverId = p.id;
            p.task.reward = 'CLUE';
            assigned.add(p.id);
        }

        // General pool: leftover kill tasks + remaining escort tasks + all non-kill/non-escort tasks
        const generalPool = [...killTasks, ...escortTasks, ...otherTasks];
        this.shuffle(generalPool);

        // Second pass: assign remaining tasks to everyone not yet assigned
        const unassigned = people.filter(p => !assigned.has(p.id));
        for (const p of unassigned) {
            if (generalPool.length === 0) {
                const fallbackEnemy = gameConfig.enemies[0];
                p.task = {
                    id: `task_generic_${p.id}`,
                    type: TaskType.KILL,
                    targetId: fallbackEnemy.id,
                    targetName: fallbackEnemy.name.toUpperCase(),
                    amount: fallbackEnemy.toKill,
                    currentAmount: 0,
                    description: `Kill ${fallbackEnemy.toKill} ${fallbackEnemy.name}s`,
                    reward: 'ITEM',
                    giverId: p.id,
                    isCompleted: false
                };
                continue;
            }

            let attempts = 0;
            while (this.checkConflict(p, generalPool[0]) && attempts < 10 && generalPool.length > 1) {
                generalPool.push(generalPool.shift()!);
                attempts++;
            }

            p.task = generalPool.shift()!;
            p.task.giverId = p.id;
            p.task.reward = p.clues?.good ? 'CLUE' : 'ITEM';
        }
    }

    private static checkConflict(p: Person, task: GameTask): boolean {
        if (task.type === TaskType.FIND_PERSON) {
            if (task.targetId === p.attributes.occupation) return true;
            if (task.targetId === p.attributes.pet) return true;
            if (task.targetId === p.attributes.color) return true;
        }
        if (task.type === TaskType.FIND_ITEM) {
            if (task.targetId === p.attributes.item) return true;
        }
        if (task.type === TaskType.ESCORT) {
            // Don't escort to the town you are already in
            if (task.targetId === p.attributes.townId) return true;
        }
        return false;
    }

    private static shuffle(array: any[]) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }
}
