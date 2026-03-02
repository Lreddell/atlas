
import React, { useMemo } from 'react';
import { ModPack, EditorTab, BlockDefinition, ItemDefinition, RecipeDefinition } from './editorTypes';

interface ValidationViewProps {
    pack: ModPack;
    onFocusTab: (tab: EditorTab, id: string) => void;
}

interface Issue {
    level: 'error' | 'warning';
    tab: EditorTab;
    id: string;
    message: string;
}

export const ValidationView: React.FC<ValidationViewProps> = ({ pack, onFocusTab }) => {
    const issues = useMemo(() => {
        const list: Issue[] = [];
        
        // --- BLOCKS ---
        Object.values(pack.blocks).forEach((block: BlockDefinition) => {
            const checkTexture = (tid: string | undefined, role: string) => {
                if (tid && !pack.textures[tid]) {
                    list.push({ level: 'error', tab: 'blocks', id: block.id, message: `Missing texture reference "${tid}" for ${role}` });
                }
            };

            const tm = block.textures;
            if (tm.mode === 'all') checkTexture(tm.all, "all faces");
            else if (tm.mode === 'top-bottom-side') {
                checkTexture(tm.top, "top face");
                checkTexture(tm.bottom, "bottom face");
                checkTexture(tm.side, "side faces");
            } else {
                checkTexture(tm.top, "top"); checkTexture(tm.bottom, "bottom");
                checkTexture(tm.front, "front"); checkTexture(tm.back, "back");
                checkTexture(tm.left, "left"); checkTexture(tm.right, "right");
            }
        });

        // --- ITEMS ---
        Object.values(pack.items).forEach((item: ItemDefinition) => {
            if (item.textureId && !pack.textures[item.textureId]) {
                list.push({ level: 'error', tab: 'items', id: item.id, message: `Missing icon texture "${item.textureId}"` });
            }
            if (item.behavior.type === 'placeBlock' && item.behavior.blockId && !pack.blocks[item.behavior.blockId]) {
                list.push({ level: 'error', tab: 'items', id: item.id, message: `References missing block "${item.behavior.blockId}" to place` });
            }
        });

        // --- RECIPES ---
        Object.values(pack.recipes).forEach((recipe: RecipeDefinition) => {
            if (!recipe.output.id) {
                list.push({ level: 'warning', tab: 'recipes', id: recipe.id, message: `Recipe has no output set` });
            } else if (!pack.blocks[recipe.output.id] && !pack.items[recipe.output.id]) {
                list.push({ level: 'error', tab: 'recipes', id: recipe.id, message: `Missing output definition "${recipe.output.id}"` });
            }

            recipe.pattern.forEach((pid, idx) => {
                if (pid && !pack.blocks[pid] && !pack.items[pid]) {
                    list.push({ level: 'error', tab: 'recipes', id: recipe.id, message: `Missing ingredient "${pid}" in slot ${idx + 1}` });
                }
            });
        });

        return list;
    }, [pack]);

    return (
        <div className="flex-1 bg-black/20 p-8 overflow-y-auto">
            <div className="max-w-3xl mx-auto space-y-6">
                <div className="flex justify-between items-end border-b border-white/5 pb-4">
                    <div>
                        <h2 className="text-xl font-bold text-white uppercase tracking-tighter">Pack Validation</h2>
                        <p className="text-xs text-gray-500 mt-1">Found {issues.length} logical inconsistencies in "{pack.meta.name}"</p>
                    </div>
                    <div className="flex gap-4">
                         <div className="text-center">
                            <div className="text-red-500 font-black text-xl">{issues.filter(i=>i.level==='error').length}</div>
                            <div className="text-[8px] font-bold uppercase text-gray-600">Errors</div>
                         </div>
                         <div className="text-center">
                            <div className="text-yellow-500 font-black text-xl">{issues.filter(i=>i.level==='warning').length}</div>
                            <div className="text-[8px] font-bold uppercase text-gray-600">Warnings</div>
                         </div>
                    </div>
                </div>

                {issues.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-20 bg-green-500/5 border border-green-500/20 rounded-2xl text-center">
                         <div className="text-4xl mb-4">✨</div>
                         <h3 className="text-green-400 font-bold">Pack is Valid</h3>
                         <p className="text-green-800 text-xs mt-1">No logical errors or missing references found.</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {issues.map((issue, idx) => (
                            <div 
                                key={idx}
                                className={`group p-4 flex items-center gap-4 rounded-lg border cursor-pointer transition-all ${issue.level === 'error' ? 'bg-red-500/5 border-red-500/20 hover:bg-red-500/10' : 'bg-yellow-500/5 border-yellow-500/20 hover:bg-yellow-500/10'}`}
                                onClick={() => onFocusTab(issue.tab, issue.id)}
                            >
                                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${issue.level === 'error' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-yellow-500'}`} />
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-bold text-white/90">{issue.message}</div>
                                    <div className="flex gap-2 mt-1">
                                        <span className="text-[8px] font-black uppercase text-gray-600 bg-white/5 px-1.5 py-0.5 rounded">{issue.tab}</span>
                                        <span className="text-[8px] font-mono text-gray-700 truncate">{issue.id}</span>
                                    </div>
                                </div>
                                <div className="opacity-0 group-hover:opacity-100 text-[9px] font-black uppercase text-blue-500 tracking-tighter">FIX &rarr;</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
