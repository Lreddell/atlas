
import React from 'react';
import { ItemStack, BlockType } from '../../types';
import { BLOCKS, ATLAS_COLS } from '../../data/blocks';
import { getAtlasURL, ATLAS_STRIDE, ATLAS_PADDING, getAtlasDimensions } from '../../utils/textures';
import { resolveTexture } from '../../systems/world/textureResolver';

interface SlotProps {
  item: ItemStack | null;
  selected?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
  onAuxClick?: (e: React.MouseEvent) => void;
  onMouseEnter?: (e: React.MouseEvent) => void;
  onMouseLeave?: (e: React.MouseEvent) => void;
  onMouseDown?: (e: React.MouseEvent) => void;
  onMouseUp?: (e: React.MouseEvent) => void;
  size?: 'large' | 'small';
  isCursor?: boolean;
}

export const Slot: React.FC<SlotProps> = ({ 
    item, selected, onClick, onContextMenu, onDoubleClick, onAuxClick,
    onMouseEnter, onMouseLeave, onMouseDown, onMouseUp, size = 'large', isCursor = false 
}) => {
  const blockDef = item ? BLOCKS[item.type] : null;
  const atlasURL = getAtlasURL();
  const { width } = getAtlasDimensions(); // Real POT width of texture

  const getFaceStyle = (texIdx: number, brightness: number, displaySize: number) => {
      if (!atlasURL) return {};
      
      const col = texIdx % ATLAS_COLS;
      const row = Math.floor(texIdx / ATLAS_COLS);
      
      // Calculate scaling factor between atlas logic and display logic
      // We want to show a 16x16 logical tile at 'displaySize' pixels
      const scale = displaySize / 16;
      
      // Calculate background size: The full atlas width, scaled up
      const bgSize = width * scale;
      
      // Calculate offset: Where is the PADDED inner content in the atlas?
      // It is at col*STRIDE + PADDING
      const offsetX = (col * ATLAS_STRIDE + ATLAS_PADDING) * scale;
      const offsetY = (row * ATLAS_STRIDE + ATLAS_PADDING) * scale;

      return {
          backgroundImage: `url(${atlasURL})`,
          backgroundSize: `${bgSize}px`, 
          backgroundPosition: `-${offsetX}px -${offsetY}px`,
          filter: `brightness(${brightness})`,
          imageRendering: 'pixelated' as const,
          backfaceVisibility: 'hidden' as const
      };
  };

  const renderContent = () => {
      if (!item || !blockDef) return null;

      // Determine if we should render as 3D Block or 2D Item
      const is3D = !blockDef.isItem && 
                   item.type !== BlockType.TORCH && 
                   item.type !== BlockType.SAPLING &&
                   item.type !== BlockType.SPRUCE_SAPLING &&
                   item.type !== BlockType.BIRCH_SAPLING &&
                   item.type !== BlockType.CHERRY_SAPLING &&
                   item.type !== BlockType.WATER && 
                   item.type !== BlockType.LAVA &&
                   item.type !== BlockType.DEAD_BUSH &&
                   item.type !== BlockType.GRASS_PLANT &&
                   item.type !== BlockType.ROSE &&
                   item.type !== BlockType.DANDELION &&
                   item.type !== BlockType.DEBUG_CROSS &&
                   item.type !== BlockType.WHEAT_SEEDS &&
                   item.type !== BlockType.PINK_FLOWER;

      if (is3D) {
          // Top Face (dy=1)
          const topTex = resolveTexture(item.type, 'top', 0, 1, 0, 0).texIdx;
          // Front Face (dz=1) - Visual Right Side
          const frontTex = resolveTexture(item.type, 'front', 0, 0, 1, 0).texIdx;
          // Left Face (dx=-1) - Visual Left Side
          const leftTex = resolveTexture(item.type, 'left', -1, 0, 0, 0).texIdx;
          
          const cubeSize = 16; 
          const half = cubeSize / 2;
          const baseScale = size === 'large' ? 1.4 : 1.0; 
          
          return (
              <div 
                className="pointer-events-none"
                style={{
                    width: `${cubeSize}px`,
                    height: `${cubeSize}px`,
                    position: 'relative',
                    transformStyle: 'preserve-3d',
                    transform: `translateY(0%) scale(${baseScale}) rotateX(-30deg) rotateY(45deg)` 
                }}
              >
                  {/* Top Face */}
                  <div style={{
                      position: 'absolute', width: '100%', height: '100%',
                      transform: `rotateX(90deg) translateZ(${half}px)`,
                      ...getFaceStyle(topTex, 1.2, cubeSize)
                  }} />

                  {/* Front Face (Visual Right) */}
                   <div style={{
                      position: 'absolute', width: '100%', height: '100%',
                      transform: `translateZ(${half}px)`,
                      ...getFaceStyle(frontTex, 0.9, cubeSize)
                  }} />

                  {/* Left Face (Visual Left) */}
                  <div style={{
                      position: 'absolute', width: '100%', height: '100%',
                      transform: `rotateY(-90deg) translateZ(${half}px)`,
                      ...getFaceStyle(leftTex, 0.6, cubeSize)
                  }} />
              </div>
          );
      } else {
          // 2D Item / Sprite Render
          const pxSize = size === 'large' ? 36 : 28; 
          const texSlot = blockDef.textureSlot || 0;
          return (
              <div 
                  className="pointer-events-none"
                  style={{
                      width: `${pxSize}px`,
                      height: `${pxSize}px`,
                      ...getFaceStyle(texSlot, 1.0, pxSize)
                  }}
              />
          );
      }
  };

  if (isCursor) {
      return (
        <div className="relative w-12 h-12 flex items-center justify-center pointer-events-none">
            {renderContent()}
            {item && item.count > 1 && (
                <span className="absolute bottom-1 right-1 text-white text-[14px] font-bold drop-shadow-[0_1px_1px_rgba(0,0,0,1)] select-none z-20">
                    {item.count}
                </span>
            )}
        </div>
      );
  }

  return (
    <div 
        onClick={onClick}
        onContextMenu={onContextMenu}
        onDoubleClick={onDoubleClick}
        onAuxClick={onAuxClick}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        className={`
            relative bg-[#8b8b8b] border-2 border-t-[#373737] border-l-[#373737] border-b-[#ffffff] border-r-[#ffffff]
            flex items-center justify-center cursor-pointer hover:bg-[#a0a0a0]
            ${size === 'large' ? 'w-12 h-12' : 'w-9 h-9'}
            ${selected ? 'border-4 border-white shadow-lg z-10' : ''}
        `}
    >
        {renderContent()}

        {item && item.count > 1 && (
            <span className="absolute bottom-1 right-1 text-white text-[12px] font-bold drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] select-none pointer-events-none z-20">
                {item.count}
            </span>
        )}
    </div>
  );
};