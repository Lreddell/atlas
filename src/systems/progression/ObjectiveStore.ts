export interface Objective {
    id: string;
    title: string;
    target: number;
    progress: number;
    completed: boolean;
}

export class ObjectiveStore {
    private objectives = new Map<string, Objective>();
    define(id: string, title: string, target = 1): void {
        if (!this.objectives.has(id)) this.objectives.set(id, { id, title, target, progress: 0, completed: false });
    }
    advance(id: string, amount = 1): void {
        const objective = this.objectives.get(id);
        if (!objective || objective.completed) return;
        objective.progress = Math.min(objective.target, objective.progress + amount);
        objective.completed = objective.progress >= objective.target;
    }
    list(): Objective[] { return Array.from(this.objectives.values()).map((value) => ({ ...value })); }
    serialize(): Objective[] { return this.list(); }
    restore(data: unknown): void {
        this.objectives.clear();
        if (!Array.isArray(data)) return;
        for (const value of data) if (value?.id && value?.title) this.objectives.set(value.id, { ...value });
    }
}

export const objectives = new ObjectiveStore();
