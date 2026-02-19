import type { Person, GameTask } from '../../../shared/src/data/GameData';

export class DialogueUI {
    private container: HTMLElement;
    private nameEl: HTMLElement;
    private textEl: HTMLElement;
    private optionsEl: HTMLElement;

    // Callbacks
    public onAcceptTask: ((task: GameTask) => void) | null = null;
    public onCompleteTask: ((person: Person) => void) | null = null;
    public onClose: (() => void) | null = null;

    constructor() {
        this.container = document.createElement('div');
        this.container.id = 'dialogue-ui';
        Object.assign(this.container.style, {
            position: 'absolute',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '600px',
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            border: '2px solid white',
            padding: '20px',
            color: 'white',
            fontFamily: '"Press Start 2P", monospace',
            display: 'none',
            flexDirection: 'column',
            gap: '15px',
            zIndex: '100',
            boxShadow: '0 0 10px rgba(0,0,0,0.5)'
        });
        document.body.appendChild(this.container);

        this.nameEl = document.createElement('div');
        this.nameEl.style.color = '#ffd700'; // Gold
        this.nameEl.style.marginBottom = '5px';
        this.container.appendChild(this.nameEl);

        this.textEl = document.createElement('div');
        this.textEl.style.lineHeight = '1.5';
        this.container.appendChild(this.textEl);

        this.optionsEl = document.createElement('div');
        this.optionsEl.style.display = 'flex';
        this.optionsEl.style.gap = '10px';
        this.optionsEl.style.marginTop = '10px';
        this.container.appendChild(this.optionsEl);
    }

    public isOpen: boolean = false;

    public show(person: Person, activeTask: GameTask | null) {
        this.container.style.display = 'flex';
        this.isOpen = true; // Set Open State
        this.nameEl.innerText = `${person.name} the ${person.attributes.occupation}`;
        this.optionsEl.innerHTML = '';
        this.textEl.innerHTML = ''; // Clear text

        const addButton = (text: string, onClick: () => void) => this.addButton(text, onClick);

        // Logic flow
        // 1. If person gave the active task -> Check status
        if (activeTask && activeTask.giverId === person.id) {
            if (activeTask.isCompleted) {
                this.textEl.innerText = "You did it! You are a true hero.";
                addButton("Complete Task", () => {
                    if (this.onCompleteTask) this.onCompleteTask(person);
                    this.textEl.innerText = `Here is what I know: "${person.clues.good.text}"`;
                    this.optionsEl.innerHTML = ''; // Clear buttons
                    addButton("Goodbye", () => this.hide());
                });
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
                    this.textEl.innerText = `Can you help me? ${taskDesc}`;
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
