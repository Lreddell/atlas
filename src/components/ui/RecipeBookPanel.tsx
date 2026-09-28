import React, { useMemo, useState } from 'react';
import { BlockType, type ItemStack } from '../../types';
import { BLOCKS } from '../../data/blocks';
import { RECIPES, type Recipe } from '../../recipes';
import {
    buildRecipeEntries, countItems, entryStatus, ingredientCounts, isKnown, tabOf,
    type RecipeTab,
} from '../../systems/inventory/recipeBook';
import { soundManager } from '../../systems/sound/SoundManager';
import { Slot } from './Slot';
import type { TooltipLine } from '../../systems/registry/itemTooltips';

// The recipe book: every recipe the player has discovered, beside the crafting
// grid. Click one to lay its ingredients in the grid; shift-click for as many
// as the items on hand allow.

const TABS: readonly { id: RecipeTab; name: string; icon: BlockType }[] = [
    { id: 'all', name: 'All Recipes', icon: BlockType.CRAFTING_TABLE },
    { id: 'blocks', name: 'Blocks', icon: BlockType.BRICK },
    { id: 'gear', name: 'Tools & Gear', icon: BlockType.IRON_PICKAXE },
    { id: 'food', name: 'Food', icon: BlockType.BREAD },
    { id: 'other', name: 'Materials & Utility', icon: BlockType.IRON_INGOT },
];

const PREFS_KEY = 'atlas.ui.recipeBook.v1';

interface BookPrefs { tab: RecipeTab; craftableOnly: boolean }

const readPrefs = (): BookPrefs => {
    try {
        const raw = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<BookPrefs>;
        return {
            tab: TABS.some((t) => t.id === raw.tab) ? raw.tab as RecipeTab : 'all',
            craftableOnly: raw.craftableOnly === true,
        };
    } catch {
        return { tab: 'all', craftableOnly: false };
    }
};

const writePrefs = (prefs: BookPrefs) => {
    try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* per-player convenience only */ }
};

export interface RecipeHover {
    name: string;
    lines: TooltipLine[];
    x: number;
    y: number;
}

interface RecipeBookPanelProps {
    /** 2 in the inventory, 3 at a Crafting Table. */
    gridWidth: 2 | 3;
    inventory: readonly (ItemStack | null)[];
    /** Items the player has held (creative: every recipe is known). */
    known: ReadonlySet<BlockType> | 'all';
    onFill: (recipe: Recipe, all: boolean) => void;
    onHover: (info: RecipeHover | null) => void;
}

const ingredientsLine = (recipe: Recipe): string =>
    [...ingredientCounts(recipe)].map(([type, count]) => `${count} ${BLOCKS[type]?.name ?? 'Unknown'}`).join(', ');

export const RecipeBookPanel: React.FC<RecipeBookPanelProps> = ({ gridWidth, inventory, known, onFill, onHover }) => {
    const [prefs, setPrefs] = useState<BookPrefs>(readPrefs);
    const [query, setQuery] = useState('');
    const update = (change: Partial<BookPrefs>) => setPrefs((current) => {
        const next = { ...current, ...change };
        writePrefs(next);
        return next;
    });

    // Recipes are registered at startup (Vault recipes included); group them once.
    const entries = useMemo(() => buildRecipeEntries(RECIPES), []);
    const have = useMemo(() => countItems(inventory), [inventory]);

    const knownEntries = useMemo(
        () => entries.filter((entry) => known === 'all' || isKnown(entry, known)),
        [entries, known],
    );

    const shown = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return knownEntries
            .filter((entry) => prefs.tab === 'all' || tabOf(BLOCKS[entry.output]?.category) === prefs.tab)
            .filter((entry) => !needle || (BLOCKS[entry.output]?.name ?? '').toLowerCase().includes(needle))
            .map((entry) => ({ entry, status: entryStatus(entry, have, gridWidth) }))
            .filter(({ status }) => !prefs.craftableOnly || status.crafts > 0)
            // Craftable first, then what the player has the makings of, then the rest.
            .sort((a, b) => Number(b.status.crafts > 0) - Number(a.status.crafts > 0)
                || Number(b.status.haveIngredients) - Number(a.status.haveIngredients));
    }, [knownEntries, prefs, query, have, gridWidth]);

    const craftableCount = useMemo(
        () => knownEntries.filter((entry) => entryStatus(entry, have, gridWidth).crafts > 0).length,
        [knownEntries, have, gridWidth],
    );

    return (
        <div
            className="flex w-[244px] shrink-0 flex-col gap-2 border-4 border-white border-b-[#444] border-r-[#444] bg-[#c6c6c6] p-3 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
        >
            <div className="flex items-baseline justify-between px-1">
                <h2 className="text-lg font-bold uppercase tracking-wider text-[#333]">Recipes</h2>
                <span className="text-xs text-[#555]">{craftableCount} craftable</span>
            </div>

            <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                aria-label="Search recipes"
                className="h-8 w-full border-2 border-[#333] bg-[#1e1e1e] px-2 font-pixel text-sm text-white outline-none placeholder:text-[#8a8a8a] focus:border-[#f3d488]"
            />

            <div className="flex gap-1" role="tablist" aria-label="Recipe categories">
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={prefs.tab === tab.id}
                        title={tab.name}
                        onClick={() => { soundManager.play('ui.click'); update({ tab: tab.id }); }}
                        className={`flex h-9 w-9 items-center justify-center border-2 ${prefs.tab === tab.id
                            ? 'border-white border-b-[#555] border-r-[#555] bg-[#d8d8d8]'
                            : 'border-[#555] border-b-white border-r-white bg-[#8b8b8b] hover:bg-[#a0a0a0]'}`}
                    >
                        <Slot item={{ type: tab.icon, count: 1 }} size="small" bare />
                    </button>
                ))}
            </div>

            <button
                type="button"
                onClick={() => { soundManager.play('ui.click'); update({ craftableOnly: !prefs.craftableOnly }); }}
                aria-pressed={prefs.craftableOnly}
                className="h-7 w-full border-2 border-white border-b-[#373737] border-r-[#373737] bg-[#8b8b8b] font-pixel text-xs text-white [text-shadow:1px_1px_0_#3f3f3f] hover:brightness-110"
            >
                {prefs.craftableOnly ? 'Showing craftable' : 'Showing all known'}
            </button>

            <div className="h-[252px] overflow-y-auto border-2 border-t-[#333] border-l-[#333] border-b-white border-r-white bg-[#8b8b8b] p-1 scrollbar-thin">
                {shown.length === 0 ? (
                    <p className="p-2 text-center text-xs leading-relaxed text-[#2e2e2e]">
                        {knownEntries.length === 0
                            ? 'Pick up materials: each item you gather teaches the recipes it goes into.'
                            : prefs.craftableOnly ? 'Nothing here can be made from what you carry.' : 'No recipes match.'}
                    </p>
                ) : (
                    <div className="grid grid-cols-5 gap-[2px]">
                        {shown.map(({ entry, status }) => {
                            const craftable = status.crafts > 0;
                            const name = BLOCKS[entry.output]?.name ?? 'Unknown';
                            const lines: TooltipLine[] = [{ text: `Needs ${ingredientsLine(status.recipe)}`, tone: 'stat' }];
                            if (entry.count > 1) lines.unshift({ text: `Makes ${entry.count}`, tone: 'stat' });
                            if (status.needsTable) lines.push({ text: 'Needs a Crafting Table (3x3).', tone: 'purpose' });
                            else if (craftable) lines.push({ text: 'Click to fill the grid; shift-click for as many as you can.', tone: 'purpose' });
                            else lines.push({ text: 'Missing ingredients.', tone: 'purpose' });
                            return (
                                <button
                                    key={entry.output}
                                    type="button"
                                    aria-label={`${name}${craftable ? '' : status.needsTable ? ', needs a crafting table' : ', missing ingredients'}`}
                                    onMouseEnter={(e) => onHover({ name, lines, x: e.clientX, y: e.clientY })}
                                    onMouseMove={(e) => onHover({ name, lines, x: e.clientX, y: e.clientY })}
                                    onMouseLeave={() => onHover(null)}
                                    onClick={(e) => {
                                        if (!craftable) { soundManager.play('ui.click', { pitch: 0.6 }); return; }
                                        onFill(status.recipe, e.shiftKey);
                                    }}
                                    className={`relative flex h-10 w-10 items-center justify-center border-2 ${craftable
                                        ? 'border-[#373737] border-b-white border-r-white bg-[#8b8b8b] hover:bg-[#9d9d9d]'
                                        : 'border-[#4a2424] border-b-[#b98989] border-r-[#b98989] bg-[#8e6363]'}`}
                                >
                                    <span className={craftable ? '' : 'opacity-60'}>
                                        <Slot item={{ type: entry.output, count: 1 }} size="small" bare />
                                    </span>
                                    {entry.count > 1 && (
                                        <span className="pointer-events-none absolute bottom-0 right-[2px] font-pixel text-[10px] text-white [text-shadow:1px_1px_0_#000]">{entry.count}</span>
                                    )}
                                    {status.needsTable && (
                                        <span className="pointer-events-none absolute left-[1px] top-[1px] h-[10px] w-[10px]" aria-hidden>
                                            <Slot item={{ type: BlockType.CRAFTING_TABLE, count: 1 }} size="small" bare />
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

/** The small book-shaped button that opens the recipe book, drawn on the 16px grid. */
export const RecipeBookButton: React.FC<{ open: boolean; onToggle: () => void }> = ({ open, onToggle }) => (
    <button
        type="button"
        onClick={(e) => { e.stopPropagation(); soundManager.play('ui.click'); onToggle(); }}
        onMouseDown={(e) => e.stopPropagation()}
        aria-pressed={open}
        title={open ? 'Close the recipe book' : 'Open the recipe book'}
        className={`flex h-10 w-10 shrink-0 items-center justify-center border-2 ${open
            ? 'border-[#555] border-b-white border-r-white bg-[#7a7a7a]'
            : 'border-white border-b-[#373737] border-r-[#373737] bg-[#8b8b8b] hover:brightness-110'}`}
    >
        <svg viewBox="0 0 16 16" width="28" height="28" shapeRendering="crispEdges" aria-hidden>
            <rect x="2" y="2" width="12" height="12" fill="#5d3a1f" />
            <rect x="3" y="3" width="10" height="10" fill="#8d5a2b" />
            <rect x="3" y="12" width="10" height="1" fill="#efe2bf" />
            <rect x="12" y="3" width="1" height="9" fill="#efe2bf" />
            <rect x="5" y="5" width="6" height="1" fill="#c9a24a" />
            <rect x="5" y="7" width="4" height="1" fill="#c9a24a" />
            <rect x="2" y="2" width="1" height="12" fill="#3e2511" />
        </svg>
    </button>
);
