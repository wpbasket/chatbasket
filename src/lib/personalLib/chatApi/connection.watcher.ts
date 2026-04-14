// lib/personalLib/chatApi/connection.watcher.ts
//
// Watches network connectivity changes via the global network$ state
// and pauses/resumes the outbox queue.
//
// start() is called once at boot (storage.init.ts) after login is confirmed.
// stop() is called on logout.

import { network$ } from '@/state/tools/state.network';
import { observe } from '@legendapp/state';
import { outboxQueue } from './outbox.queue';

const TAG = '[ConnectionWatcher]';

type ConnectionListener = (isOnline: boolean) => void;

class ConnectionWatcher {
    private _unsub: (() => void) | null = null;
    private _listeners = new Set<ConnectionListener>();

    /** Current online status from the global source of truth */
    get isOnline(): boolean { 
        return network$.isConnected.peek(); 
    }

    /**
     * Start watching global network state.
     */
    start(): void {
        if (this._unsub) return; // Already watching

        // Official Legend State v3 pattern: observe() automatically runs once 
        // at the start and then whenever the accessed observables change.
        this._unsub = observe(() => {
            const isOnline = network$.isConnected.get();
            this.handleStateChange(isOnline);
        });

        console.log(`${TAG} Started`);
    }

    private handleStateChange(isOnline: boolean): void {
        console.log(`${TAG} State changed → ${isOnline ? 'ONLINE' : 'OFFLINE'}`);

        if (isOnline) {
            outboxQueue.resume();
        } else {
            outboxQueue.pause();
        }

        // Notify local subscribers
        for (const listener of this._listeners) {
            try { listener(isOnline); } catch { /* ignore */ }
        }
    }

    /**
     * Stop watching network state. Called on logout.
     */
    stop(): void {
        if (this._unsub) {
            this._unsub();
            this._unsub = null;
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
