
import React from 'react';
import { ItemStack, BlockType } from '../../types';
import { BLOCKS, ATLAS_COLS } from '../../data/blocks';
import { getAtlasURL, ATLAS_STRIDE, ATLAS_PADDING, getAtlasDimensions } from '../../utils/textures';
import { resolveTexture } from '../../systems/world/textureResolver';
import { getShapeBoxes } from '../../systems/world/blockShapes';
import { getMaxDurability } from '../../systems/registry/itemStats';
import { TEXTURE_PATHS } from '../../systems/textures/textureMapping';

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

interface PixelPerfectItemIconProps {
  src?: string;
  atlasURL: string | null;
  texSlot: number;
  targetSize: number;
}

const PixelPerfectItemIcon: React.FC<PixelPerfectItemIconProps> = ({ src, atlasURL, texSlot, targetSize }) => {
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useLayoutEffect(() => {
      const wrapper = wrapperRef.current;
      const canvas = canvasRef.current;
      if (!wrapper || !canvas) return;

      let image: HTMLImageElement | null = null;
      let imageIsAtlas = false;
      let sourceReady = false;
      let disposed = false;

      const draw = () => {
          if (!image || !image.complete || image.naturalWidth === 0) return;

          const ancestorScale = wrapper.offsetWidth > 0
              ? wrapper.getBoundingClientRect().width / wrapper.offsetWidth
              : 1;
          const physicalPixelsPerCssPixel = window.devicePixelRatio * ancestorScale;
          const sourcePixelScale = Math.max(
              1,
              Math.floor((targetSize * physicalPixelsPerCssPixel) / 16)
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
          if (imageIsAtlas) {
              const col = texSlot % ATLAS_COLS;
              const row = Math.floor(texSlot / ATLAS_COLS);
              ctx.drawImage(
                  image,
                  col * ATLAS_STRIDE + ATLAS_PADDING,
                  row * ATLAS_STRIDE + ATLAS_PADDING,
                  16,
                  16,
                  0,
                  0,
                  backingSize,
                  backingSize
              );
          } else {
              ctx.drawImage(image, 0, 0, backingSize, backingSize);
          }

          // Centering can land on a fractional device pixel. Nudge the finished
          // canvas onto the physical pixel grid so every texel stays uniform.
          const rect = canvas.getBoundingClientRect();
          const offsetX = (Math.round(rect.left * window.devicePixelRatio) - rect.left * window.devicePixelRatio)
              / physicalPixelsPerCssPixel;
          const offsetY = (Math.round(rect.top * window.devicePixelRatio) - rect.top * window.devicePixelRatio)
              / physicalPixelsPerCssPixel;
          canvas.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
      };

      const atlasImage = atlasURL ? new Image() : null;
      if (atlasImage && atlasURL) {
          atlasImage.onload = () => {
              if (disposed || sourceReady) return;
              image = atlasImage;
              imageIsAtlas = true;
              draw();
          };
          atlasImage.src = atlasURL;
      }

      const sourceImage = src ? new Image() : null;
      if (sourceImage && src) {
          sourceImage.onload = () => {
              if (disposed) return;
              sourceReady = true;
              image = sourceImage;
              imageIsAtlas = false;
              draw();
          };
          sourceImage.src = src;
      }

      const resizeObserver = new ResizeObserver(draw);
      resizeObserver.observe(wrapper);
      window.addEventListener('resize', draw);

      return () => {
          disposed = true;
          resizeObserver.disconnect();
          window.removeEventListener('resize', draw);
          if (atlasImage) atlasImage.onload = null;
          if (sourceImage) sourceImage.onload = null;
      };
  }, [atlasURL, src, targetSize, texSlot]);

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
              style={{ width: '100%', height: '100%' }}
          />
      </div>
  );
};

export const Slot: React.FC<SlotProps> = ({ 
    item, selected, onClick, onContextMenu, onDoubleClick, onAuxClick,
    onMouseEnter, onMouseLeave, onMouseDown, onMouseUp, size = 'large', isCursor = false 
}) => {
  const blockDef = item ? BLOCKS[item.type] : null;
  const atlasURL = getAtlasURL();
  const { width } = getAtlasDimensions(); // Real POT width of texture

  // Durability bar: shown only for a damaged tool/weapon (current < max).
  const maxDurability = item ? getMaxDurability(item.type) : undefined;
  const curDurability = item?.instance?.durability;
  const showDurability = maxDurability !== undefined && curDurability !== undefined && curDurability < maxDurability;
  const durabilityFrac = showDurability ? Math.max(0, curDurability / maxDurability) : 0;
  const durabilityBar = showDurability ? (
      <div className="absolute bottom-0.5 left-1 right-1 h-1 bg-black/70 pointer-events-none z-20">
          <div className="h-full" style={{ width: `${durabilityFrac * 100}%`, background: `hsl(${durabilityFrac * 120}, 90%, 45%)` }} />
      </div>
  ) : null;

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
          const baseScale = size === 'large' ? 1.4 : 1.0;
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
          // Prefer the source PNG so CSS never resamples the padded atlas.
          // The canvas renderer snaps the 16px source to whole physical pixels.
          const pxSize = size === 'large' ? 40 : 28;
          const texSlot = blockDef.textureSlot || 0;
          const texturePath = TEXTURE_PATHS[texSlot];

          if (texturePath || atlasURL) {
              return (
                  <PixelPerfectItemIcon
                      src={texturePath ? `assets/textures/${texturePath}` : undefined}
                      atlasURL={atlasURL}
                      texSlot={texSlot}
                      targetSize={pxSize}
                  />
              );
          }

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

        {durabilityBar}
    </div>
  );
};
