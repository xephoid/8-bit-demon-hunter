import type { Person, GameTask } from '../../../shared/src/data/GameData';

export class DialogueUI {
    private container: HTMLElement;
    private nameEl: HTMLElement;
    private infoEl: HTMLElement; // New element for attributes
    private textEl: HTMLElement;
    private optionsEl: HTMLElement;

    // Callbacks
    public onAcceptTask: ((task: GameTask) => void) | null = null;
    public onCompleteTask: ((person: Person, rewardType: 'ITEM' | 'CLUE') => void) | null = null;
    public onClose: (() => void) | null = null;

    constructor() {
        this.container = document.createElement('div');
        this.container.id = 'dialogue-ui';
        Object.assign(this.container.style, {
            position: 'absolute',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '800px', // Increased width for 2 columns
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            border: '2px solid white',
            padding: '20px',
            color: 'white',
            fontFamily: '"Press Start 2P", monospace',
            display: 'none',
            flexDirection: 'row', // Horizontal layout
            gap: '20px',
            zIndex: '100',
            boxShadow: '0 0 10px rgba(0,0,0,0.5)'
        });
        document.body.appendChild(this.container);

        // --- Left Column (Interaction) ---
        const leftCol = document.createElement('div');
        Object.assign(leftCol.style, {
            display: 'flex',
            flexDirection: 'column',
            flex: '1',
            gap: '15px'
        });
        this.container.appendChild(leftCol);

        this.nameEl = document.createElement('div');
        this.nameEl.style.color = '#ffd700'; // Gold
        this.nameEl.style.marginBottom = '5px';
        leftCol.appendChild(this.nameEl);

        this.textEl = document.createElement('div');
        this.textEl.style.lineHeight = '1.5';
        leftCol.appendChild(this.textEl);

        this.optionsEl = document.createElement('div');
        this.optionsEl.style.display = 'flex';
        this.optionsEl.style.gap = '10px';
        this.optionsEl.style.marginTop = 'auto'; // Push to bottom
        leftCol.appendChild(this.optionsEl);

        // --- Right Column (Attributes) ---
        const rightCol = document.createElement('div');
        Object.assign(rightCol.style, {
            width: '250px',
            borderLeft: '1px solid #444',
            paddingLeft: '20px',
            display: 'flex',
            flexDirection: 'column',
            fontSize: '0.8em',
            color: '#ccc'
        });
        this.container.appendChild(rightCol);

        this.infoEl = document.createElement('div');
        this.infoEl.style.whiteSpace = 'pre-wrap';
        rightCol.appendChild(this.infoEl);
    }

    public isOpen: boolean = false;

    public show(person: Person, activeTask: GameTask | null) {
        this.container.style.display = 'flex';
        this.isOpen = true; // Set Open State
        this.nameEl.innerText = `${person.name} the ${person.attributes.occupation}`;

        // Populate Info
        const infoText = `Attributes:
Pet: ${person.attributes.pet} | Color: ${person.attributes.color} | Item: ${person.attributes.item || "None"}
Town: ${person.attributes.townId}

Rumor: "${person.clues.bad.text}"`;
        this.infoEl.innerText = infoText;

        this.optionsEl.innerHTML = '';
        this.textEl.innerHTML = ''; // Clear text

        const addButton = (text: string, onClick: () => void) => this.addButton(text, onClick);

        // Logic flow
        let foundTarget = false;

        // 0. Check if this person IS the target of a FIND task
        if (activeTask && !activeTask.isCompleted) {
            if (activeTask.type === 'FIND_PERSON' || activeTask.type === 'FIND_ITEM') {
                // Check match
                let match = false;
                if (activeTask.targetId === person.id) match = true; // Direct ID match
                if (activeTask.targetId === person.attributes.occupation) match = true; // Occupation match
                if (activeTask.targetId === person.attributes.pet) match = true; // Pet match
                if (activeTask.targetId === person.attributes.color) match = true; // Color match
                if (activeTask.type === 'FIND_ITEM' && activeTask.targetId === person.attributes.item) match = true; // Item match

                if (match) {
                    foundTarget = true;
                    this.textEl.innerText = `You found me! I am indeed the one you are looking for (${activeTask.description}).`;
                    addButton("I found you!", () => {
                        // We need to mark task as complete.
                        // We don't have direct access to set task completed here, but we can assume the callback handles it?
                        // Actually, we should call a specific callback or reuse onAccept/onComplete?
                        // onCompleteTask is currently for the GIVER.
                        // We need a way to tell the system "Task Progressed/Completed".
                        // For "Find" tasks, finding them IS completion.

                        // Hack: Mutate activeTask here? Or emit event?
                        // Ideally we'd have a callback onFindTarget(task, person)
                        // For now, let's just use a custom event or update the task directly if it's passed by reference (it is).
                        activeTask.currentAmount = activeTask.amount;
                        activeTask.isCompleted = true;

                        // Refresh UI to show "Task Completed" state (which is usually handled by Giver)
                        // But Find tasks might be "Return to Giver" after finding?
                        // README: "Find a person ... and tell them about it" (implies return to person?)
                        // "Find a person ... and return to the person"

                        // So we just update progress here. User must still return to giver.
                        this.textEl.innerText = "Thanks for finding me. Please let the quest giver know.";
                        this.optionsEl.innerHTML = '';
                        addButton("Goodbye", () => this.hide());
                    });

                    return; // Exit other logic
                }
            }
        }

        // 1. If person gave the active task -> Check status
        if (activeTask && activeTask.giverId === person.id) {
            if (activeTask.isCompleted) {
                this.textEl.innerText = "You did it! You are a true hero.";
                this.textEl.innerText = "You did it! You are a true hero.";

                // Reward Choice Logic
                const hasGoodClue = person.clues && person.clues.good;

                if (hasGoodClue) {
                    this.textEl.innerText += "\n\nI can give you a secret CLUE about the demon, or I can give you my ITEM.";

                    addButton("Get Clue", () => {
                        if (this.onCompleteTask) this.onCompleteTask(person, 'CLUE');
                        this.textEl.innerText = `Here is what I know: "${person.clues.good.text}"`;
                        this.optionsEl.innerHTML = '';
                        addButton("Goodbye", () => this.hide());
                    });

                    addButton("Get Item", () => {
                        if (this.onCompleteTask) this.onCompleteTask(person, 'ITEM');
                        this.textEl.innerText = `Here, take my ${person.attributes.item || "Item"}. It may help you finding the demon.`;
                        this.optionsEl.innerHTML = '';
                        addButton("Goodbye", () => this.hide());
                    });

                } else {
                    // Bad Clue (Rumor) Logic - Reward is Item
                    this.textEl.innerText += `\n\nHere, take my ${person.attributes.item || "Item"}.`;

                    addButton("Take Item", () => {
                        if (this.onCompleteTask) this.onCompleteTask(person, 'ITEM');
                        this.optionsEl.innerHTML = '';
                        addButton("Goodbye", () => this.hide());
                    });
                }
            } else {
                this.textEl.innerText = `Please hurry! I need you to ${activeTask.description}. (${activeTask.currentAmount}/${activeTask.amount})`;
                addButton("I'm on it", () => this.hide());
            }
        }
        // 2. If player has NO active task OR has a task from someone else (Switching)
        else {
            if (person.taskCompleted) {
                this.textEl.innerText = "Thanks again for your help earlier!";
                addButton("Goodbye", () => this.hide());
            } else {
                // Task Offer
                const taskDesc = person.task.description;

                if (activeTask) {
                    this.textEl.innerText = `I see you are busy with another task, but could you help me instead?\n\nMy Request: ${taskDesc}`;
                    addButton("Replace Current Task", () => {
                        if (this.onAcceptTask) this.onAcceptTask(person.task);
                        this.hide();
                    });
                } else {
                    const hasGoodClue = person.clues && person.clues.good;
                    if (hasGoodClue) {
                        this.textEl.innerText = `If you complete my task I will tell you what I know.\n\nMy Request: ${taskDesc}`;
                    } else {
                        this.textEl.innerText = `Can you help me? ${taskDesc}`;
                    }

                    addButton("Accept Task", () => {
                        if (this.onAcceptTask) this.onAcceptTask(person.task);
                        this.hide();
                    });
                }

                addButton("No thanks", () => this.hide());
            }
        }
    }

    private addButton(text: string, onClick: () => void) {
        const btn = document.createElement('button');
        btn.innerText = text;
        Object.assign(btn.style, {
            padding: '10px 20px',
            backgroundColor: '#333',
            color: 'white',
            border: '1px solid #666',
            cursor: 'pointer',
            fontFamily: 'inherit'
        });

        btn.onmouseover = () => btn.style.backgroundColor = '#555';
        btn.onmouseout = () => btn.style.backgroundColor = '#333';
        btn.onclick = onClick;

        this.optionsEl.appendChild(btn);
    }

    public hide() {
        this.container.style.display = 'none';
        this.isOpen = false;
        if (this.onClose) this.onClose();
    }
}
