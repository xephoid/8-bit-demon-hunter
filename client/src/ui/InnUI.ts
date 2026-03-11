import { RESOURCE_BASE_VALUE, RESOURCE_DISPLAY_NAME } from '../../../shared/src/data/GameData';

const ALL_RESOURCES = Object.keys(RESOURCE_BASE_VALUE);
const RESOURCE_ICON_FILENAME: Record<string, string> = { gold: 'resource_gold_ore' };

const SLEEP_COST = 5;
const TRAIN_COST = 50;
const ESCORT_COST = 50;

export class InnUI {
    private container: HTMLElement;
    private contentEl: HTMLElement;
    public isOpen: boolean = false;

    public onClose: (() => void) | null = null;
    public onSleep: (() => void) | null = null;
    public onTrain: (() => void) | null = null;
    public onEscort: ((townId: string) => void) | null = null;
    public onBuy: ((resource: string) => void) | null = null;
    public onSell: ((resource: string) => void) | null = null;

    private priceMultipliers: Record<string, number> = {};
    private innStock: Record<string, number> = {};
    private playerResources: Record<string, number> = {};
    private getShuckles: () => number = () => 0;
    private getHp: () => number = () => 0;
    private maxHp: number = 10;
    private towns: any[] = [];

    private escortSubMenu: HTMLElement | null = null;

    constructor() {
        this.container = document.createElement('div');
        Object.assign(this.container.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.93)', display: 'none', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'flex-start', overflowY: 'auto',
            zIndex: '200', fontFamily: '"Press Start 2P", monospace', color: '#fff',
            padding: '32px 16px', boxSizing: 'border-box',
        });
        document.body.appendChild(this.container);

        this.contentEl = document.createElement('div');
        Object.assign(this.contentEl.style, { width: '100%', maxWidth: '700px' });
        this.container.appendChild(this.contentEl);
    }

    public show(
        priceMultipliers: Record<string, number>,
        innStock: Record<string, number>,
        playerResources: Record<string, number>,
        getShuckles: () => number,
        towns: any[],
        getHp: () => number = () => 0,
        maxHp: number = 10,
    ) {
        this.priceMultipliers = priceMultipliers;
        this.innStock = innStock;
        this.playerResources = playerResources;
        this.getShuckles = getShuckles;
        this.getHp = getHp;
        this.maxHp = maxHp;
        this.towns = towns;
        this.isOpen = true;
        this.container.style.display = 'flex';
        this.render();
    }

    public hide() {
        this.isOpen = false;
        this.container.style.display = 'none';
        this.escortSubMenu = null;
        this.onClose?.();
    }

    private render() {
        this.contentEl.innerHTML = '';
        const shuckles = this.getShuckles();

        // Header
        const header = document.createElement('div');
        Object.assign(header.style, {
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: '24px', borderBottom: '2px solid #ffd700', paddingBottom: '12px',
        });
        const title = document.createElement('div');
        title.innerText = 'INN';
        Object.assign(title.style, { fontSize: '20px', color: '#ffd700' });
        const shucklesLabel = document.createElement('div');
        shucklesLabel.innerText = `\uD83D\uDC1A ${shuckles} Shuckles`;
        Object.assign(shucklesLabel.style, { fontSize: '14px', color: '#aaffaa' });
        const closeBtn = document.createElement('button');
        closeBtn.innerText = '[X]';
        Object.assign(closeBtn.style, {
            background: 'none', border: '1px solid #888', color: '#fff',
            fontFamily: '"Press Start 2P", monospace', fontSize: '12px',
            padding: '6px 10px', cursor: 'pointer',
        });
        closeBtn.onclick = () => this.hide();
        header.appendChild(title);
        header.appendChild(shucklesLabel);
        header.appendChild(closeBtn);
        this.contentEl.appendChild(header);

        // Trade Section
        const tradeTitle = document.createElement('div');
        tradeTitle.innerText = 'TRADE';
        Object.assign(tradeTitle.style, { fontSize: '14px', color: '#ffd700', marginBottom: '12px' });
        this.contentEl.appendChild(tradeTitle);

        const table = document.createElement('div');
        Object.assign(table.style, {
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto',
            gap: '8px 16px',
            fontSize: '11px',
            marginBottom: '24px',
        });

        // Table header row
        const headerCells = ['Resource', 'Sell\u00A0\uD83D\uDC1A', 'Buy\u00A0\uD83D\uDC1A', 'Inn\u00A0Stock', 'You\u00A0Have', 'Actions'];
        headerCells.forEach(text => {
            const cell = document.createElement('div');
            cell.innerText = text;
            Object.assign(cell.style, { color: '#888', borderBottom: '1px solid #444', paddingBottom: '4px' });
            table.appendChild(cell);
        });

        // Data rows
        for (const r of ALL_RESOURCES) {
            const mult = this.priceMultipliers[r] ?? 1;
            const baseVal = RESOURCE_BASE_VALUE[r] ?? 1;
            const sellPrice = baseVal * mult;
            const buyPrice = Math.ceil(sellPrice * 1.5);
            const stock = this.innStock[r] ?? 0;
            const playerQty = this.playerResources[r] ?? 0;

            // Name
            const nameCell = document.createElement('div');
            Object.assign(nameCell.style, { color: '#ddd', display: 'flex', alignItems: 'center', gap: '4px' });
            const icon = document.createElement('img');
            icon.src = `/sprites/sliced/${RESOURCE_ICON_FILENAME[r] ?? `resource_${r}`}.png`;
            Object.assign(icon.style, { width: '14px', height: '14px', imageRendering: 'pixelated' });
            nameCell.appendChild(icon);
            nameCell.appendChild(document.createTextNode(RESOURCE_DISPLAY_NAME[r] ?? r));
            table.appendChild(nameCell);

            // Sell price
            const sellPriceCell = document.createElement('div');
            sellPriceCell.innerText = String(sellPrice);
            sellPriceCell.style.color = '#aaffaa';
            table.appendChild(sellPriceCell);

            // Buy price
            const buyPriceCell = document.createElement('div');
            buyPriceCell.innerText = String(buyPrice);
            buyPriceCell.style.color = '#ffaaaa';
            table.appendChild(buyPriceCell);

            // Inn stock
            const stockCell = document.createElement('div');
            stockCell.innerText = String(stock);
            stockCell.style.color = stock === 0 ? '#666' : '#ddd';
            table.appendChild(stockCell);

            // Player qty
            const qtyCell = document.createElement('div');
            qtyCell.innerText = String(playerQty);
            qtyCell.style.color = playerQty === 0 ? '#666' : '#fff';
            table.appendChild(qtyCell);

            // Action buttons
            const actions = document.createElement('div');
            Object.assign(actions.style, { display: 'flex', gap: '4px' });

            const sellBtn = document.createElement('button');
            sellBtn.innerText = 'Sell';
            const canSell = playerQty > 0;
            Object.assign(sellBtn.style, {
                fontFamily: '"Press Start 2P", monospace', fontSize: '10px',
                padding: '4px 8px', cursor: canSell ? 'pointer' : 'not-allowed',
                background: canSell ? '#225522' : '#333', border: '1px solid #555',
                color: canSell ? '#aaffaa' : '#555',
            });
            sellBtn.disabled = !canSell;
            sellBtn.onclick = () => {
                this.onSell?.(r);
                this.render();
            };
            actions.appendChild(sellBtn);

            const canBuy = stock > 0 && shuckles >= buyPrice;
            const buyBtn = document.createElement('button');
            buyBtn.innerText = 'Buy';
            Object.assign(buyBtn.style, {
                fontFamily: '"Press Start 2P", monospace', fontSize: '10px',
                padding: '4px 8px', cursor: canBuy ? 'pointer' : 'not-allowed',
                background: canBuy ? '#222255' : '#333', border: '1px solid #555',
                color: canBuy ? '#aaaaff' : '#555',
            });
            buyBtn.disabled = !canBuy;
            buyBtn.onclick = () => {
                this.onBuy?.(r);
                this.render();
            };
            actions.appendChild(buyBtn);

            table.appendChild(actions);
        }
        this.contentEl.appendChild(table);

        // Services Section
        const svcTitle = document.createElement('div');
        svcTitle.innerText = 'SERVICES';
        Object.assign(svcTitle.style, { fontSize: '14px', color: '#ffd700', marginBottom: '12px' });
        this.contentEl.appendChild(svcTitle);

        const svcRow = document.createElement('div');
        Object.assign(svcRow.style, { display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' });

        const makeServiceBtn = (label: string, cost: number, enabled: boolean, onClick: () => void) => {
            const btn = document.createElement('button');
            btn.innerText = `${label} (${cost}\uD83D\uDC1A)`;
            Object.assign(btn.style, {
                fontFamily: '"Press Start 2P", monospace', fontSize: '11px',
                padding: '10px 16px', cursor: enabled ? 'pointer' : 'not-allowed',
                background: enabled ? '#1a1a2e' : '#222', border: `1px solid ${enabled ? '#ffd700' : '#444'}`,
                color: enabled ? '#ffd700' : '#555',
            });
            btn.disabled = !enabled;
            btn.onclick = onClick;
            return btn;
        };

        const sleepBtn = makeServiceBtn('Sleep', SLEEP_COST, shuckles >= SLEEP_COST && this.getHp() < this.maxHp, () => {
            this.onSleep?.();
            this.render();
        });
        svcRow.appendChild(sleepBtn);

        const trainBtn = makeServiceBtn('Train (+20 XP)', TRAIN_COST, shuckles >= TRAIN_COST, () => {
            this.onTrain?.();
            this.render();
        });
        svcRow.appendChild(trainBtn);

        const escortEnabled = shuckles >= ESCORT_COST && this.towns.length > 0;
        const escortBtn = makeServiceBtn('Escort to Town', ESCORT_COST, escortEnabled, () => {
            this.showEscortMenu();
        });
        svcRow.appendChild(escortBtn);

        this.contentEl.appendChild(svcRow);

        // Escort sub-menu (if open)
        if (this.escortSubMenu) {
            this.contentEl.appendChild(this.escortSubMenu);
        }
    }

    private showEscortMenu() {
        const sub = document.createElement('div');
        Object.assign(sub.style, {
            background: '#111', border: '1px solid #ffd700', padding: '12px',
            marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px',
        });
        const subTitle = document.createElement('div');
        subTitle.innerText = 'Choose Destination:';
        Object.assign(subTitle.style, { fontSize: '9px', color: '#ffd700', marginBottom: '4px' });
        sub.appendChild(subTitle);

        for (const town of this.towns) {
            const btn = document.createElement('button');
            btn.innerText = town.name ?? town.id;
            Object.assign(btn.style, {
                fontFamily: '"Press Start 2P", monospace', fontSize: '9px',
                padding: '6px 10px', cursor: 'pointer', background: '#1a2a1a',
                border: '1px solid #555', color: '#aaffaa', textAlign: 'left',
            });
            btn.onclick = () => {
                this.onEscort?.(town.id);
                this.hide();
            };
            sub.appendChild(btn);
        }

        const cancelBtn = document.createElement('button');
        cancelBtn.innerText = 'Cancel';
        Object.assign(cancelBtn.style, {
            fontFamily: '"Press Start 2P", monospace', fontSize: '9px',
            padding: '6px 10px', cursor: 'pointer', background: '#222',
            border: '1px solid #444', color: '#888',
        });
        cancelBtn.onclick = () => {
            this.escortSubMenu = null;
            this.render();
        };
        sub.appendChild(cancelBtn);

        this.escortSubMenu = sub;
        this.render();
    }
}
