// lib/personalLib/chatApi/connection.watcher.ts
//
// Watches network connectivity changes and pauses/resumes the outbox queue.
// Uses @react-native-community/netinfo — addEventListener returns an unsubscribe fn.
//
// start() is called once at boot (storage.init.ts) after login is confirmed.
// stop() is called on logout.

import NetInfo from '@react-native-community/netinfo';
import type { NetInfoState } from '@react-native-community/netinfo';
import { outboxQueue } from './outbox.queue';

const TAG = '[ConnectionWatcher]';

type ConnectionListener = (isOnline: boolean) => void;

class ConnectionWatcher {
    private _unsubscribe: (() => void) | null = null;
    private _isOnline = true;
    private _listeners = new Set<ConnectionListener>();

    /** Current online status */
    get isOnline(): boolean { return this._isOnline; }

    /**
     * Start watching network state. Safe to call multiple times — will no-op if already started.
     */
    start(): void {
        if (this._unsubscribe) return; // Already watching

        this._unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
            const wasOnline = this._isOnline;
            // Consider online only if both connected AND internet is reachable
            // isInternetReachable can be null (unknown) — treat as online
            this._isOnline = !!(state.isConnected && state.isInternetReachable !== false);

            if (wasOnline !== this._isOnline) {
                console.log(`${TAG} State changed: ${wasOnline ? 'ONLINE' : 'OFFLINE'} → ${this._isOnline ? 'ONLINE' : 'OFFLINE'} (type=${state.type})`);

                if (this._isOnline) {
                    outboxQueue.resume();
                } else {
                    outboxQueue.pause();
                }

                // Notify subscribers
                for (const listener of this._listeners) {
                    try { listener(this._isOnline); } catch { /* ignore */ }
                }
            }
        });

        console.log(`${TAG} Started`);
    }

    /**
     * Stop watching network state. Called on logout.
     */
    stop(): void {
        if (this._unsubscribe) {
            this._unsubscribe();
            this._unsubscribe = null;
        }
        this._listeners.clear();
        console.log(`${TAG} Stopped`);
    }

    /**
     * Subscribe to online/offline transitions.
     * @returns Unsubscribe function.
     */
    subscribe(listener: ConnectionListener): () => void {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }
}

// Singleton
export const connectionWatcher = new ConnectionWatcher();
