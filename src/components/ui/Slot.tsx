
import React from 'react';
import { ItemStack, BlockType } from '../../types';
import { BLOCKS, ATLAS_COLS } from '../../data/blocks';
import {
  ATLAS_PADDING,
  ATLAS_STRIDE,
  ATLAS_UPDATED_EVENT,
  getAtlasCanvas,
  getAtlasDimensions,
  getAtlasURL,
} from '../../utils/textures';
import { resolveTexture } from '../../systems/world/textureResolver';
import { getShapeBoxes } from '../../systems/world/blockShapes';
import { getMaxDurability } from '../../systems/registry/itemStats';

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
  /** Render only the item, for surfaces such as creative category tabs. */
  bare?: boolean;
  /** Reproduce Minecraft's five-tick hotbar pop when a stack is added. */
  animateChanges?: boolean;
}

interface PixelPerfectItemIconProps {
  texSlot: number;
  targetSize: number;
}

const PixelPerfectItemIcon: React.FC<PixelPerfectItemIconProps> = ({ texSlot, targetSize }) => {
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useLayoutEffect(() => {
      const wrapper = wrapperRef.current;
      const canvas = canvasRef.current;
      if (!wrapper || !canvas) return;

      const draw = () => {
          const atlasCanvas = getAtlasCanvas();
          if (!atlasCanvas) return;

          const ancestorScale = wrapper.offsetWidth > 0
              ? wrapper.getBoundingClientRect().width / wrapper.offsetWidth
              : 1;
          const physicalPixelsPerCssPixel = window.devicePixelRatio * ancestorScale;
          const requestedScale = (targetSize * physicalPixelsPerCssPixel) / 16;
          const sourcePixelScale = Math.max(
              1,
              targetSize <= 32 ? Math.round(requestedScale) : Math.ceil(requestedScale)
          );
          const backingSize = 16 * sourcePixelScale;
          const cssSize = backingSize / physicalPixelsPerCssPixel;

          canvas.width = backingSize;
          canvas.height = backingSize;
          canvas.style.width = `${cssSize}px`;
          canvas.style.height = `${cssSize}px`;
          canvas.style.transform = '';

          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          ctx.imageSmoothingEnabled = false;
          ctx.clearRect(0, 0, backingSize, backingSize);
          const col = texSlot % ATLAS_COLS;
          const row = Math.floor(texSlot / ATLAS_COLS);
          ctx.drawImage(
              atlasCanvas,
              col * ATLAS_STRIDE + ATLAS_PADDING,
              row * ATLAS_STRIDE + ATLAS_PADDING,
              16,
              16,
              0,
              0,
              backingSize,
              backingSize
          );

          // Centering can land on a fractional device pixel. Nudge the finished
          // canvas onto the physical pixel grid so every texel stays uniform.
          const rect = canvas.getBoundingClientRect();
          const offsetX = (Math.round(rect.left * window.devicePixelRatio) - rect.left * window.devicePixelRatio)
              / physicalPixelsPerCssPixel;
          const offsetY = (Math.round(rect.top * window.devicePixelRatio) - rect.top * window.devicePixelRatio)
              / physicalPixelsPerCssPixel;
          canvas.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
      };

      draw();
      const resizeObserver = new ResizeObserver(draw);
      resizeObserver.observe(wrapper);
      window.addEventListener('resize', draw);
      window.addEventListener(ATLAS_UPDATED_EVENT, draw);

      return () => {
          resizeObserver.disconnect();
          window.removeEventListener('resize', draw);
          window.removeEventListener(ATLAS_UPDATED_EVENT, draw);
      };
  }, [targetSize, texSlot]);

  return (
      <div
          ref={wrapperRef}
          className="pointer-events-none flex shrink-0 items-center justify-center"
          style={{ width: `${targetSize}px`, height: `${targetSize}px` }}
      >
          <canvas
              ref={canvasRef}
              width={16}
              height={16}
              data-texture-slot={texSlot}
              className="pointer-events-none select-none"
              style={{ width: '100%', height: '100%', imageRendering: 'pixelated' }}
          />
      </div>
  );
};

export const Slot: React.FC<SlotProps> = ({ 
    item, selected, onClick, onContextMenu, onDoubleClick, onAuxClick,
    onMouseEnter, onMouseLeave, onMouseDown, onMouseUp, size = 'large', isCursor = false,
    bare = false, animateChanges = false,
}) => {
  const contentRef = React.useRef<HTMLDivElement>(null);
  const previousItemRef = React.useRef<{ type: BlockType; count: number } | null | undefined>(undefined);
  const currentItemType = item?.type;
  const currentItemCount = item?.count;
  const blockDef = item ? BLOCKS[item.type] : null;
  const atlasURL = getAtlasURL();
  const { width } = getAtlasDimensions(); // Real POT width of texture

  // Durability bar: shown only for a damaged tool/weapon (current < max).
  const maxDurability = item ? getMaxDurability(item.type) : undefined;
  const curDurability = item?.instance?.durability;
  const showDurability = maxDurability !== undefined && curDurability !== undefined && curDurability < maxDurability;
  const durabilityFrac = showDurability ? Math.max(0, curDurability / maxDurability) : 0;
  const durabilityColor = `rgb(${Math.round((1 - durabilityFrac) * 255)}, ${Math.round(durabilityFrac * 255)}, 0)`;
  const durabilityDimColor = `rgb(${Math.round((1 - durabilityFrac) * 63)}, 63, 0)`;
  const durabilityBar = showDurability ? (
      <div className="absolute bottom-[10px] left-1/2 h-1 w-[26px] -translate-x-1/2 bg-black pointer-events-none z-20">
          <div className="absolute left-0 top-0 h-0.5 w-6" style={{ background: durabilityDimColor }} />
          <div
              className="absolute left-0 top-0 h-0.5"
              style={{ width: `${Math.round(durabilityFrac * 13) * 2}px`, background: durabilityColor }}
          />
      </div>
  ) : null;

  React.useLayoutEffect(() => {
      const previous = previousItemRef.current;
      const current = currentItemType === undefined || currentItemCount === undefined
          ? null
          : { type: currentItemType, count: currentItemCount };
      const shouldPop = animateChanges
          && previous !== undefined
          && current !== null
          && (previous === null || (previous.type === current.type && current.count > previous.count));

      previousItemRef.current = current;
      if (!shouldPop || !contentRef.current) return;

      const content = contentRef.current;
      content.classList.remove('atlas-item-pop');
      void content.offsetWidth;
      content.classList.add('atlas-item-pop');
  }, [animateChanges, currentItemCount, currentItemType]);

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
          ...(brightness === 1 ? {} : { filter: `brightness(${brightness})` }),
          imageRendering: 'pixelated' as const,
          backfaceVisibility: 'hidden' as const
      };
  };

  const renderContent = () => {
      if (!item || !blockDef) return null;

      // Slabs / stairs: render the actual partial-box silhouette (isometric) so the
      // icon reads as a half-block / stair shape instead of a full cube.
      if (blockDef.shape) {
          const parentType = blockDef.textureParent ?? item.type;
          const topTex = resolveTexture(parentType, 'top', 0, 1, 0, 0).texIdx;
          const frontTex = resolveTexture(parentType, 'front', 0, 0, 1, 0).texIdx;
          const leftTex = resolveTexture(parentType, 'left', -1, 0, 0, 0).texIdx;
          const baseScale = size === 'large' ? 1.4 : 1.25;
          const U = 16;
          // A fixed, readable orientation for the icon (step facing front-right).
          // Use a non-overlapping decomposition so faces don't seam: a slab is one
          // box; a stair is a tall back half plus a low front tread (instead of a
          // full bottom slab + step, whose slab-top would show through under the step).
          const boxes: number[][] = blockDef.shape === 'stairs'
              ? [[0, 0, 0, 1, 1, 0.5], [0, 0, 0.5, 1, 0.5, 1]]
              : getShapeBoxes(item.type, 0);

          const faceEls: React.ReactNode[] = [];
          boxes.forEach((b, bi) => {
              const w = (b[3] - b[0]) * U, h = (b[4] - b[1]) * U, d = (b[5] - b[2]) * U;
              const cX = ((b[0] + b[3]) / 2 - 0.5) * U;
              const cY = (0.5 - (b[1] + b[4]) / 2) * U; // CSS Y is inverted (down positive)
              const cZ = ((b[2] + b[5]) / 2 - 0.5) * U;
              const faceBase: React.CSSProperties = { position: 'absolute', left: '50%', top: '50%' };
              // Top (+Y)
              faceEls.push(<div key={`t${bi}`} className="pointer-events-none" style={{ ...faceBase, width: `${w}px`, height: `${d}px`,
                  transform: `translate(-50%, -50%) translate3d(${cX}px, ${cY}px, ${cZ}px) rotateX(90deg) translateZ(${h / 2}px)`,
                  ...getFaceStyle(topTex, 1.2, U) }} />);
              // Front (+Z)
              faceEls.push(<div key={`f${bi}`} className="pointer-events-none" style={{ ...faceBase, width: `${w}px`, height: `${h}px`,
                  transform: `translate(-50%, -50%) translate3d(${cX}px, ${cY}px, ${cZ}px) translateZ(${d / 2}px)`,
                  ...getFaceStyle(frontTex, 0.9, U) }} />);
              // Left (-X)
              faceEls.push(<div key={`l${bi}`} className="pointer-events-none" style={{ ...faceBase, width: `${d}px`, height: `${h}px`,
                  transform: `translate(-50%, -50%) translate3d(${cX}px, ${cY}px, ${cZ}px) rotateY(-90deg) translateZ(${w / 2}px)`,
                  ...getFaceStyle(leftTex, 0.6, U) }} />);
          });

          return (
              <div className="pointer-events-none" style={{
                  width: `${U}px`, height: `${U}px`, position: 'relative',
                  transformStyle: 'preserve-3d',
                  transform: `scale(${baseScale}) rotateX(-30deg) rotateY(45deg)`
              }}>
                  {faceEls}
              </div>
          );
      }

      // Determine if we should render as 3D Block or 2D Item
      const is3D = !blockDef.isItem && 
                   item.type !== BlockType.TORCH && 
                   item.type !== BlockType.SAPLING &&
                   item.type !== BlockType.SPRUCE_SAPLING &&
                   item.type !== BlockType.BIRCH_SAPLING &&
                   item.type !== BlockType.CHERRY_SAPLING &&
                   item.type !== BlockType.JUNGLE_SAPLING &&
                   item.type !== BlockType.DARK_OAK_SAPLING &&
                   item.type !== BlockType.ACACIA_SAPLING &&
                   item.type !== BlockType.WATER &&
                   item.type !== BlockType.LAVA &&
                   item.type !== BlockType.DEAD_BUSH &&
                   item.type !== BlockType.GRASS_PLANT &&
                   item.type !== BlockType.ROSE &&
                   item.type !== BlockType.DANDELION &&
                   item.type !== BlockType.DEBUG_CROSS &&
                   item.type !== BlockType.WHEAT_SEEDS &&
                   item.type !== BlockType.PINK_FLOWER &&
                   item.type !== BlockType.POSITIVE_MAGNETITE_CRYSTAL &&
                   item.type !== BlockType.NEGATIVE_MAGNETITE_CRYSTAL &&
                   item.type !== BlockType.MAGNETIC_SPIKE &&
                   item.type !== BlockType.MAGNETIC_SHIELD_CRYSTAL &&
                   item.type !== BlockType.MAGNETITE_SHARD;

      if (is3D) {
          // Top Face (dy=1)
          const topTex = resolveTexture(item.type, 'top', 0, 1, 0, 0).texIdx;
          // Front Face (dz=1) - Visual Right Side
          const frontTex = resolveTexture(item.type, 'front', 0, 0, 1, 0).texIdx;
          // Left Face (dx=-1) - Visual Left Side
          const leftTex = resolveTexture(item.type, 'left', -1, 0, 0, 0).texIdx;
          
          const cubeSize = 16; 
          const half = cubeSize / 2;
          const baseScale = size === 'large' ? 1.4 : 1.25;
          
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
          // Draw synchronously from the generated atlas. The canvas renderer
          // snaps the 16px source to whole physical pixels.
          // Keep the 16px source on an exact 2x grid. The next whole-pixel
          // scale (48px) fills the slot edge-to-edge and reads oversized.
          const pxSize = 32;
          const texSlot = blockDef.textureSlot || 0;
          return (
              <PixelPerfectItemIcon
                  texSlot={texSlot}
                  targetSize={pxSize}
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
            group relative flex items-center justify-center
            ${size === 'large' ? 'w-12 h-12' : 'w-9 h-9'}
            ${bare
                ? 'pointer-events-none'
                : 'cursor-pointer bg-[#8b8b8b] border-2 border-t-[#373737] border-l-[#373737] border-b-[#ffffff] border-r-[#ffffff]'}
            ${selected ? 'z-10' : ''}
        `}
    >
        <div ref={contentRef} className="pointer-events-none flex items-center justify-center">
            {renderContent()}
        </div>

        {!bare && (
            <span className="absolute inset-0 z-10 pointer-events-none bg-white/30 opacity-0 group-hover:opacity-100" />
        )}

        {selected && !bare && (
            <span className="absolute -inset-1 z-30 pointer-events-none border-4 border-white shadow-lg" />
        )}

        {item && item.count > 1 && (
            <span className="absolute bottom-1 right-1 text-white text-[12px] font-bold drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] select-none pointer-events-none z-20">
                {item.count}
            </span>
        )}

        {durabilityBar}
    </div>
  );
};
