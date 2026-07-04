import { BlockType } from '../../../types';

export interface TemplateBlock { x: number; y: number; z: number; type: BlockType; metadata?: number }
export interface VoxelTemplate { id: string; sizeX: number; sizeY: number; sizeZ: number; blocks: TemplateBlock[] }
export interface TemplatePlacement { x: number; y: number; z: number; rotation?: 0 | 1 | 2 | 3; mirror?: boolean }

export function transformTemplateBlock(block: TemplateBlock, template: VoxelTemplate, placement: TemplatePlacement): TemplateBlock {
    let x = placement.mirror ? template.sizeX - 1 - block.x : block.x;
    let z = block.z;
    const rotation = placement.rotation ?? 0;
    for (let i = 0; i < rotation; i++) {
        const nextX = template.sizeZ - 1 - z;
        z = x; x = nextX;
    }
    return { ...block, x: placement.x + x, y: placement.y + block.y, z: placement.z + z };
}

export function placeVoxelTemplate(
    template: VoxelTemplate,
    placement: TemplatePlacement,
    setBlock: (block: TemplateBlock) => void,
    clip?: { minX: number; maxX: number; minZ: number; maxZ: number },
): void {
    for (const source of template.blocks) {
        const block = transformTemplateBlock(source, template, placement);
        if (clip && (block.x < clip.minX || block.x > clip.maxX || block.z < clip.minZ || block.z > clip.maxZ)) continue;
        setBlock(block);
    }
}
