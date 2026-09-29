
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
import { useHudScale } from './hudScale';

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

// The bottom-centre HUD (vitals, hotbar, item name and the readouts above it)
// is laid out in art pixels, drawn `scale` screen pixels each (hudScale.ts), so
// it keeps one set of proportions at every size.
const HudScaleContext = React.createContext(2);

// One vital pip: the icon's empty form, with the full form over it, clipped to
// a half for odd values. Pips sit 10 art pixels apart and overlap by their
// one-pixel margins, so ten of them span half the hotbar. `half` picks which
// side a half pip keeps (health drains from the right, provisions from the
// left); `clipTop` empties a bubble from the top, in art pixels.
const VitalPip: React.FC<{ icon: VitalIcon; fill: number; half?: 'left' | 'right'; clipTop?: number }> = ({
    icon, fill, half = 'left', clipTop,
}) => {
    const scale = React.useContext(HudScaleContext);
    let clip: string | undefined;
    if (clipTop !== undefined) clip = `inset(${clipTop * scale}px 0 0 0)`;
    else if (fill === 0.5) clip = half === 'left' ? `inset(0 ${5 * scale}px 0 0)` : `inset(0 0 0 ${5 * scale}px)`;
    return (
        <div className="relative overflow-visible" style={{ width: 10 * scale, height: 11 * scale }} aria-hidden>
            <PixelArt rows={icon.rows} palette={icon.empty} scale={scale} className="absolute left-0 top-0" />
            {fill > 0 && (
                <div className="absolute left-0 top-0" style={{ width: 11 * scale, height: 11 * scale, clipPath: clip }}>
                    <PixelArt rows={icon.rows} palette={icon.full} scale={scale} />
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
                    <div key={slot} data-tip={title}
                        className={`relative ${low ? 'animate-pulse outline outline-2 outline-ember-300' : ''}`}>
                        <Slot item={item} size="small" />
                    </div>
                );
            })}
        </div>
    );
};

export const HUD: React.FC<HUDProps> = ({ health, hunger, saturation = 0, breath, inventory, selectedSlot, gameMode, lastDamageTime = 0, equipment, magnetic = false }) => {
    // Screen pixels per art pixel for the bottom-centre HUD; u(n) is n art pixels.
    const scale = useHudScale();
    const u = (artPixels: number) => artPixels * scale;
    const [showItemName, setShowItemName] = useState(true);
    const hotbarRef = useRef<HTMLDivElement>(null);
    const [selectionFrame, setSelectionFrame] = useState<{ x: number; y: number; size: number } | null>(null);
    const selectedType = inventory[selectedSlot]?.type;
    useEffect(() => {
        setShowItemName(true);
        const timer = window.setTimeout(() => setShowItemName(false), 2500);
        return () => window.clearTimeout(timer);
    }, [selectedSlot, selectedType]);

    // The hotbar's selection frame glides between slots, two art pixels out
    // from the one selected. Measured from the slots themselves so it always
    // lines up with them.
    useLayoutEffect(() => {
        const slot = hotbarRef.current?.children[selectedSlot] as HTMLElement | undefined;
        if (!slot) return;
        const next = { x: slot.offsetLeft - 2 * scale, y: slot.offsetTop - 2 * scale, size: slot.offsetWidth + 4 * scale };
        setSelectionFrame(prev => (prev && prev.x === next.x && prev.y === next.y && prev.size === next.size ? prev : next));
    }, [selectedSlot, gameMode, scale]);

    // Hearts flash and jolt for a quarter second after a hit (a CSS animation,
    // replayed by keying the hearts to the hit), and twitch while health is low.
    // The hunger shanks twitch while saturation is spent. No timers, no re-renders.
    const heartsHit = lastDamageTime > 0 && Date.now() - lastDamageTime < 250;
    const heartsUneasy = health <= 4;
    const hungerUneasy = saturation <= 0 && gameMode === 'survival' && hunger < 20;

    return (
        <HudScaleContext.Provider value={scale}>
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
                <div
                    className="absolute left-1/2 -translate-x-1/2 flex items-end justify-between z-40 pointer-events-none"
                    // --hud-px: one pixel of the original HUD, for the pips' jolts and twitches.
                    style={{ bottom: u(40), width: u(240), paddingBottom: u(4), '--hud-px': `${scale / 2}px` } as React.CSSProperties}
                >
                    <div className="flex flex-col items-start" style={{ gap: u(1) }}>
                        {/* Armor (defense) plates, shown above the life crystals
                            while any armor is worn; 1 plate = 2 defense points,
                            matching the applyArmor() reduction they represent. */}
                        {equipment && totalDefense(equipment) > 0 && (
                            <div className="flex" style={{ height: u(11) }} data-tip={`${totalDefense(equipment)} armor; reduces combat damage (not falls, fire, or drowning)`}>
                                {Array.from({ length: 10 }).map((_, i) => {
                                    const def = Math.min(20, totalDefense(equipment));
                                    const fill = def >= (i + 1) * 2 ? 1 : (def === i * 2 + 1 ? 0.5 : 0);
                                    return <VitalPip key={i} icon={ARMOR_PLATE} fill={fill} />;
                                })}
                            </div>
                        )}
                        {/* Life crystals */}
                        <div className="flex" style={{ height: u(11) }}>
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

                    <div className="flex flex-col items-end" style={{ gap: u(1) }}>
                        {/* Breath, above the provisions while underwater. The
                            bubbles go from the right, each emptying from the top
                            a whole art pixel at a time. */}
                        {breath < MAX_BREATH && (
                            <div className="flex" style={{ height: u(11) }}>
                                {Array.from({length: 10}).map((_, i) => {
                                    const left = breath / 30 - i;
                                    const clipTop = left >= 1 ? 0 : left <= 0 ? 11 : Math.round((1 - left) * 11);
                                    return <VitalPip key={i} icon={BREATH_BUBBLE} fill={left > 0 ? 1 : 0} clipTop={clipTop} />;
                                })}
                            </div>
                        )}

                        {/* Provisions, flex-row-reverse, so index 0 is the
                            RIGHTMOST loaf and they deplete from the left. */}
                        <div className="flex flex-row-reverse" style={{ height: u(11) }}>
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
            {gameMode !== 'spectator' && <div
                className="absolute left-1/2 z-40 flex max-w-[calc(100vw-32px)] -translate-x-1/2 flex-col items-center pointer-events-none"
                style={{
                    bottom: u(gameMode === 'survival' ? ((equipment && totalDefense(equipment) > 0) || breath < MAX_BREATH ? 73 : 61) : 46),
                    width: u(160),
                    gap: u(4),
                }}
            >
                {/* The gauges above the name are drawn at the original scale:
                    zoomed whole, their 2px art lands on the same grid. */}
                <div className="flex w-full justify-center" style={{ zoom: scale / 2 }}>
                    <CombatFeedback magnetic={magnetic} />
                </div>
                <div className="max-w-full" style={{ height: u(13) }}>
                    {inventory[selectedSlot] && <div
                        className={`atlas-plate truncate text-center transition-opacity duration-200 motion-reduce:transition-none ${showItemName ? 'opacity-100' : 'opacity-0'}`}
                        style={{ fontSize: u(11), lineHeight: `${u(13)}px`, padding: `0 ${u(4)}px`, textShadow: `${scale}px ${scale}px 0 #070917` }}
                    >
                        {BLOCKS[inventory[selectedSlot]!.type].name}
                    </div>}
                </div>
            </div>}

            {/* The kit's screen-centre readouts (dodge dial, tower prompt, flashes).
                A sibling of the hotbar rather than a portal, so the pause menu and
                the inventory cover and blur it exactly as they do the rest. */}
            {gameMode !== 'spectator' && <CombatOverlay />}

            {/* Hotbar: nine 24-pixel slots, 2 apart, in a 3-pixel padding and a
                1-pixel border (240 art pixels across), floating above the
                bottom edge. 720px across at 1920x1080, Minecraft's size. */}
            {gameMode !== 'spectator' && (
                <div className="absolute left-1/2 transform -translate-x-1/2 flex flex-col items-center z-40" style={{ bottom: u(8) }}>
                    <div
                        ref={hotbarRef}
                        className="relative flex border-ink-950 bg-ink-900/80"
                        style={{ gap: u(2), padding: u(3), borderWidth: u(1), boxShadow: `inset 0 ${u(1)}px 0 rgba(70,87,138,0.45)` }}
                    >
                        {inventory.slice(0, 9).map((it, i) => (
                            <Slot
                                key={i}
                                item={it}
                                size="hotbar"
                                scale={scale}
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
                                    borderWidth: u(2),
                                    boxShadow: `0 0 0 ${u(1)}px #070917, inset 0 0 0 ${u(1)}px #070917`,
                                }}
                            />
                        )}
                    </div>
                </div>
            )}
        </HudScaleContext.Provider>
    );
};
