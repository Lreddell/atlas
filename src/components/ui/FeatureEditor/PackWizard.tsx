
import React, { useState } from 'react';

interface PackWizardProps {
    onClose: () => void;
    onSave: (id: string, name: string) => void;
    existingIds: string[];
}

export const PackWizard: React.FC<PackWizardProps> = ({ onClose, onSave, existingIds }) => {
    const [name, setName] = useState('');
    const [id, setId] = useState('');
    const [error, setError] = useState('');

    const handleIdChange = (val: string) => {
        const sanitized = val.toLowerCase().replace(/[^a-z0-9_]/g, '');
        setId(sanitized);
    };

    const handleCreate = () => {
        if (!name.trim()) return setError('Name is required');
        if (!id.trim()) return setError('ID is required');
        if (existingIds.includes(id)) return setError('Pack ID must be unique');
        onSave(id, name);
    };

    return (
        <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-auto font-game">
            <div className="bg-[#c6c6c6] border-4 border-white border-b-[#444] border-r-[#444] p-8 w-[400px] text-black shadow-2xl">
                <h2 className="text-xl font-bold mb-6 uppercase tracking-wider border-b-2 border-black/10 pb-2">New Mod Pack</h2>
                
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold uppercase text-black/60 mb-1">Display Name</label>
                        <input 
                            autoFocus
                            type="text"
                            value={name}
                            onChange={(e) => { setName(e.target.value); setError(''); }}
                            placeholder="My Awesome Feature"
                            className="w-full bg-white border-2 border-[#8b8b8b] border-t-black border-l-black p-2 outline-none focus:border-blue-500"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold uppercase text-black/60 mb-1">Unique ID (slug)</label>
                        <input 
                            type="text"
                            value={id}
                            onChange={(e) => { handleIdChange(e.target.value); setError(''); }}
                            placeholder="my_feature_pack"
                            className="w-full bg-white border-2 border-[#8b8b8b] border-t-black border-l-black p-2 outline-none focus:border-blue-500"
                        />
                    </div>
                </div>

                {error && <div className="mt-4 text-red-600 text-xs font-bold">{error}</div>}

                <div className="flex gap-4 mt-8">
                    <button 
                        onClick={onClose}
                        className="flex-1 px-4 py-2 bg-[#8b8b8b] hover:bg-[#a0a0a0] border-2 border-white border-b-[#373737] border-r-[#373737] text-white font-bold text-shadow-md active:border-b-white active:border-r-white"
                    >
                        CANCEL
                    </button>
                    <button 
                        onClick={handleCreate}
                        className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 border-2 border-blue-400 border-b-blue-900 border-r-blue-900 text-white font-bold text-shadow-md active:border-b-blue-400 active:border-r-blue-400"
                    >
                        CREATE
                    </button>
                </div>
            </div>
        </div>
    );
};
