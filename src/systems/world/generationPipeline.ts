export type GenerationPhase = 'terrain' | 'surface' | 'carvers' | 'ores' | 'vegetation' | 'features' | 'structures' | 'lighting';

export interface GeneratedChunkBuffers {
    blocks: Uint8Array;
    light: Uint8Array;
    meta: Uint8Array;
}

export interface GenerationStageContext extends GeneratedChunkBuffers {
    cx: number;
    cz: number;
}

export interface GenerationStage {
    id: string;
    phase: GenerationPhase;
    priority: number;
    run(context: GenerationStageContext): void;
}

const stages = new Map<string, GenerationStage>();

export function registerGenerationStage(stage: GenerationStage): () => void {
    if (stages.has(stage.id)) throw new Error(`Duplicate generation stage: ${stage.id}`);
    stages.set(stage.id, stage);
    return () => stages.delete(stage.id);
}

export function runGenerationStages(phase: GenerationPhase, context: GenerationStageContext): void {
    const selected = Array.from(stages.values())
        .filter((stage) => stage.phase === phase)
        .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
    for (const stage of selected) stage.run(context);
}

export function listGenerationStages(): readonly GenerationStage[] {
    return Array.from(stages.values()).sort((a, b) => a.phase.localeCompare(b.phase) || a.priority - b.priority);
}
