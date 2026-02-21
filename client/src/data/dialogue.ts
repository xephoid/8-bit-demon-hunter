// Centralized dialogue and NPC power configuration.
// Edit strings here to change all in-game dialogue text.

export const OccupationConfig: Record<string, { powerLabel: string; powerOffer: string }> = {
    Farmer: { powerLabel: 'Check Demon Encounter', powerOffer: "I can tell you if you have already met the demon." },
    Musician: { powerLabel: 'Count Town Minions', powerOffer: "I can tell you how many minions are in this town." },
    Barber: { powerLabel: 'Meet Someone Elsewhere', powerOffer: "I can introduce you to someone from another town." },
    Tailor: { powerLabel: 'Check for Liars', powerOffer: "I can tell you if there are any liars in this town." },
    Mayor: { powerLabel: 'Meet Everyone Here', powerOffer: "I can introduce you to everyone in town." },
    Merchant: { powerLabel: 'Meet Some People', powerOffer: "I can introduce you to some people I know." },
    Soldier: { powerLabel: 'Train (+20 XP)', powerOffer: "I can give you combat training worth 20 XP." },
    Blacksmith: { powerLabel: 'Improve a Stat', powerOffer: "I can improve one of your abilities." },
    Carpenter: { powerLabel: 'Get a Location Clue', powerOffer: "I know a place where the demon is not." },
    Baker: { powerLabel: 'Identify an Innocent', powerOffer: "I can name someone in this town who is not the demon." },
};

export const Dialogue = {
    // Attribute info panel (right column of dialogue)
    attributePanel: (pet: string, color: string, item: string, town: string, clue: string) =>
        `Attributes:\nPet: ${pet}\nColor: ${color}\nItem: ${item}\nTown: ${town}\n\nRumor: "${clue}"`,
    noClue: "I know the truth!",

    // Find-target flow
    foundTarget: (taskDesc: string) => `You found me! I am indeed the one you are looking for (${taskDesc}).`,
    foundConfirmed: "Thanks for finding me. Please let the quest giver know.",

    // Task in-progress reminder
    taskInProgress: (desc: string, current: number, amount: number) =>
        `Please hurry! I need you to ${desc}. (${current}/${amount})`,

    // Task-offer text (shown when player first talks to NPC)
    taskOfferBadClue: (powerOffer: string, taskDesc: string) =>
        `${powerOffer}\n\nMy Request: ${taskDesc}`,
    taskOfferGoodClue: (powerOffer: string, taskDesc: string) =>
        `${powerOffer} I also know a demon secret.\n\nMy Request: ${taskDesc}`,
    taskOfferBusy: (powerOffer: string, taskDesc: string) =>
        `I see you are busy. Could you help me instead?\n\n${powerOffer}\n\nMy Request: ${taskDesc}`,
    taskOfferBusyGoodClue: (powerOffer: string, taskDesc: string) =>
        `I see you are busy. Could you help me instead?\n\n${powerOffer} I also know a demon secret.\n\nMy Request: ${taskDesc}`,

    // Task-complete reward flows
    taskCompleteHeader: "You did it! You are a true hero.",
    taskCompleteGoodClueChoice: "Choose your reward: a demon secret, or my special ability.",
    taskCompleteBadClue: "Let me use my ability.",
    revealClue: (clueText: string) => `Here is what I know: "${clueText}"`,
    powerFallback: "Power activated!",

    // Repeat visitor
    alreadyHelped: "Thanks again for your help earlier!",

    // Button labels
    buttons: {
        iFoundYou: "I found you!",
        goodbye: "Goodbye",
        getClue: "Get Clue",
        replaceCurrent: "Replace Current Task",
        acceptTask: "Accept Task",
        noThanks: "No thanks",
        imOnIt: "I'm on it",
    },

    // Per-occupation power result text (returned by triggerOccupationPower in main.ts)
    powers: {
        minionReveal: "Ah, you caught me, but you will not find my master!",
        farmerMet: "You have met the demon.",
        farmerNotMet: "You have not met the demon yet.",
        musicianMinions: (count: number) => `There are ${count} minion${count === 1 ? '' : 's'} in this town.`,
        introduceMultiple: (count: number) => `I have introduced you to ${count} people.`,
        tailorLiars: (townName: string) => `Some people in ${townName} are lying!`,
        tailorNoLiars: (townName: string) => `No one in ${townName} is lying.`,
        mayorIntroduced: "I have introduced you to everyone in town.",
        introduceOneFromTown: (name: string, town: string) => `Let me introduce you to ${name} from ${town}.`,
        introduceOneNone: "I have no one new to introduce you to.",
        soldierXP: "Nice training session!",
        blacksmithUpgrade: "Hope this helps you in your quest.",
        carpenterClue: (townName: string) => `The demon is not in ${townName}.`,
        carpenterNone: "I have no new location clues for you.",
        bakerInnocent: (name: string) => `${name} is not the demon.`,
        bakerNone: "I have no information for you.",
        fallback: "Power activated!",
    },
};
