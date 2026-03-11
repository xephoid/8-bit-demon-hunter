export enum Occupation {
    Carpenter = 'Carpenter',
    Barber = 'Barber',
    Soldier = 'Soldier',
    Musician = 'Musician',
    Farmer = 'Farmer',
    Blacksmith = 'Blacksmith',
    Merchant = 'Merchant',
    Tailor = 'Tailor',
    Locksmith = 'Locksmith',
    Mayor = 'Mayor'
}

export enum Pet {
    Dog = 'Dog',
    Cat = 'Cat',
    Fish = 'Fish',
    Bird = 'Bird',
    Snake = 'Snake',
    Lizard = 'Lizard',
    Hamster = 'Hamster',
    Rabbit = 'Rabbit',
    Turtle = 'Turtle',
    Ferret = 'Ferret',
    Horse = 'Horse',
    Cow = 'Cow',
    Sheep = 'Sheep',
    Pig = 'Pig',
    Chicken = 'Chicken'
}

export enum Color {
    Red = 'Red',
    Blue = 'Blue',
    Green = 'Green',
    Yellow = 'Yellow',
    Purple = 'Purple',
    Pink = 'Pink'
}

export interface Item {
    id: string;
    name: string;
    description: string;
}

export enum TaskType {
    KILL = 'KILL',
    FIND_PERSON = 'FIND_PERSON',
    FIND_ITEM = 'FIND_ITEM',
    ESCORT = 'ESCORT'
}

export interface GameTask {
    id: string;
    type: TaskType;
    targetId: string; // itemId, personId, or monsterType
    targetName: string; // for display
    amount: number;
    currentAmount: number;
    description: string;
    reward: 'ITEM' | 'CLUE';
    giverId: string; // personId who gave the task
    isCompleted: boolean;
}

export interface PersonAttributes {
    occupation: Occupation;
    pet: Pet;
    color: Color;
    item: string; // itemId
    townId: string;
}

export interface Clue {
    text: string;
    isGood: boolean; // true = constraint (e.g. "Demon is a Baker"), false = negation (e.g. "Demon is NOT a Baker")
    isSpecial?: boolean; // true = occupation power clue, shown in blue in tracker
    relatedAttribute?: { key: keyof PersonAttributes, value: string };
}

export interface Person {
    id: string;
    name: string;
    sprite: string;
    attributes: PersonAttributes;
    isDemon: boolean;
    isMinion?: boolean;
    clues: {
        good?: Clue;
        bad?: Clue;
    };
    visualClue: string; // A lie if demon
    task: GameTask;
    hasMet: boolean; // Player has talked to them
    taskCompleted: boolean;
    tip?: string; // game tip (starting town) or lore (all other towns)
}

export interface Town {
    id: string;
    name: string;
    x: number; // World coordinates
    y: number;
    width: number;
    height: number;
    people: Person[];
}

// Resource types — plain object to avoid erasableSyntaxOnly enum errors
export const ResourceType = {
    PlantFiber:  'plant_fiber',
    Wood:        'wood',
    DemonPowder: 'demon_powder',
    DemonIchor:  'demon_ichor',
    IronOre:     'iron_ore',
    Gold:        'gold',
} as const;
export type ResourceType = typeof ResourceType[keyof typeof ResourceType];

export const RESOURCE_BASE_VALUE: Record<string, number> = {
    demon_powder: 1,
    plant_fiber:  2,
    wood:         3,
    demon_ichor:  4,
    iron_ore:     5,
    gold:         6,
};

export const RESOURCE_DISPLAY_NAME: Record<string, string> = {
    plant_fiber:  'Plant Fiber',
    wood:         'Wood',
    demon_powder: 'Demon Powder',
    demon_ichor:  'Demon Ichor',
    iron_ore:     'Iron Ore',
    gold:         'Gold',
};

export const TEMPLE_ENEMY_TYPES: string[] = ['bee', 'man_eater_flower', 'arachne', 'eyeball', 'fire_skull'];

export interface DemonHunterState {
    demonId: string;
    knownClues: Clue[];
    activeTask: GameTask | null;
    towns: Town[];
    items: Item[]; // Global item registry for this run
    gameOver: boolean;
    gameWon: boolean;
}
