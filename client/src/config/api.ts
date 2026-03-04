export const API_BASE: string = (import.meta.env.VITE_API_URL as string) ?? 'http://localhost:3000';

const SESSION_KEY = 'miniburger_session';
function getOrCreateSessionId(): string {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem(SESSION_KEY, id);
    }
    return id;
}
export const sessionId = getOrCreateSessionId();

// Wrapper that merges in any headers needed for the current host (e.g. ngrok browser-warning bypass).
export function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('ngrok-skip-browser-warning', '1');
    headers.set('x-session-id', sessionId);
    return fetch(url, { ...init, headers });
}
