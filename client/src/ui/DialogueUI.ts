import type { Person, GameTask } from '../../../shared/src/data/GameData';
import { OccupationConfig, Dialogue } from '../data/dialogue';

export class DialogueUI {
    private container: HTMLElement;
    private nameEl: HTMLElement;
    private infoEl: HTMLElement;
    private tipEl: HTMLElement;
    private textEl: HTMLElement;
    private optionsEl: HTMLElement;

    // Callbacks
    public onAcceptTask: ((task: GameTask) => void) | null = null;
    public onCompleteTask: ((person: Person, rewardType: 'CLUE' | 'POWER') => string | void) | null = null;
    public onTaskCompleted: (() => void) | null = null;
    public onClose: (() => void) | null = null;

    constructor() {
        this.container = document.createElement('div');
        this.container.id = 'dialogue-ui';
        const isMobile = window.innerWidth < 860;

        // Outer container: visual frame only, no overflow handling
        Object.assign(this.container.style, {
            position: isMobile ? 'fixed' : 'absolute',
            bottom: isMobile ? '12px' : '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: isMobile ? `${window.innerWidth - 24}px` : '800px',
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            border: '2px solid white',
            color: 'white',
            fontFamily: '"Press Start 2P", monospace',
            display: 'none',
            zIndex: '600',
            boxShadow: '0 0 10px rgba(0,0,0,0.5)'
        });
        document.body.appendChild(this.container);

        // Inner scroll wrapper: owns max-height + overflow so it scrolls independently
        // of the flexbox layout, which avoids the "flex overflow doesn't scroll" bug.
        const scrollWrapper = document.createElement('div');
        Object.assign(scrollWrapper.style, {
            maxHeight: isMobile ? '70dvh' : '',
            overflowY: isMobile ? 'scroll' : 'visible',
            padding: '20px',
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            gap: '20px',
        });
        if (isMobile) (scrollWrapper.style as any).WebkitOverflowScrolling = 'touch';
        this.container.appendChild(scrollWrapper);

        // --- Left Column (Interaction) ---
        const leftCol = document.createElement('div');
        Object.assign(leftCol.style, {
            display: 'flex',
            flexDirection: 'column',
            flex: '1',
            gap: '15px'
        });
        scrollWrapper.appendChild(leftCol);

        this.nameEl = document.createElement('div');
        this.nameEl.style.color = '#ffd700'; // Gold
        this.nameEl.style.marginBottom = '5px';
        leftCol.appendChild(this.nameEl);

        this.tipEl = document.createElement('div');
        Object.assign(this.tipEl.style, {
            fontStyle: 'italic',
            color: '#aaaaaa',
            fontSize: '0.8em',
            lineHeight: '1.6',
            marginBottom: '10px',
            paddingBottom: '10px',
            borderBottom: '1px solid #444',
            display: 'none',
        });
        leftCol.appendChild(this.tipEl);

        this.textEl = document.createElement('div');
        this.textEl.style.lineHeight = '1.5';
        leftCol.appendChild(this.textEl);

        this.optionsEl = document.createElement('div');
        this.optionsEl.style.display = 'flex';
        this.optionsEl.style.gap = '10px';
        this.optionsEl.style.marginTop = 'auto';
        leftCol.appendChild(this.optionsEl);

        // --- Right Column (Attributes) ---
        const rightCol = document.createElement('div');
        Object.assign(rightCol.style, {
            width: '250px',
            borderLeft: isMobile ? 'none' : '1px solid #444',
            borderTop: isMobile ? '1px solid #444' : 'none',
            paddingLeft: isMobile ? '0' : '20px',
            paddingTop: isMobile ? '15px' : '0',
            display: 'flex',
            flexDirection: 'column',
            fontSize: '0.8em',
            color: '#ccc'
        });
        scrollWrapper.appendChild(rightCol);

        this.infoEl = document.createElement('div');
        rightCol.appendChild(this.infoEl);
    }

    public isOpen: boolean = false;

    private getPowerLabel(person: Person): string {
        if (person.isMinion) return 'Hear Confession';
        return OccupationConfig[person.attributes.occupation]?.powerLabel ?? 'Use Power';
    }

    private getPowerOffer(person: Person): string {
        //if (person.isMinion) return "I have something to confess.";
        return OccupationConfig[person.attributes.occupation]?.powerOffer ?? "use my ability";
    }

    public show(person: Person, activeTask: GameTask | null, items: any[], towns: any[], hasEyeOfTruth: boolean = false) {
        this.container.style.display = 'flex';
        this.isOpen = true;

        this.nameEl.innerText = `${person.name} the ${person.attributes.occupation} ` + (person.isMinion && person.taskCompleted ? "(Minion)" : "");

        if (person.tip) {
            this.tipEl.innerText = `"${person.tip}"`;
            this.tipEl.style.display = 'block';
        } else {
            this.tipEl.style.display = 'none';
        }

        // Populate attribute info panel
        const itemName = items.find(i => i.id === person.attributes.item)?.name || person.attributes.item || "None";
        const townName = towns?.find(t => t.id === person.attributes.townId)?.name || person.attributes.townId;
        const clueText = person.clues?.bad?.text ?? Dialogue.noClue;
        const revealEvil = hasEyeOfTruth && (person.isDemon || person.isMinion);
        const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const row = (label: string, value: string) =>
            `<tr>
              <td style="color:#888;padding:4px 10px 4px 0;white-space:nowrap;vertical-align:top;">${label}</td>
              <td style="color:#eee;vertical-align:top;">${value}</td>
            </tr>`;
        const attrHtml =
            `<div style="color:#aaa;border-bottom:1px solid #444;padding-bottom:5px;margin-bottom:8px;letter-spacing:1px;">ATTRIBUTES</div>` +
            `<table style="border-collapse:collapse;width:100%;margin-bottom:14px;">` +
            row('Pet', esc(person.attributes.pet)) +
            row('Color', esc(person.attributes.color)) +
            row('Item', esc(itemName)) +
            row('Town', esc(townName)) +
            `</table>`;
        const rumorColor = revealEvil ? '#ff4444' : person.clues?.good ? '#44ff88' : '#aaa';
        const rumorHtml =
            `<div style="color:${rumorColor};border-top:1px solid #444;padding-top:8px;line-height:1.8;">` +
            `<span style="color:#888;">Rumor</span><br>&ldquo;${esc(clueText)}&rdquo;</div>`;
        this.infoEl.innerHTML = attrHtml + rumorHtml;

        this.optionsEl.innerHTML = '';
        this.textEl.innerHTML = '';

        const addButton = (text: string, onClick: () => void) => this.addButton(text, onClick);

        // 0. Check if this person IS the target of a FIND task
        if (activeTask && !activeTask.isCompleted) {
            if (activeTask.type === 'FIND_PERSON' || activeTask.type === 'FIND_ITEM') {
                let match = false;
                if (activeTask.targetId === person.id) match = true;
                if (activeTask.targetId === person.attributes.occupation) match = true;
                if (activeTask.targetId === person.attributes.pet) match = true;
                if (activeTask.targetId === person.attributes.color) match = true;
                if (activeTask.type === 'FIND_ITEM' && activeTask.targetId === person.attributes.item) match = true;

                if (match) {
                    this.textEl.innerText = Dialogue.foundTarget(activeTask.description);
                    addButton(Dialogue.buttons.iFoundYou, () => {
                        activeTask.currentAmount = activeTask.amount;
                        activeTask.isCompleted = true;
                        if (this.onTaskCompleted) this.onTaskCompleted();
                        this.textEl.innerText = Dialogue.foundConfirmed;
                        this.optionsEl.innerHTML = '';
                        addButton(Dialogue.buttons.goodbye, () => this.hide());
                    });
                    return;
                }
            }
        }

        // 1. If person gave the active task -> Check status
        if (activeTask && activeTask.giverId === person.id) {
            if (activeTask.isCompleted) {
                // Minion reveals themselves instead of giving a reward
                if (person.isMinion) {
                    this.textEl.innerText = Dialogue.powers.minionReveal;
                    if (this.onCompleteTask) this.onCompleteTask(person, 'POWER');
                    addButton(Dialogue.buttons.goodbye, () => this.hide());
                    return;
                }

                this.textEl.innerText = Dialogue.taskCompleteHeader;

                const hasGoodClue = person.clues?.good;
                const powerLabel = this.getPowerLabel(person);

                if (hasGoodClue) {
                    this.textEl.innerText += `\n\n${Dialogue.taskCompleteGoodClueChoice}`;

                    addButton(Dialogue.buttons.getClue, () => {
                        if (this.onCompleteTask) this.onCompleteTask(person, 'CLUE');
                        this.textEl.innerText = Dialogue.revealClue(person.clues?.good?.text ?? '');
                        this.optionsEl.innerHTML = '';
                        addButton(Dialogue.buttons.goodbye, () => this.hide());
                    });

                    addButton(powerLabel, () => {
                        const result = this.onCompleteTask?.(person, 'POWER') as string | void;
                        this.textEl.innerText = result || Dialogue.powerFallback;
                        this.optionsEl.innerHTML = '';
                        addButton(Dialogue.buttons.goodbye, () => this.hide());
                    });

                } else {
                    this.textEl.innerText += `\n\n${Dialogue.taskCompleteBadClue}`;

                    addButton(powerLabel, () => {
                        const result = this.onCompleteTask?.(person, 'POWER') as string | void;
                        this.textEl.innerText = result || Dialogue.powerFallback;
                        this.optionsEl.innerHTML = '';
                        addButton(Dialogue.buttons.goodbye, () => this.hide());
                    });
                }
            } else {
                this.textEl.innerText = Dialogue.taskInProgress(
                    activeTask.description,
                    activeTask.currentAmount,
                    activeTask.amount
                );
                addButton(Dialogue.buttons.imOnIt, () => this.hide());
            }
        }
        // 2. No active task OR task from someone else
        else {
            if (person.taskCompleted) {
                this.textEl.innerText = person.isMinion ? Dialogue.minionTaskDone : Dialogue.alreadyHelped;
                addButton(Dialogue.buttons.goodbye, () => this.hide());
            } else {
                const taskDesc = person.task.description;
                const powerOffer = this.getPowerOffer(person);
                const hasGoodClue = person.clues?.good;

                if (activeTask) {
                    this.textEl.innerText = hasGoodClue
                        ? Dialogue.taskOfferBusyGoodClue(powerOffer, taskDesc)
                        : Dialogue.taskOfferBusy(powerOffer, taskDesc);
                    addButton(Dialogue.buttons.replaceCurrent, () => {
                        if (this.onAcceptTask) this.onAcceptTask(person.task);
                        this.hide();
                    });
                } else {
                    this.textEl.innerText = hasGoodClue
                        ? Dialogue.taskOfferGoodClue(powerOffer, taskDesc)
                        : Dialogue.taskOfferBadClue(powerOffer, taskDesc);

                    addButton(Dialogue.buttons.acceptTask, () => {
                        if (this.onAcceptTask) this.onAcceptTask(person.task);
                        this.hide();
                    });
                }

                addButton(Dialogue.buttons.noThanks, () => this.hide());
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
