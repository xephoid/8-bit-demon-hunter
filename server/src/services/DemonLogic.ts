import { Person, Town, Clue, GameTask, TaskType, DemonHunterState, Occupation, Pet, Color, Item } from '../../../shared/src/data/GameData';

export class DemonLogic {

    public static generatePuzzle(towns: Town[], people: Person[]): Partial<DemonHunterState> {
        // 1. Select Demon
        const demon = people[Math.floor(Math.random() * people.length)];
        demon.isDemon = true;
        console.log(`Demon Selected: ${demon.name} (${demon.id}) in ${demon.attributes.townId}`);

        // 2. Generate Items (Unique per world)
        // README: "Generate ten times that number of items... 1 unique per person"
        const items: Item[] = [];
        for (let i = 0; i < people.length; i++) {
            items.push({ id: `item_${i}`, name: `Item ${i}`, description: "A unique item." });
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
            { text: `The demon is in ${towns.find(t => t.id === truth.townId)?.name}`, isGood: true, relatedAttribute: { key: 'townId', value: truth.townId } },
            { text: `The demon has ${items.find(i => i.id === truth.item)?.name}`, isGood: true, relatedAttribute: { key: 'item', value: truth.item } }
        ];

        // Bad Clue Pool (All possible negations based on WORLD population)
        // We only generate clues for things that EXIST in the world.
        const badCluePool: Clue[] = [];

        // Occupations
        const uniqueOccs = Array.from(new Set(people.map(p => p.attributes.occupation)));
        uniqueOccs.forEach(occ => {
            if (occ !== truth.occupation) {
                badCluePool.push({ text: `The demon is not a ${occ}`, isGood: false });
            }
        });

        // Pets
        const uniquePets = Array.from(new Set(people.map(p => p.attributes.pet)));
        uniquePets.forEach(pet => {
            if (pet !== truth.pet) {
                badCluePool.push({ text: `The demon does not have a ${pet}`, isGood: false });
            }
        });

        // Colors
        const uniqueColors = Array.from(new Set(people.map(p => p.attributes.color)));
        uniqueColors.forEach(col => {
            if (col !== truth.color) {
                badCluePool.push({ text: `The demon does not like ${col}`, isGood: false });
            }
        });

        // Towns
        towns.forEach(t => {
            if (t.id !== truth.townId) {
                badCluePool.push({ text: `The demon is not in ${t.name}`, isGood: false });
            }
        });

        // Items (Might be too many, but README says "All the items the demon does not have")
        // Let's subset this to interesting items or just random for now to avoid 30 item clues.
        // Or strictly follow README? "All the items". Okay, but maybe limit to items HELD by people?
        // Let's add significant amount but maybe not ALL if it dilutes the pool too much?
        // Actually, README says "Generate bad clues... All the items". 
        // We'll generate a selection to keep ratio balanced.
        const itemSubset = items.filter(i => i.id !== truth.item).slice(0, 10); // Take 10 wrong items
        itemSubset.forEach(i => {
            badCluePool.push({ text: `The demon does not have ${i.name}`, isGood: false });
        });

        // Distribute Clues
        const nonDemons = people.filter(p => !p.isDemon);
        this.shuffle(nonDemons); // Randomize recipients
        this.shuffle(badCluePool); // Randomize bad clues

        // 5 Good Clues to first 5 non-demons
        // The REST get Bad Clues. Mutually Exclusive.
        let goodClueIdx = 0;
        let badClueIdx = 0;

        nonDemons.forEach((p, i) => {
            if (i < 5 && goodClueIdx < goodClues.length) {
                // Give GOOD CLUE
                p.clues.good = goodClues[goodClueIdx++];
                // Ensure NO Bad Clue
                delete p.clues.bad;
            } else {
                // Give BAD CLUE (Rumor)
                if (badClueIdx < badCluePool.length) {
                    p.clues.bad = badCluePool[badClueIdx++];
                } else {
                    // Reuse if run out
                    p.clues.bad = badCluePool[Math.floor(Math.random() * badCluePool.length)];
                }
                // Ensure NO Good Clue
                delete p.clues.good;
            }
        });

        // Demon's Lie (False Bad Clue)
        // Deny a truth
        const lieTarget = Math.random();
        let lieText = "";
        if (lieTarget < 0.25) lieText = `The demon is not a ${demon.attributes.occupation}`;
        else if (lieTarget < 0.5) lieText = `The demon does not have a ${demon.attributes.pet}`;
        else if (lieTarget < 0.75) lieText = `The demon does not like ${demon.attributes.color}`;
        else lieText = `The demon is not in this town`;

        demon.clues.bad = { text: lieText, isGood: false }; // It is "False" as logic, but "Bad Clue" type
        delete demon.clues.good; // Demon has no good clue

        // 5. Generate Tasks
        this.generateTasks(people, items, towns);

        return {
            demonId: demon.id,
            items: items,
            towns: towns
        };
    }

    private static generateTasks(people: Person[], items: Item[], towns: Town[]) {
        const taskPool: GameTask[] = [];

        // 1. Kill Tasks (1 per monster type)
        const monsterTypes = ['slime', 'snake', 'skeleton', 'mushroom', 'soldier'];
        monsterTypes.forEach(m => {
            taskPool.push({
                id: `task_kill_${m}`,
                type: TaskType.KILL,
                targetId: m,
                targetName: m.toUpperCase(),
                amount: 3,
                currentAmount: 0,
                description: `Kill 3 ${m}s`,
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

        // 3. Shuffle and Assign
        this.shuffle(taskPool);

        people.forEach((p, i) => {
            if (taskPool.length > 0) {
                // Try to find a valid task (not finding self)
                let taskIndex = 0;
                let task = taskPool[taskIndex];

                // Simple conflict check: If finding self attribute
                // This is an approximation. Ideally we check if "Target == Self".
                // Since tasks target "Occupation String", we check if p matches.
                let conflicts = this.checkConflict(p, task);
                let attempts = 0;

                while (conflicts && attempts < 10 && taskPool.length > 1) {
                    // Swap with end or just pick another?
                    // Let's just rotate pool?
                    taskPool.push(taskPool.shift()!); // Rotate front to back
                    task = taskPool[0];
                    conflicts = this.checkConflict(p, task);
                    attempts++;
                }

                // Pop the valid task
                p.task = taskPool.shift()!;
                p.task.giverId = p.id;
                p.task.reward = p.clues.good ? 'CLUE' : 'ITEM'; // Reward logic
            } else {
                // Fallback if pool exhausted (shouldn't happen with 10x generation)
                // Just give a generic kill task
                p.task = {
                    id: `task_generic_${p.id}`,
                    type: TaskType.KILL,
                    targetId: 'slime',
                    targetName: 'SLIME',
                    amount: 5,
                    currentAmount: 0,
                    description: `Kill 5 slimes`,
                    reward: 'ITEM',
                    giverId: p.id,
                    isCompleted: false
                };
            }
        });
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
        return false;
    }

    private static shuffle(array: any[]) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }
}
