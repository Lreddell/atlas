export interface ModPackMeta {
    id: string;
    name: string;
    version: string;
    author: string;
    description: string;
    enabled: boolean;
    createdAt: number;
    updatedAt: number;
}

export interface TextureEntry {
    id: string;
    name: string;
    data: number[]; // RGBA array 16*16*4 = 1024 elements
    lastModified: number;
}

export interface BlockDefinition {
    id: string;
    name: string;
    category: 'building' | 'natural' | 'functional' | 'tools' | 'food' | 'ingredients';
    hardness: number;
    renderModel: 'cube' | 'cross';
    renderLayer: 'opaque' | 'cutout' | 'transparent';
    collision: 'solid' | 'none';
    lightLevel: number;
    soundGroup: string;
    textures: {
        mode: 'all' | 'top-bottom-side' | 'six-faces';
        all?: string;
        top?: string;
        bottom?: string;
        side?: string;
        front?: string;
        back?: string;
        left?: string;
        right?: string;
    };
}

export interface ItemDefinition {
    id: string;
    name: string;
    category: 'building' | 'natural' | 'functional' | 'tools' | 'food' | 'ingredients';
    maxStack: number;
    textureId: string;
    behavior: {
        type: 'basic' | 'placeBlock';
        blockId?: string;
    };
}

export interface RecipeDefinition {
    id: string;
    type: 'shaped' | 'shapeless';
    gridSize: 2 | 3;
    pattern: (string | null)[]; // IDs from blocks or items
    output: {
        id: string;
        count: number;
    };
}

export interface ModPack {
    meta: ModPackMeta;
    textures: Record<string, TextureEntry>;
    blocks: Record<string, BlockDefinition>;
    items: Record<string, ItemDefinition>;
    recipes: Record<string, RecipeDefinition>;
}

export type EditorTab = 'tutorial' | 'textures' | 'blocks' | 'items' | 'recipes' | 'validation';
