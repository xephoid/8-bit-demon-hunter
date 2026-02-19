import { Person, Town, Clue, GameTask, TaskType, DemonHunterState, Occupation, Pet, Color, Item } from '../../../shared/src/data/GameData';

export class DemonLogic {

    public static generatePuzzle(towns: Town[], people: Person[]): Partial<DemonHunterState> {
        // 1. Select Demon
        const demon = people[Math.floor(Math.random() * people.length)];
        demon.isDemon = true;
        console.log(`Demon Selected: ${demon.name} (${demon.id})`);

        // 2. Generate Items (Unique per world)
        const items: Item[] = [];
        for (let i = 0; i < people.length * 2; i++) {
            items.push({ id: `item_${i}`, name: `Item ${i}`, description: "A generic item." });
        }

        // 3. Assign Attributes (if not already done fully)
        // (Assuming People already have occupation, but need randomized Pet/Color/Item)
        const pets = Object.values(Pet);
        const colors = Object.values(Color);

        people.forEach((p, index) => {
            p.attributes.pet = pets[Math.floor(Math.random() * pets.length)];
            p.attributes.color = colors[Math.floor(Math.random() * colors.length)];
            p.attributes.item = items[index % items.length].id; // Unique-ish
        });

        // 4. Generate Clues
        // Demon has 5 True Attributes.
        // It gives 1 LIE (False Good Clue).
        // It gives BAD clues (Negations) otherwise? 
        // "The demon always gives a bad clue that is wrong." -> "Bad clue" usually means "Demon is NOT X".
        // If it's a "Wrong Bad Clue", does that mean "Demon IS X"? 
        // README: "The demon's clue is a lie. It contradicts other clues. The demon always gives a bad clue that is wrong."
        // Wait, "Bad Clue" definition in README: "The demon is not a Carpenter".
        // If Demon IS a Carpenter, and says "The demon is not a Carpenter", that is a lie.
        // So Demon says a "Bad Clue" (structure) which is False.

        // Good Clue: "The demon is a Carpenter".
        // Bad Clue: "The demon is NOT a Carpenter".

        // Let's generate the Truth first.
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
            // Item clue is tricky as items are unique
            { text: `The demon has ${items.find(i => i.id === truth.item)?.name}`, isGood: true, relatedAttribute: { key: 'item', value: truth.item } }
        ];

        // Assign Clues to People
        people.forEach(p => {
            if (p.isDemon) {
                // Demon Lie: "The demon always gives a bad clue that is wrong."
                // i.e. "The demon is not [Attributes.Occupation]" (where Occupation IS correct)
                // or "The demon is not in [Attributes.TownId]" (where TownId IS correct)

                // Pick one attribute to lie about
                const lieTarget = Math.random();
                let lieText = "";
                if (lieTarget < 0.25) lieText = `The demon is not a ${demon.attributes.occupation}`;
                else if (lieTarget < 0.5) lieText = `The demon does not have a ${demon.attributes.pet}`;
                else if (lieTarget < 0.75) lieText = `The demon does not like ${demon.attributes.color}`;
                else lieText = `The demon is not in this town`;

                p.clues.bad = { text: lieText, isGood: false };
                // Demon gives NO good clue? "Only 5 good clues exist".
                // We'll assign Good/Bad later based on "Task Completion".
                // But the Demon doesn't HAVE a good clue? 
                // "If you get the good clue you can't take their item. If you take the demon's item the person who has the clue about the demon's item will say the demon has nothing."
                // Implies Demon HAS an item.
            } else {
                // Normal Person
                // Assign a RANDOM Bad Clue (True Statement)
                // e.g. "The demon is not [Something Demon is NOT]"

                // Generate a Random Bad Clue
                // Pick an occupation the demon is NOT
                let fakeOcc = Object.values(Occupation)[Math.floor(Math.random() * 10)];
                while (fakeOcc === truth.occupation) fakeOcc = Object.values(Occupation)[Math.floor(Math.random() * 10)];

                p.clues.bad = { text: `The demon is not a ${fakeOcc}`, isGood: false };
            }
        });

        // Distribute the 5 Good Clues to 5 random non-demons
        const nonDemons = people.filter(p => !p.isDemon);
        const clueHolders: Person[] = [];
        // Shuffle nonDemons
        for (let i = nonDemons.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [nonDemons[i], nonDemons[j]] = [nonDemons[j], nonDemons[i]];
        }

        for (let i = 0; i < 5; i++) {
            if (i < nonDemons.length) {
                nonDemons[i].clues.good = goodClues[i];
                clueHolders.push(nonDemons[i]);
            }
        }

        // 5. Generate Tasks
        people.forEach(p => {
            // Placeholder Task
            p.task = {
                id: `task_${p.id}`,
                type: TaskType.KILL,
                targetId: 'slime',
                targetName: 'Slime',
                amount: 3,
                currentAmount: 0,
                description: "Kill 3 Slimes",
                reward: p.clues.good ? 'CLUE' : 'ITEM', // If they have a good clue, reward can be clue
                giverId: p.id,
                isCompleted: false
            };
        });

        return {
            demonId: demon.id,
            items: items,
            towns: towns
        };
    }
}
