import { HOW_TO_HTML } from './howToContent';

export class StartScreenUI {
    private container: HTMLDivElement;
    private mainPanel: HTMLDivElement;
    private instructionsPanel: HTMLDivElement;
    private settingsPanel: HTMLDivElement;
    private firstInteract = false;

    public onStart: (() => void) | null = null;
    public onFirstInteract: (() => void) | null = null;
    public onSensitivityChange: ((v: number) => void) | null = null;
    public onVolumeChange: ((v: number) => void) | null = null;

    constructor() {
        this.container = document.createElement('div');
        Object.assign(this.container.style, {
            position: 'fixed',
            top: '0', left: '0',
            width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.93)',
            display: 'none',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: '200',
            fontFamily: "'Press Start 2P', monospace",
        });

        this.mainPanel = this.buildMainPanel();
        this.instructionsPanel = this.buildInstructionsPanel();
        this.settingsPanel = this.buildSettingsPanel();

        this.container.appendChild(this.mainPanel);
        this.container.appendChild(this.instructionsPanel);
        this.container.appendChild(this.settingsPanel);
        document.body.appendChild(this.container);
    }

    private handleFirstInteract() {
        if (!this.firstInteract) {
            this.firstInteract = true;
            this.onFirstInteract?.();
        }
    }

    private makeButton(label: string, onClick: () => void): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.textContent = label;
        Object.assign(btn.style, {
            fontFamily: "'Press Start 2P', monospace",
            fontSize: '14px',
            color: 'white',
            background: '#222',
            border: '2px solid #fff',
            padding: '14px 32px',
            margin: '8px',
            cursor: 'pointer',
            minWidth: '220px',
        });
        btn.addEventListener('mouseenter', () => { btn.style.background = '#444'; });
        btn.addEventListener('mouseleave', () => { btn.style.background = '#222'; });
        btn.addEventListener('click', () => {
            this.handleFirstInteract();
            onClick();
        });
        return btn;
    }

    private buildMainPanel(): HTMLDivElement {
        const panel = document.createElement('div');
        Object.assign(panel.style, {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
        });

        const title = document.createElement('div');
        title.textContent = '8-bit Demon Hunter';
        Object.assign(title.style, {
            fontSize: '36px',
            color: '#FFD700',
            textShadow: '3px 3px 0 #000',
            marginBottom: '8px',
            letterSpacing: '2px',
        });

        const subtitle = document.createElement('div');
        subtitle.textContent = 'A Detective RPG';
        Object.assign(subtitle.style, {
            fontSize: '12px',
            color: '#aaa',
            marginBottom: '40px',
        });

        const btnStart = this.makeButton('START GAME', () => this.onStart?.());
        Object.assign(btnStart.style, {
            fontSize: '16px',
            padding: '16px 40px',
            borderColor: '#FFD700',
            color: '#FFD700',
        });
        btnStart.addEventListener('mouseenter', () => { btnStart.style.background = '#443300'; });
        btnStart.addEventListener('mouseleave', () => { btnStart.style.background = '#222'; });

        const btnHow = this.makeButton('HOW TO PLAY', () => this.showPanel('instructions'));
        const btnSettings = this.makeButton('SETTINGS', () => this.showPanel('settings'));

        panel.appendChild(title);
        panel.appendChild(subtitle);
        panel.appendChild(btnStart);
        panel.appendChild(btnHow);
        panel.appendChild(btnSettings);
        return panel;
    }

    private buildInstructionsPanel(): HTMLDivElement {
        const panel = document.createElement('div');
        Object.assign(panel.style, {
            display: 'none',
            flexDirection: 'column',
            alignItems: 'center',
            width: '90%',
            maxWidth: '700px',
        });

        const title = document.createElement('div');
        title.textContent = 'HOW TO PLAY';
        Object.assign(title.style, {
            fontSize: '22px',
            color: '#FFD700',
            marginBottom: '20px',
        });

        const content = document.createElement('div');
        Object.assign(content.style, {
            overflowY: 'auto',
            maxHeight: '65vh',
            width: '100%',
            background: '#111',
            border: '2px solid #444',
            padding: '20px 24px',
            boxSizing: 'border-box',
            lineHeight: '2',
            fontSize: '11px',
            color: '#ddd',
            textAlign: 'left',
        });

        content.innerHTML = HOW_TO_HTML;

        const btnBack = this.makeButton('BACK', () => this.showPanel('main'));
        Object.assign(btnBack.style, { marginTop: '16px' });

        panel.appendChild(title);
        panel.appendChild(content);
        panel.appendChild(btnBack);
        return panel;
    }

    private buildSettingsPanel(): HTMLDivElement {
        const panel = document.createElement('div');
        Object.assign(panel.style, {
            display: 'none',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0px',
            width: '90%',
            maxWidth: '420px',
        });

        const title = document.createElement('div');
        title.textContent = 'SETTINGS';
        Object.assign(title.style, {
            fontSize: '22px',
            color: '#FFD700',
            marginBottom: '32px',
        });

        const settingsBox = document.createElement('div');
        Object.assign(settingsBox.style, {
            background: '#111',
            border: '2px solid #444',
            padding: '24px 32px',
            width: '100%',
            boxSizing: 'border-box',
        });

        const makeSetting = (labelText: string, min: string, max: string, step: string, localKey: string, defaultVal: string, format: (v: number) => string, onChange: (v: number) => void) => {
            const savedVal = parseFloat(localStorage.getItem(localKey) ?? defaultVal);

            const label = document.createElement('label');
            label.textContent = labelText;
            Object.assign(label.style, {
                display: 'block',
                fontSize: '10px',
                color: '#aaa',
                marginBottom: '8px',
            });

            const row = document.createElement('div');
            Object.assign(row.style, {
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '24px',
            });

            const slider = document.createElement('input');
            slider.type = 'range';
            slider.min = min;
            slider.max = max;
            slider.step = step;
            slider.value = String(savedVal);
            Object.assign(slider.style, { flex: '1', cursor: 'pointer' });

            const valueSpan = document.createElement('span');
            valueSpan.textContent = format(savedVal);
            Object.assign(valueSpan.style, {
                fontSize: '10px',
                color: 'white',
                minWidth: '36px',
                textAlign: 'right',
            });

            slider.addEventListener('input', () => {
                const v = parseFloat(slider.value);
                valueSpan.textContent = format(v);
                localStorage.setItem(localKey, String(v));
                onChange(v);
            });

            row.appendChild(slider);
            row.appendChild(valueSpan);
            settingsBox.appendChild(label);
            settingsBox.appendChild(row);
        };

        makeSetting(
            'MOUSE SENSITIVITY',
            '0.2', '2.0', '0.1', 'sensitivity', '1.0',
            v => v.toFixed(1),
            v => this.onSensitivityChange?.(v)
        );

        makeSetting(
            'VOLUME',
            '0', '1.0', '0.05', 'volume', '1.0',
            v => v.toFixed(2),
            v => this.onVolumeChange?.(v)
        );

        const btnBack = this.makeButton('BACK', () => this.showPanel('main'));
        Object.assign(btnBack.style, { marginTop: '16px' });

        panel.appendChild(title);
        panel.appendChild(settingsBox);
        panel.appendChild(btnBack);
        return panel;
    }

    private showPanel(which: 'main' | 'instructions' | 'settings') {
        this.mainPanel.style.display = which === 'main' ? 'flex' : 'none';
        this.instructionsPanel.style.display = which === 'instructions' ? 'flex' : 'none';
        this.settingsPanel.style.display = which === 'settings' ? 'flex' : 'none';
    }

    public show() {
        this.container.style.display = 'flex';
        this.showPanel('main');
    }

    public hide() {
        this.container.style.display = 'none';
    }
}
