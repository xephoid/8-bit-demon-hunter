
import type { Clue, Person, GameTask } from '../../../shared/src/data/GameData';
import { AssetManager } from '../engine/AssetManager';
import { API_BASE, apiFetch } from '../config/api';

export class ClueTrackerUI {
    private container: HTMLElement;
    private contentEl: HTMLElement;
    private assetManager: AssetManager;
    public isOpen: boolean = false;
    /** Called when the player correctly accuses the demon. Override to trigger the arena fight instead of showing the win modal immediately. */
    public onDemonAccused: (() => void) | null = null;
    /** Called with the accusation result (won=true for correct, false for wrong) and the accused person's id. */
    public onAccuseResult: ((won: boolean, personId: string) => void) | null = null;

    constructor(assetManager: AssetManager) {
        this.assetManager = assetManager;
        this.container = document.createElement('div');
        this.container.id = 'clue-tracker-ui';
        Object.assign(this.container.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            maxHeight: 'none',
            backgroundColor: 'rgba(0, 0, 0, 0.95)',
            border: 'none',
            padding: '40px',
            boxSizing: 'border-box',
            color: 'white',
            fontFamily: '"Press Start 2P", monospace',
            display: 'none',
            flexDirection: 'column',
            gap: '15px',
            zIndex: '90',
            overflowY: 'auto'
        });
        document.body.appendChild(this.container);

        const title = document.createElement('h2');
        title.innerText = "CLUE NOTEBOOK";
        title.style.textAlign = "center";
        title.style.color = "#ffd700";
        this.container.appendChild(title);

        this.contentEl = document.createElement('div');
        this.container.appendChild(this.contentEl);
    }

    public toggle(people: Person[], knownClues: Clue[], items: any[], towns: any[], activeTask: GameTask | null, onSelectTask: (task: GameTask) => void) {
        if (this.isOpen) {
            this.hide();
        } else {
            this.show(people, knownClues, items, towns, activeTask, onSelectTask);
        }
    }

    public show(people: Person[], knownClues: Clue[], items: any[], towns: any[], activeTask: GameTask | null, onSelectTask: (task: GameTask) => void, currentWorldId?: string) {
        this.container.style.display = 'flex';
        this.isOpen = true;
        // Auto-switch to the player's current town tab if they're inside a town
        if (currentWorldId) {
            const metPeople = people.filter(p => p.hasMet);
            const discoveredTownIds = Array.from(new Set(metPeople.map(p => p.attributes.townId)));
            if (discoveredTownIds.includes(currentWorldId)) this.currentTab = currentWorldId;
        }
        this.render(people, knownClues, items, towns, activeTask, onSelectTask);
    }

    public hide() {
        this.container.style.display = 'none';
        this.isOpen = false;
    }

    public currentTab: string | null = null;
    public currentSort: 'occupation' | 'pet' | 'color' | 'item' = 'occupation';

    private render(people: Person[], knownClues: Clue[], items: any[], towns: any[], activeTask: GameTask | null, onSelectTask: (task: GameTask) => void) {
        this.contentEl.innerHTML = '';

        // 1. Known Clues Section
        const clueSection = document.createElement('div');
        clueSection.innerHTML = '<h3 style="border-bottom: 1px solid #666; padding-bottom: 5px;">COLLECTED CLUES</h3>';

        const displayedClues = knownClues.filter(c => c.isGood || c.isSpecial);
        if (displayedClues.length === 0) {
            clueSection.innerHTML += '<p style="color: #888; font-size: 0.8em;">No clues found yet.</p>';
        } else {
            const ul = document.createElement('ul');
            ul.style.paddingLeft = '20px';

            displayedClues.forEach(clue => {
                const li = document.createElement('li');
                li.innerText = clue.text;
                li.style.marginBottom = '10px';
                li.style.fontSize = '0.8em';
                li.style.color = clue.isSpecial ? '#4488ff' : '#00ff00';
                ul.appendChild(li);
            });
            clueSection.appendChild(ul);
        }
        this.contentEl.appendChild(clueSection);

        // 2. People Dossier
        const peopleSection = document.createElement('div');
        peopleSection.style.marginTop = '20px';
        peopleSection.innerHTML = '<h3 style="border-bottom: 1px solid #666; padding-bottom: 5px;">PEOPLE MET</h3>';

        const metPeople = people.filter(p => p.hasMet);

        // --- TOWN TABS LOGIC ---
        if (metPeople.length > 0) {
            // Get unique towns from met people
            const discoveredTownIds = Array.from(new Set(metPeople.map(p => p.attributes.townId))).filter(id => id); // Filter undefined

            // Validate Current Tab
            if (!this.currentTab || !discoveredTownIds.includes(this.currentTab)) {
                this.currentTab = discoveredTownIds[0] || null;
            }

            // Tab bar row: tabs on the left, sort dropdown on the right
            const tabRow = document.createElement('div');
            Object.assign(tabRow.style, {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                marginBottom: '15px',
                borderBottom: '1px solid #444',
                paddingBottom: '5px',
                gap: '10px'
            });

            const tabBar = document.createElement('div');
            tabBar.style.display = 'flex';
            tabBar.style.gap = '5px';
            tabBar.style.flexWrap = 'wrap';

            discoveredTownIds.forEach(tId => {
                const btn = document.createElement('button');
                const tName = towns?.find(t => t.id === tId)?.name || tId;

                btn.innerText = tName;

                const isActive = this.currentTab === tId;
                Object.assign(btn.style, {
                    backgroundColor: isActive ? '#ffd700' : '#333',
                    color: isActive ? 'black' : '#888',
                    border: '1px solid #444',
                    padding: '5px 10px',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: '0.7em'
                });

                btn.onclick = () => {
                    this.currentTab = tId;
                    this.render(people, knownClues, items, towns, activeTask, onSelectTask);
                };

                tabBar.appendChild(btn);
            });

            // Sort dropdown
            const sortWrap = document.createElement('div');
            Object.assign(sortWrap.style, {
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap',
                flexShrink: '0'
            });

            const sortLabel = document.createElement('span');
            sortLabel.innerText = 'SORT:';
            sortLabel.style.fontSize = '0.65em';
            sortLabel.style.color = '#888';
            sortWrap.appendChild(sortLabel);

            const sortSelect = document.createElement('select');
            Object.assign(sortSelect.style, {
                backgroundColor: '#222',
                color: '#ccc',
                border: '1px solid #555',
                padding: '4px 6px',
                fontFamily: 'inherit',
                fontSize: '0.65em',
                cursor: 'pointer'
            });

            const sortOptions: { value: ClueTrackerUI['currentSort']; label: string }[] = [
                { value: 'occupation', label: 'JOB' },
                { value: 'pet', label: 'PET' },
                { value: 'color', label: 'COLOR' },
                { value: 'item', label: 'ITEM' },
            ];
            sortOptions.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt.value;
                option.innerText = opt.label;
                if (opt.value === this.currentSort) option.selected = true;
                sortSelect.appendChild(option);
            });

            sortSelect.onchange = () => {
                this.currentSort = sortSelect.value as ClueTrackerUI['currentSort'];
                this.render(people, knownClues, items, towns, activeTask, onSelectTask);
            };

            sortWrap.appendChild(sortSelect);
            tabRow.appendChild(tabBar);
            tabRow.appendChild(sortWrap);
            peopleSection.appendChild(tabRow);
        }

        // Filter People by Tab, sorted by currentSort
        const getSortValue = (p: Person): string => {
            switch (this.currentSort) {
                case 'pet': return p.attributes.pet;
                case 'color': return p.attributes.color;
                case 'item': {
                    const name = items?.find((i: any) => i.id === p.attributes.item)?.name || p.attributes.item || '';
                    return name.replace(/^(a |an )/i, '');
                }
                default: return p.attributes.occupation;
            }
        };
        const displayedPeople = (this.currentTab
            ? metPeople.filter(p => p.attributes.townId === this.currentTab)
            : metPeople
        ).slice().sort((a, b) => getSortValue(a).localeCompare(getSortValue(b)));

        // How many slots are still unknown in this town
        const totalInTab = this.currentTab
            ? (towns?.find((t: any) => t.id === this.currentTab)?.people?.length ?? 0)
            : 0;
        const unknownCount = Math.max(0, totalInTab - displayedPeople.length);

        // Helper to check if ruled out
        const isRuledOut = (key: string, value: string): boolean => {
            return knownClues.some(c =>
                !c.isGood &&
                c.relatedAttribute &&
                c.relatedAttribute.key === key &&
                c.relatedAttribute.value === value
            );
        };

        const formatAttr = (label: string, value: string, key: string, rawValue: string) => {
            const ruledOut = isRuledOut(key, rawValue);
            const style = ruledOut ? 'text-decoration: line-through; color: #666;' : 'color: #888;';
            const valStyle = ruledOut ? 'text-decoration: line-through; color: #666;' : 'color: #ccc;';
            return `<div style="${style}">${label}: <span style="${valStyle}">${value}</span></div>`;
        };

        if (displayedPeople.length === 0 && unknownCount === 0) {
            peopleSection.innerHTML += '<p style="color: #888; font-size: 0.8em;">You haven\'t met anyone yet.</p>';
        } else {
            displayedPeople.forEach(p => {
                const card = document.createElement('div');
                card.style.border = '1px solid #444';
                card.style.padding = '10px';
                card.style.marginBottom = '10px';
                card.style.fontSize = '0.8em';
                card.style.display = 'flex';
                card.style.gap = '10px';
                card.style.alignItems = 'center';

                // Sprite
                const spriteContainer = document.createElement('div');
                spriteContainer.style.width = '64px';
                spriteContainer.style.height = '64px';
                spriteContainer.style.backgroundColor = '#222';
                spriteContainer.style.display = 'flex';
                spriteContainer.style.justifyContent = 'center';
                spriteContainer.style.alignItems = 'center';
                spriteContainer.style.border = '1px solid #666';

                // Try to get texture (prefer Down facing _2)
                let tex = null;
                // New Skin Logic: character_ROW_SKIN
                const match = p.sprite.match(/character_(\d+)_(\d+)/);
                if (match) {
                    const row = parseInt(match[1]);
                    const skin = parseInt(match[2]);
                    const col = (skin * 3) + 2; // Down
                    tex = this.assetManager.getTexture(`character_${row}_${col}`);
                } else {
                    // Fallback
                    const matchOld = p.sprite.match(/character_(\d+)/);
                    if (matchOld) {
                        const skin = parseInt(matchOld[1]);
                        const col = (skin * 3) + 2;
                        tex = this.assetManager.getTexture(`character_0_${col}`);
                    }
                }

                if (!tex) tex = this.assetManager.getTexture(`${p.sprite}_2`) || this.assetManager.getTexture(p.sprite);

                if (tex && tex.image) {
                    const img = document.createElement('img');
                    img.src = (tex.image as HTMLImageElement).src;
                    img.style.width = '100%';
                    img.style.height = '100%';
                    img.style.imageRendering = 'pixelated';
                    spriteContainer.appendChild(img);
                } else {
                    spriteContainer.innerText = "?";
                }
                card.appendChild(spriteContainer);

                // Info
                const infoContainer = document.createElement('div');

                // Name (Standard)
                let html = `<strong style="color: #aaa;">${p.name}</strong>`;

                html += `<div style="margin-top: 5px;">`;

                // Occupation
                html += formatAttr("Job", p.attributes.occupation, 'occupation', p.attributes.occupation);

                // Pet
                html += formatAttr("Pet", p.attributes.pet, 'pet', p.attributes.pet);

                // Color
                html += formatAttr("Color", p.attributes.color, 'color', p.attributes.color);

                // Item
                const itemName = items.find(i => i.id === p.attributes.item)?.name || p.attributes.item || "None";
                html += formatAttr("Item", itemName, 'item', p.attributes.item);

                // Town
                const townName = towns?.find(t => t.id === p.attributes.townId)?.name || p.attributes.townId;
                html += formatAttr("Town", townName, 'townId', p.attributes.townId);

                html += `</div>`;
                infoContainer.innerHTML = html;
                card.appendChild(infoContainer);

                // CLUE COLUMN
                const clueCol = document.createElement('div');
                clueCol.style.flex = '1'; // Take available space
                clueCol.style.padding = '0 10px';
                clueCol.style.display = 'flex';
                clueCol.style.flexDirection = 'column';
                clueCol.style.justifyContent = 'center';

                const clueTitle = document.createElement('div');
                clueTitle.innerText = "KNOWLEDGE:";
                clueTitle.style.fontSize = '0.6em';
                clueTitle.style.color = '#aaa';
                clueTitle.style.marginBottom = '5px';
                clueCol.appendChild(clueTitle);

                const clueTextEl = document.createElement('div');
                let clueText = "No clues.";
                let clueColor = "#888";

                if (p.clues?.bad) {
                    clueText = `"${p.clues.bad.text}"`;
                    clueColor = "#ff8888"; // Slight red for rumor
                } else if (p.clues?.good) {
                    clueText = "\"I know the truth!\"";
                    clueColor = "#88ff88"; // Green hint
                }

                clueTextEl.innerText = clueText;
                clueTextEl.style.fontSize = '0.7em';
                clueTextEl.style.color = clueColor;
                clueTextEl.style.fontStyle = 'italic';
                clueCol.appendChild(clueTextEl);

                // ACCUSE BUTTON
                const accuseBtn = document.createElement('button');
                accuseBtn.innerText = "ACCUSE";
                Object.assign(accuseBtn.style, {
                    backgroundColor: '#ff0000',
                    color: 'white',
                    border: '1px solid #800000',
                    padding: '5px 10px',
                    fontFamily: 'inherit',
                    fontSize: '0.7em',
                    cursor: 'pointer',
                    marginTop: '10px',
                    alignSelf: 'flex-start'
                });
                accuseBtn.onclick = () => {
                    this.showConfirmModal(p.name, async () => {
                        try {
                            const res = await apiFetch(`${API_BASE}/api/accuse`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ personId: p.id })
                            });
                            const data = await res.json();
                            if (data.success) {
                                this.onAccuseResult?.(true, p.id);
                                if (this.onDemonAccused) {
                                    this.hide();
                                    this.onDemonAccused();
                                } else {
                                    this.showResultModal(true);
                                }
                            } else {
                                this.onAccuseResult?.(false, p.id);
                                this.showResultModal(false);
                            }
                        } catch (e) {
                            console.error(e);
                        }
                    });
                };
                clueCol.appendChild(accuseBtn);

                card.appendChild(clueCol);

                // TASK COLUMN
                if (p.task && !p.taskCompleted) {
                    const taskCol = document.createElement('div');
                    taskCol.style.marginLeft = 'auto'; // Push to right
                    taskCol.style.display = 'flex';
                    taskCol.style.flexDirection = 'column';
                    taskCol.style.alignItems = 'flex-end';
                    taskCol.style.maxWidth = '200px';

                    const taskTitle = document.createElement('div');
                    taskTitle.innerText = "OFFERED TASK:";
                    taskTitle.style.fontSize = '0.6em';
                    taskTitle.style.color = '#aaa';
                    taskTitle.style.marginBottom = '5px';
                    taskCol.appendChild(taskTitle);

                    const taskDesc = document.createElement('div');
                    taskDesc.innerText = p.task.description;
                    taskDesc.style.fontSize = '0.7em';
                    taskDesc.style.color = 'white';
                    taskDesc.style.marginBottom = '10px';
                    taskDesc.style.textAlign = 'right';
                    taskCol.appendChild(taskDesc);

                    const trackBtn = document.createElement('button');
                    const isActive = activeTask && activeTask.id === p.task.id;

                    trackBtn.innerText = isActive ? "ACTIVE" : "TRACK";

                    Object.assign(trackBtn.style, {
                        backgroundColor: isActive ? '#444' : '#ffd700',
                        color: isActive ? '#888' : 'black',
                        border: 'none',
                        padding: '5px 10px',
                        fontFamily: 'inherit',
                        fontSize: '0.7em',
                        cursor: isActive ? 'default' : 'pointer',
                        opacity: isActive ? '0.5' : '1'
                    });

                    if (!isActive) {
                        trackBtn.onclick = () => {
                            onSelectTask(p.task);
                            // Re-render to update buttons
                            this.render(people, knownClues, items, towns, p.task, onSelectTask);
                        };
                    } else {
                        trackBtn.disabled = true;
                    }

                    taskCol.appendChild(trackBtn);
                    card.appendChild(taskCol);
                }

                peopleSection.appendChild(card);
            });

            // Placeholder cards for people in this town not yet encountered
            for (let i = 0; i < unknownCount; i++) {
                const placeholder = document.createElement('div');
                Object.assign(placeholder.style, {
                    border: '1px dashed #333',
                    padding: '10px',
                    marginBottom: '10px',
                    fontSize: '0.8em',
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'center',
                    opacity: '0.4'
                });

                const spriteBox = document.createElement('div');
                Object.assign(spriteBox.style, {
                    minWidth: '64px',
                    width: '64px',
                    height: '64px',
                    backgroundColor: '#111',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    border: '1px dashed #555',
                    color: '#555',
                    fontSize: '1.5em'
                });
                spriteBox.innerText = '?';
                placeholder.appendChild(spriteBox);

                const info = document.createElement('div');
                info.style.color = '#555';
                info.innerHTML = '<strong>???</strong><div style="margin-top: 5px; font-size: 0.85em;">Not yet encountered</div>';
                placeholder.appendChild(info);

                peopleSection.appendChild(placeholder);
            }
        }
        this.contentEl.appendChild(peopleSection);
    }

    private showConfirmModal(name: string, onConfirm: () => void) {
        const overlay = this.makeModalOverlay();

        const box = this.makeModalBox();
        const msg = document.createElement('div');
        msg.style.marginBottom = '20px';
        msg.innerText = `Accuse ${name}?\nIf you are wrong, you LOSE!`;
        msg.style.whiteSpace = 'pre-wrap';
        msg.style.textAlign = 'center';
        box.appendChild(msg);

        const btnRow = document.createElement('div');
        Object.assign(btnRow.style, { display: 'flex', gap: '20px', justifyContent: 'center' });

        const yes = this.makeModalBtn('YES', '#cc0000');
        yes.onclick = () => { document.body.removeChild(overlay); onConfirm(); };

        const no = this.makeModalBtn('NO', '#333');
        no.onclick = () => document.body.removeChild(overlay);

        btnRow.appendChild(yes);
        btnRow.appendChild(no);
        box.appendChild(btnRow);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
    }

    public showResultModal(won: boolean) {
        const overlay = this.makeModalOverlay();

        const box = this.makeModalBox();

        const title = document.createElement('div');
        title.innerText = won ? 'YOU WIN!' : 'YOU LOSE';
        Object.assign(title.style, {
            fontSize: '2em',
            color: won ? '#00ff00' : '#ff0000',
            marginBottom: '16px',
            textShadow: won ? '0 0 10px #00ff00' : '0 0 10px #ff0000'
        });
        box.appendChild(title);

        const sub = document.createElement('div');
        sub.innerText = won ? 'You defeated the demon!' : 'The demon has escaped.';
        sub.style.marginBottom = '28px';
        sub.style.color = '#ccc';
        box.appendChild(sub);

        const btn = this.makeModalBtn('NEW GAME', '#333');
        btn.onclick = () => location.reload();
        box.appendChild(btn);

        overlay.appendChild(box);
        document.body.appendChild(overlay);
    }

    private makeModalOverlay(): HTMLElement {
        const overlay = document.createElement('div');
        Object.assign(overlay.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.8)',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            zIndex: '1000'
        });
        return overlay;
    }

    private makeModalBox(): HTMLElement {
        const box = document.createElement('div');
        Object.assign(box.style, {
            backgroundColor: '#111',
            border: '2px solid white',
            padding: '40px',
            fontFamily: '"Press Start 2P", monospace',
            color: 'white',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '10px',
            fontSize: '14px',
            maxWidth: '400px',
            textAlign: 'center'
        });
        return box;
    }

    private makeModalBtn(label: string, bg: string): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.innerText = label;
        Object.assign(btn.style, {
            padding: '12px 24px',
            backgroundColor: bg,
            color: 'white',
            border: '1px solid #666',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: '0.9em'
        });
        btn.onmouseover = () => btn.style.filter = 'brightness(1.3)';
        btn.onmouseout = () => btn.style.filter = '';
        return btn;
    }

}
