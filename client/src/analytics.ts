import { API_BASE, apiFetch } from './config/api';

const enabled = location.hostname !== 'localhost';

type EventEntry = { name: string; params?: Record<string, string | number | boolean>; timestamp: number };
const queue: EventEntry[] = [];

export function trackEvent(name: string, params?: Record<string, string | number | boolean>) {
    if (enabled) queue.push({ name, params, timestamp: Date.now() });
}

export function flushEvents() {
    if (!enabled || queue.length === 0) return;
    const batch = queue.splice(0);
    apiFetch(`${API_BASE}/api/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: batch }),
    }).catch(() => {});
}
