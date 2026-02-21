
import type { Clue, Person, GameTask } from '../../../shared/src/data/GameData';
import { AssetManager } from '../engine/AssetManager';

export class ClueTrackerUI {
    private container: HTMLElement;
    private contentEl: HTMLElement;
    private assetManager: AssetManager;
    public isOpen: boolean = false;

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

    public show(people: Person[], knownClues: Clue[], items: any[], towns: any[], activeTask: GameTask | null, onSelectTask: (task: GameTask) => void) {
        this.container.style.display = 'flex';
        this.isOpen = true;
        this.render(people, knownClues, items, towns, activeTask, onSelectTask);
    }

    public hide() {
        this.container.style.display = 'none';
        this.isOpen = false;
    }

    public currentTab: string | null = null; // State for selected town tab

    private render(people: Person[], knownClues: Clue[], items: any[], towns: any[], activeTask: GameTask | null, onSelectTask: (task: GameTask) => void) {
        this.contentEl.innerHTML = '';

        // 1. Known Clues Section
        const clueSection = document.createElement('div');
        clueSection.innerHTML = '<h3 style="border-bottom: 1px solid #666; padding-bottom: 5px;">COLLECTED CLUES</h3>';

        if (knownClues.length === 0) {
            clueSection.innerHTML += '<p style="color: #888; font-size: 0.8em;">No clues found yet.</p>';
        } else {
            const ul = document.createElement('ul');
            ul.style.paddingLeft = '20px';

            knownClues.forEach(clue => {
                const li = document.createElement('li');
                li.innerText = clue.text;
                li.style.marginBottom = '10px';
                li.style.fontSize = '0.8em';

                // Color code logic
                if (clue.isSpecial) {
                    li.style.color = '#4488ff'; // Blue for special occupation power clues
                } else if (clue.isGood) {
                    li.style.color = '#00ff00'; // Green for Truths
                } else {
                    li.style.color = '#ff4444'; // Red for "BAD" (Negative) clues
                }

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

            // Tab Bar
            const tabBar = document.createElement('div');
            tabBar.style.display = 'flex';
            tabBar.style.gap = '5px';
            tabBar.style.marginBottom = '15px';
            tabBar.style.borderBottom = '1px solid #444';
            tabBar.style.paddingBottom = '5px';
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

            peopleSection.appendChild(tabBar);
        }

        // Filter People by Tab
        const displayedPeople = this.currentTab
            ? metPeople.filter(p => p.attributes.townId === this.currentTab)
            : metPeople;

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

        if (displayedPeople.length === 0) {
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
                accuseBtn.onclick = async () => {
                    if (confirm(`Are you SURE you want to accuse ${p.name}? If you are wrong, you LOSE!`)) {
                        try {
                            const res = await fetch('http://localhost:3000/api/accuse', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ personId: p.id })
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert("YOU FOUND THE DEMON! YOU WIN!");
                                location.reload(); // Simple restart
                            } else {
                                alert("WRONG! The demon has escaped. YOU LOSE.");
                                location.reload(); // Simple restart
                            }
                        } catch (e) {
                            console.error(e);
                            alert("Error contacting server.");
                        }
                    }
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
        }
        this.contentEl.appendChild(peopleSection);
    }

}
