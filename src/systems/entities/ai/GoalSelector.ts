export interface Goal {
    flags: readonly string[];
    canStart(): boolean;
    canContinue(): boolean;
    start(): void;
    tick(): void;
    stop(): void;
}

interface PrioritizedGoal { priority: number; goal: Goal; running: boolean }

/** Priority scheduler with mutually-exclusive control flags. Lower priority wins. */
export class GoalSelector {
    private goals: PrioritizedGoal[] = [];

    add(priority: number, goal: Goal): () => void {
        const entry = { priority, goal, running: false };
        this.goals.push(entry);
        this.goals.sort((a, b) => a.priority - b.priority);
        return () => {
            if (entry.running) entry.goal.stop();
            this.goals = this.goals.filter((value) => value !== entry);
        };
    }

    tick(): void {
        for (const entry of this.goals) {
            if (entry.running && !entry.goal.canContinue()) {
                entry.goal.stop();
                entry.running = false;
            }
        }
        const claimed = new Set(this.goals.filter((entry) => entry.running).flatMap((entry) => entry.goal.flags));
        for (const entry of this.goals) {
            if (entry.running || entry.goal.flags.some((flag) => claimed.has(flag)) || !entry.goal.canStart()) continue;
            entry.running = true;
            entry.goal.start();
            entry.goal.flags.forEach((flag) => claimed.add(flag));
        }
        for (const entry of this.goals) if (entry.running) entry.goal.tick();
    }

    clear(): void {
        for (const entry of this.goals) if (entry.running) entry.goal.stop();
        this.goals = [];
    }
}
