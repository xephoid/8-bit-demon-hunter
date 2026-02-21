export class LevelUpUI {
    private container: HTMLElement;
    private titleEl: HTMLElement;
    private statsEl: HTMLElement;
    private optionsEl: HTMLElement;
    public isOpen: boolean = false;

    // Callbacks to hook into main.ts state
    public onUpgradeStat: ((stat: 'strength' | 'agility' | 'health' | 'range') => void) | null = null;
    public onClose: (() => void) | null = null;

    constructor() {
        this.container = document.createElement('div');
        this.container.id = 'level-up-ui';
        this.container.style.position = 'absolute';
        this.container.style.top = '50%';
        this.container.style.left = '50%';
        this.container.style.transform = 'translate(-50%, -50%)';
        this.container.style.width = '400px';
        this.container.style.backgroundColor = 'rgba(0, 50, 0, 0.9)';
        this.container.style.border = '4px solid gold';
        this.container.style.borderRadius = '10px';
        this.container.style.padding = '20px';
        this.container.style.color = 'white';
        this.container.style.fontFamily = '"Press Start 2P", monospace';
        this.container.style.display = 'none';
        this.container.style.zIndex = '1000';
        this.container.style.textAlign = 'center';

        this.titleEl = document.createElement('h2');
        this.titleEl.style.margin = '0 0 15px 0';
        this.titleEl.style.color = 'gold';
        this.container.appendChild(this.titleEl);

        this.statsEl = document.createElement('div');
        this.statsEl.style.marginBottom = '20px';
        this.statsEl.style.textAlign = 'left';
        this.container.appendChild(this.statsEl);

        this.optionsEl = document.createElement('div');
        this.optionsEl.style.display = 'flex';
        this.optionsEl.style.flexDirection = 'column';
        this.optionsEl.style.gap = '10px';
        this.container.appendChild(this.optionsEl);

        document.body.appendChild(this.container);
    }

    public show(level: number, currentStats: any, maxStats: any) {
        this.isOpen = true;
        this.container.style.display = 'block';
        this.titleEl.innerText = `LEVEL UP! (Level ${level})`;
        this.titleEl.style.fontSize = '16px';
        this.titleEl.style.lineHeight = '1.5';

        this.statsEl.innerHTML = `
            <div style="font-size: 10px; line-height: 1.8;"><strong>Strength:</strong> ${currentStats.strength} / ${maxStats.strength.max}</div>
            <div style="font-size: 10px; line-height: 1.8;"><strong>Agility:</strong> ${currentStats.agility} / ${maxStats.agility.max}</div>
            <div style="font-size: 10px; line-height: 1.8;"><strong>Health:</strong> ${currentStats.maxHp} / ${maxStats.health.max}</div>
            <div style="font-size: 10px; line-height: 1.8;"><strong>Range:</strong> ${currentStats.range} / ${maxStats.range.max}</div>
        `;

        this.optionsEl.innerHTML = '';

        this.addUpgradeButton('Strength', 'strength', currentStats.strength, maxStats.strength.max, 'Increases melee/projectile damage.');
        this.addUpgradeButton('Agility', 'agility', currentStats.agility, maxStats.agility.max, 'Increases movement speed.');
        this.addUpgradeButton('Health', 'health', currentStats.maxHp, maxStats.health.max, 'Increases max hearts and heals to full.');
        this.addUpgradeButton('Range', 'range', currentStats.range, maxStats.range.max, 'Increases attack distance.');

        // Escape hatch if somehow all maxed
        if (this.optionsEl.children.length === 0) {
            const btn = document.createElement('button');
            btn.innerText = "Continue (All Stats Maxed)";
            btn.style.padding = '10px';
            btn.style.cursor = 'pointer';
            btn.onclick = () => this.hide();
            this.optionsEl.appendChild(btn);
        }
    }

    private addUpgradeButton(label: string, statKey: 'strength' | 'agility' | 'health' | 'range', current: number, max: number, desc: string) {
        if (current >= max) {
            return; // Don't show options that are maxed out
        }

        const btn = document.createElement('button');
        btn.innerHTML = `<span style="font-size:12px;">+1 ${label}</span><br><br><span style="font-size:8px; color:#ddd; font-family: 'Press Start 2P', monospace; line-height: 1.5;">${desc}</span>`;
        btn.style.padding = '15px';
        btn.style.backgroundColor = '#222';
        btn.style.color = 'gold';
        btn.style.border = '2px solid gold';
        btn.style.cursor = 'pointer';
        btn.style.borderRadius = '5px';
        btn.style.textAlign = 'left';

        btn.onmouseover = () => btn.style.backgroundColor = '#444';
        btn.onmouseout = () => btn.style.backgroundColor = '#222';

        btn.onclick = () => {
            if (this.onUpgradeStat) this.onUpgradeStat(statKey);
            this.hide();
        };

        this.optionsEl.appendChild(btn);
    }

    public hide() {
        this.isOpen = false;
        this.container.style.display = 'none';
        if (this.onClose) this.onClose();
    }
}
