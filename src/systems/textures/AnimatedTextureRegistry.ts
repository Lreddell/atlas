export interface AnimatedTextureFrame { textureId: string; duration: number }
export interface AnimatedTextureDefinition { id: string; frames: AnimatedTextureFrame[]; interpolate?: boolean }

class AnimatedTextureRegistry {
    private definitions = new Map<string, AnimatedTextureDefinition>();
    register(definition: AnimatedTextureDefinition): void {
        if (definition.frames.length === 0 || definition.frames.some((frame) => frame.duration <= 0)) {
            throw new Error(`Animated texture ${definition.id} needs positive-duration frames`);
        }
        this.definitions.set(definition.id, structuredClone(definition));
    }
    frameAt(id: string, tick: number): AnimatedTextureFrame | undefined {
        const definition = this.definitions.get(id);
        if (!definition) return undefined;
        const total = definition.frames.reduce((sum, frame) => sum + frame.duration, 0);
        let cursor = ((tick % total) + total) % total;
        for (const frame of definition.frames) {
            if (cursor < frame.duration) return frame;
            cursor -= frame.duration;
        }
        return definition.frames[0];
    }
}

export const animatedTextures = new AnimatedTextureRegistry();
