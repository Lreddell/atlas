
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ItemStack, BlockType, EquipmentSlot } from '../../types';
import { Slot } from './Slot';
import { BLOCKS } from '../../data/blocks';
import { MAX_BREATH } from '../../systems/player/playerConstants';
import { totalDefense, type Equipment } from '../../systems/registry/equipment';
import { getItemStats, getMaxDurability } from '../../systems/registry/itemStats';
import { CombatFeedback, CombatOverlay } from './CombatFeedback';
import { ResonantObjectiveHUD } from './ResonantObjectiveHUD';
import { PixelArt } from './kit/PixelArt';
import { ARMOR_PLATE, BREATH_BUBBLE, LIFE_CRYSTAL, PROVISIONS, type VitalIcon } from './kit/vitalIcons';

interface HUDProps {
    health: number;
    hunger: number;
    saturation?: number;
    breath: number;
    inventory: (ItemStack | null)[];
    selectedSlot: number;
    gameMode: 'survival' | 'creative' | 'spectator';
    headBlockType?: BlockType;
    lastDamageTime?: number;
    equipment?: Equipment;
    magnetic?: boolean;
}

// One vital pip: the icon's empty form, with the full form over it, clipped to
// a half for odd values. Pips sit 20px apart and overlap by their one-pixel
// margins, so ten of them span half the hotbar. `half` picks which side a half
// pip keeps (health drains from the right, provisions from the left).
const VitalPip: React.FC<{ icon: VitalIcon; fill: number; half?: 'left' | 'right'; clipTop?: number }> = ({
    icon, fill, half = 'left', clipTop,
}) => {
    let clip: string | undefined;
    if (clipTop !== undefined) clip = `inset(${clipTop}px 0 0 0)`;
    else if (fill === 0.5) clip = half === 'left' ? 'inset(0 10px 0 0)' : 'inset(0 0 0 10px)';
    return (
        <div className="relative h-[22px] w-[20px] overflow-visible" aria-hidden>
            <PixelArt rows={icon.rows} palette={icon.empty} className="absolute left-0 top-0" />
            {fill > 0 && (
                <div className="absolute left-0 top-0 h-[22px] w-[22px]" style={clip ? { clipPath: clip } : undefined}>
                    <PixelArt rows={icon.rows} palette={icon.full} />
                </div>
            )}
        </div>
    );
};

// Which way each heart jolts on a hit, so they scatter instead of moving as one.
const HEART_JOLT = [1, -0.5, 0.5, -1, 1, -1, 0.5, -0.5, 1, -1];
// Uneasy pips twitch on their own clocks.
const jitterStyle = (i: number): React.CSSProperties => ({
    animationDelay: `${-((i * 0.37) % 0.9).toFixed(2)}s`,
    animationDuration: `${(0.8 + ((i * 0.13) % 0.3)).toFixed(2)}s`,
});

const statFill = (value: number, index: number) => {
    const full = index < Math.floor(value / 2);
    if (full) return 1;
    return index === Math.floor(value / 2) && value % 2 === 1 ? 0.5 : 0;
};

// Equipped-armor readout: one mini slot per worn piece with its durability bar
// (via Slot) plus an ember ring that pulses when a piece is nearly broken.
// Tooltips carry the exact numbers.
const ARMOR_HUD_SLOTS: EquipmentSlot[] = ['helmet', 'chestplate', 'leggings', 'boots'];
const ArmorReadout: React.FC<{ equipment: Equipment }> = ({ equipment }) => {
    const pieces = ARMOR_HUD_SLOTS.map((slot) => ({ slot, item: equipment[slot] }));
    if (!pieces.some((p) => p.item)) return null;
    return (
        <div className="absolute bottom-4 left-4 z-40 flex flex-col gap-1 pointer-events-none">
            {pieces.map(({ slot, item }) => {
                if (!item) return null;
                const stats = getItemStats(item);
                const max = getMaxDurability(item.type);
                const cur = item.instance?.durability ?? max;
                const frac = max !== undefined && cur !== undefined ? cur / max : 1;
                const low = max !== undefined && frac < 0.15;
                const title = `${BLOCKS[item.type].name}: ${stats?.defense ?? 0} defense`
                    + (max !== undefined ? `, ${cur}/${max} durability` : ', unbreakable');
                return (
                    <div key={slot} title={title}
                        className={`relative ${low ? 'animate-pulse outline outline-2 outline-ember-300' : ''}`}>
                        <Slot item={item} size="small" />
                    </div>
                );
            })}
        </div>
    );
};

export const HUD: React.FC<HUDProps> = ({ health, hunger, saturation = 0, breath, inventory, selectedSlot, gameMode, lastDamageTime = 0, equipment, magnetic = false }) => {
    const [showItemName, setShowItemName] = useState(true);
    const hotbarRef = useRef<HTMLDivElement>(null);
    const [selectionFrame, setSelectionFrame] = useState<{ x: number; y: number; size: number } | null>(null);
    const selectedType = inventory[selectedSlot]?.type;
    useEffect(() => {
        setShowItemName(true);
        const timer = window.setTimeout(() => setShowItemName(false), 2500);
        return () => window.clearTimeout(timer);
    }, [selectedSlot, selectedType]);

    // The hotbar's selection frame glides between slots. Measured from the
    // slots themselves so it always lines up with them.
    useLayoutEffect(() => {
        const slot = hotbarRef.current?.children[selectedSlot] as HTMLElement | undefined;
        if (!slot) return;
        const next = { x: slot.offsetLeft - 4, y: slot.offsetTop - 4, size: slot.offsetWidth + 8 };
        setSelectionFrame(prev => (prev && prev.x === next.x && prev.y === next.y && prev.size === next.size ? prev : next));
    }, [selectedSlot, gameMode]);

    // Hearts flash and jolt for a quarter second after a hit (a CSS animation,
    // replayed by keying the hearts to the hit), and twitch while health is low.
    // The hunger shanks twitch while saturation is spent. No timers, no re-renders.
    const heartsHit = lastDamageTime > 0 && Date.now() - lastDamageTime < 250;
    const heartsUneasy = health <= 4;
    const hungerUneasy = saturation <= 0 && gameMode === 'survival' && hunger < 20;

    return (
        <>
            <ResonantObjectiveHUD inventory={inventory} />
            {gameMode === 'spectator' ? (
                 // Bottom centre, where the hotbar would be: clear of the boss bar at the top.
                 <div className="atlas-plate absolute bottom-6 left-1/2 -translate-x-1/2 z-40">
                    Spectator Mode
                </div>
            ) : (
                 // A pixel cross that inverts whatever it sits on, so it reads on sky and stone alike.
                 <div id="crosshair" className="mix-blend-difference z-40 bg-[linear-gradient(#e8e8e8,#e8e8e8),linear-gradient(#e8e8e8,#e8e8e8)] bg-[length:2px_18px,18px_2px] bg-center bg-no-repeat"></div>
            )}
            
            {/* Vitals - only in Survival. Health (with armor above it) on the
                left, provisions (with breath above them) on the right, the two
                together exactly as wide as the hotbar below. */}
            {gameMode === 'survival' && (
                <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex w-[480px] items-end justify-between z-40 pb-2 pointer-events-none">
                    <div className="flex flex-col gap-[2px] items-start">
                        {/* Armor (defense) plates, shown above the life crystals
                            while any armor is worn; 1 plate = 2 defense points,
                            matching the applyArmor() reduction they represent. */}
                        {equipment && totalDefense(equipment) > 0 && (
                            <div className="flex h-[22px]" title={`${totalDefense(equipment)} armor; reduces combat damage (not falls, fire, or drowning)`}>
                                {Array.from({ length: 10 }).map((_, i) => {
                                    const def = Math.min(20, totalDefense(equipment));
                                    const fill = def >= (i + 1) * 2 ? 1 : (def === i * 2 + 1 ? 0.5 : 0);
                                    return <VitalPip key={i} icon={ARMOR_PLATE} fill={fill} />;
                                })}
                            </div>
                        )}
                        {/* Life crystals */}
                        <div className="flex h-[22px]">
                            {Array.from({length: 10}).map((_, i) => (
                                <div
                                    key={heartsHit ? `${i}:${lastDamageTime}` : i}
                                    className={heartsHit ? 'atlas-heart-hit' : heartsUneasy ? 'atlas-jitter' : undefined}
                                    style={heartsHit
                                        ? ({ '--atlas-jolt': HEART_JOLT[i] } as React.CSSProperties)
                                        : heartsUneasy ? jitterStyle(i) : undefined}
                                >
                                    <VitalPip icon={LIFE_CRYSTAL} fill={statFill(health, i)} half="left" />
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-col gap-[2px] items-end">
                        {/* Breath, above the provisions while underwater. The
                            bubbles go from the right, each emptying from the top
                            a whole art pixel at a time. */}
                        {breath < MAX_BREATH && (
                            <div className="flex h-[22px]">
                                {Array.from({length: 10}).map((_, i) => {
                                    const left = breath / 30 - i;
                                    const clipTop = left >= 1 ? 0 : left <= 0 ? 22 : Math.round((1 - left) * 11) * 2;
                                    return <VitalPip key={i} icon={BREATH_BUBBLE} fill={left > 0 ? 1 : 0} clipTop={clipTop} />;
                                })}
                            </div>
                        )}

                        {/* Provisions, flex-row-reverse, so index 0 is the
                            RIGHTMOST loaf and they deplete from the left. */}
                        <div className="flex h-[22px] flex-row-reverse">
                            {Array.from({length: 10}).map((_, i) => (
                                <div
                                    key={i}
                                    className={hungerUneasy ? 'atlas-jitter' : undefined}
                                    style={hungerUneasy ? jitterStyle(i + 3) : undefined}
                                >
                                    <VitalPip icon={PROVISIONS} fill={statFill(hunger, i)} half="right" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Equipped armor readout (icons + durability bars, bottom-left) */}
            {gameMode === 'survival' && equipment && <ArmorReadout equipment={equipment} />}

            {/* Selected item name. Lifted clear of whatever else is stacked in the
                bottom centre: the hotbar always, plus the hearts and (when worn)
                the armor pips in survival, so the label never lands on them. */}
            {gameMode !== 'spectator' && <div className="absolute left-1/2 z-40 flex w-[320px] max-w-[calc(100vw-32px)] -translate-x-1/2 flex-col items-center gap-2 pointer-events-none" style={{ bottom: gameMode === 'survival' ? ((equipment && totalDefense(equipment) > 0) || breath < MAX_BREATH ? 146 : 122) : 92 }}>
                <CombatFeedback magnetic={magnetic} />
                <div className="h-[26px] max-w-full">
                    {inventory[selectedSlot] && <div className={`atlas-plate truncate text-center transition-opacity duration-200 motion-reduce:transition-none ${showItemName ? 'opacity-100' : 'opacity-0'}`}>
                        {BLOCKS[inventory[selectedSlot]!.type].name}
                    </div>}
                </div>
            </div>}

            {/* The kit's screen-centre readouts (dodge dial, tower prompt, flashes).
                A sibling of the hotbar rather than a portal, so the pause menu and
                the inventory cover and blur it exactly as they do the rest. */}
            {gameMode !== 'spectator' && <CombatOverlay />}

            {/* Hotbar */}
            {gameMode !== 'spectator' && (
                <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex flex-col items-center gap-2 z-40">
                    <div ref={hotbarRef} className="relative flex gap-1 border-2 border-ink-950 bg-ink-900/80 p-1.5 shadow-[inset_0_2px_0_rgba(70,87,138,0.45)]">
                        {inventory.slice(0, 9).map((it, i) => (
                            <Slot
                                key={i}
                                item={it}
                                selected={selectedSlot === i}
                                animateChanges
                                selectionFrame={false}
                            />
                        ))}
                        {selectionFrame && (
                            <span
                                aria-hidden
                                className="atlas-hotbar-frame atlas-select-frame absolute left-0 top-0 z-30 pointer-events-none"
                                style={{
                                    width: selectionFrame.size,
                                    height: selectionFrame.size,
                                    transform: `translate(${selectionFrame.x}px, ${selectionFrame.y}px)`,
                                }}
                            />
                        )}
                    </div>
                </div>
            )}
        </>
    );
};
