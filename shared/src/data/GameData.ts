export enum Occupation {
    Carpenter = 'Carpenter',
    Barber = 'Barber',
    Soldier = 'Soldier',
    Musician = 'Musician',
    Farmer = 'Farmer',
    Blacksmith = 'Blacksmith',
    Merchant = 'Merchant',
    Tailor = 'Tailor',
    Baker = 'Baker',
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
    relatedAttribute?: { key: keyof PersonAttributes, value: string };
}

export interface Person {
    id: string;
    name: string;
    sprite: string;
    attributes: PersonAttributes;
    isDemon: boolean;
    clues: {
        good: Clue;
        bad: Clue;
    };
    visualClue: string; // A lie if demon
    task: GameTask;
    hasMet: boolean; // Player has talked to them
    taskCompleted: boolean;
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

export interface DemonHunterState {
    demonId: string;
    knownClues: Clue[];
    activeTask: GameTask | null;
    towns: Town[];
    items: Item[]; // Global item registry for this run
    gameOver: boolean;
    gameWon: boolean;
}
