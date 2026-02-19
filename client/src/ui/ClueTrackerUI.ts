
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

    public toggle(people: Person[], knownClues: Clue[]) {
        if (this.isOpen) {
            this.hide();
        } else {
            this.show(people, knownClues);
        }
    }

    public show(people: Person[], knownClues: Clue[]) {
        this.container.style.display = 'flex';
        this.isOpen = true;
        this.render(people, knownClues);
    }

    public hide() {
        this.container.style.display = 'none';
        this.isOpen = false;
    }

    private render(people: Person[], knownClues: Clue[]) {
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
                if (clue.isGood) {
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

        if (metPeople.length === 0) {
            peopleSection.innerHTML += '<p style="color: #888; font-size: 0.8em;">You haven\'t met anyone yet.</p>';
        } else {
            metPeople.forEach(p => {
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
                let tex = this.assetManager.getTexture(`${p.sprite}_2`);
                if (!tex) tex = this.assetManager.getTexture(p.sprite);

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
                let html = `<strong style="color: #aaa;">${p.name}</strong> (${p.attributes.occupation})`;
                html += `<div style="margin-top: 5px; color: #888;">`;
                html += `Pet: ${p.attributes.pet}<br>`;
                html += `Color: ${p.attributes.color}<br>`;
                html += `Item: <span style="color: #fff;">${p.attributes.item || "None"}</span><br>`;
                html += `Town: ${p.attributes.townId}`;
                html += `</div>`;
                infoContainer.innerHTML = html;
                card.appendChild(infoContainer);

                peopleSection.appendChild(card);
            });
        }
        this.contentEl.appendChild(peopleSection);
    }
}
