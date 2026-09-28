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
            className="atlas-panel flex w-[276px] shrink-0 flex-col gap-2 px-4 pb-4 pt-4"
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
        >
            <div className="flex items-baseline justify-between">
                <h2 className="atlas-heading">Recipes</h2>
                <span className="text-px-2 text-parchment-400">{craftableCount} ready</span>
            </div>

            <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                aria-label="Search recipes"
                className="atlas-input !h-9"
            />

            <div className="flex justify-between" role="tablist" aria-label="Recipe categories">
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={prefs.tab === tab.id}
                        title={tab.name}
                        onClick={() => { soundManager.play('ui.click'); update({ tab: tab.id }); }}
                        className="atlas-btn h-10 w-10"
                    >
                        <Slot item={{ type: tab.icon, count: 1 }} size="small" bare />
                    </button>
                ))}
            </div>

            <button
                type="button"
                onClick={() => { soundManager.play('ui.click'); update({ craftableOnly: !prefs.craftableOnly }); }}
                aria-pressed={prefs.craftableOnly}
                className="atlas-btn h-8 w-full !leading-[22px]"
            >
                <span className="atlas-btn-label">{prefs.craftableOnly ? 'Only what I can make' : 'Every known recipe'}</span>
            </button>

            <div className="atlas-well h-[264px] overflow-y-auto p-1 scrollbar-thin">
                {shown.length === 0 ? (
                    <p className="p-2 text-center text-read text-parchment-400">
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
                                        ? 'atlas-slot hover:bg-ink-600'
                                        : 'border-[#1d0708] border-b-[#6e2a26] border-r-[#6e2a26] bg-[#3a1216] hover:bg-[#4a171c]'}`}
                                >
                                    <span className={craftable ? '' : 'opacity-60'}>
                                        <Slot item={{ type: entry.output, count: 1 }} size="small" bare />
                                    </span>
                                    {entry.count > 1 && (
                                        <span className="pointer-events-none absolute bottom-0 right-[2px] text-px-1 text-parchment-50 text-shadow-md">{entry.count}</span>
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
        className="atlas-btn h-11 w-11 shrink-0"
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
