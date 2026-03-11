const BOMB_COST = 10;
const LOCKPICK_COST = 200;

export class BanditTradeUI {
    private container: HTMLElement;
    public isOpen: boolean = false;
    private purchased: boolean = false;

    public onBuy: ((item: 'bomb' | 'lockpick') => boolean) | null = null; // returns true if purchase succeeded
    public onClose: ((purchased: boolean) => void) | null = null;

    private getShuckles: () => number = () => 0;

    constructor() {
        this.container = document.createElement('div');
        Object.assign(this.container.style, {
            position: 'fixed', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(10,10,10,0.97)', border: '2px solid #aa8800',
            padding: '20px 28px', borderRadius: '4px',
            fontFamily: '"Press Start 2P", monospace', color: '#fff',
            fontSize: '10px', zIndex: '220', display: 'none',
            flexDirection: 'column', gap: '12px', minWidth: '280px',
            textAlign: 'center',
        });
        document.body.appendChild(this.container);
    }

    public show(getShuckles: () => number) {
        this.getShuckles = getShuckles;
        this.purchased = false;
        this.isOpen = true;
        this.container.style.display = 'flex';
        this.render();
    }

    public hide() {
        this.isOpen = false;
        this.container.style.display = 'none';
        this.onClose?.(this.purchased);
    }

    private render() {
        this.container.innerHTML = '';
        const shuckles = this.getShuckles();

        const title = document.createElement('div');
        title.innerText = 'BLACK MARKET';
        Object.assign(title.style, { color: '#aa8800', fontSize: '12px', marginBottom: '4px' });
        this.container.appendChild(title);

        const shucklesRow = document.createElement('div');
        shucklesRow.innerText = `\uD83D\uDC1A ${shuckles} Shuckles`;
        Object.assign(shucklesRow.style, { color: '#aaffaa', fontSize: '9px', marginBottom: '8px' });
        this.container.appendChild(shucklesRow);

        const makeItemRow = (label: string, cost: number, itemKey: 'bomb' | 'lockpick') => {
            const row = document.createElement('div');
            Object.assign(row.style, { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' });

            const nameEl = document.createElement('div');
            nameEl.innerText = `${label} (${cost}\uD83D\uDC1A)`;
            Object.assign(nameEl.style, { color: '#ddd', fontSize: '9px' });

            const canAfford = shuckles >= cost;
            const btn = document.createElement('button');
            btn.innerText = 'Buy';
            Object.assign(btn.style, {
                fontFamily: '"Press Start 2P", monospace', fontSize: '8px',
                padding: '4px 8px', cursor: canAfford ? 'pointer' : 'not-allowed',
                background: canAfford ? '#1a1a2e' : '#222',
                border: `1px solid ${canAfford ? '#ffd700' : '#444'}`,
                color: canAfford ? '#ffd700' : '#555',
            });
            btn.disabled = !canAfford;
            btn.onclick = () => {
                const success = this.onBuy?.(itemKey) ?? false;
                if (success) {
                    this.purchased = true;
                    this.render();
                }
            };

            row.appendChild(nameEl);
            row.appendChild(btn);
            return row;
        };

        this.container.appendChild(makeItemRow('Bomb', BOMB_COST, 'bomb'));
        this.container.appendChild(makeItemRow('Lockpick', LOCKPICK_COST, 'lockpick'));

        const leaveBtn = document.createElement('button');
        leaveBtn.innerText = 'Leave';
        Object.assign(leaveBtn.style, {
            fontFamily: '"Press Start 2P", monospace', fontSize: '9px',
            padding: '6px 12px', marginTop: '4px', cursor: 'pointer',
            background: '#222', border: '1px solid #555', color: '#888',
        });
        leaveBtn.onclick = () => this.hide();
        this.container.appendChild(leaveBtn);
    }
}
