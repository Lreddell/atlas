export const ECHO_PREVIEW_SECONDS = 0.85;
export const ECHO_PREVIEW_MILLISECONDS = ECHO_PREVIEW_SECONDS * 1000;

interface ScheduledEcho {
    receiver: string;
    resolvesAt: number;
    order: number;
    resolve: () => void;
}

export class ResonantEchoScheduler {
    private pending: ScheduledEcho[] = [];
    private receivers = new Set<string>();
    private nextOrder = 0;

    schedule(receiver: string, now: number, preview: () => void, resolve: () => void): boolean {
        if (this.receivers.has(receiver)) return false;
        this.receivers.add(receiver);
        this.pending.push({
            receiver,
            resolvesAt: now + ECHO_PREVIEW_SECONDS,
            order: this.nextOrder++,
            resolve,
        });
        preview();
        return true;
    }

    tick(now: number): void {
        if (this.pending.length === 0) return;
        this.pending.sort((a, b) => a.resolvesAt - b.resolvesAt || a.order - b.order);
        let due = 0;
        while (due < this.pending.length && this.pending[due].resolvesAt <= now) due += 1;
        if (due === 0) return;
        const callbacks = this.pending.splice(0, due);
        for (const echo of callbacks) {
            this.receivers.delete(echo.receiver);
            echo.resolve();
        }
    }

    cancel(receiver: string): boolean {
        if (!this.receivers.delete(receiver)) return false;
        this.pending = this.pending.filter((echo) => echo.receiver !== receiver);
        return true;
    }

    reset(): void {
        this.pending = [];
        this.receivers.clear();
        this.nextOrder = 0;
    }
}
