import React, { useState } from 'react';
import { CHANGELOG, getChangelogEntry, getLatestChangelogEntry, type ChangelogEntry } from '../../data/changelog';
import { MenuButton } from './mainMenu/MainMenuControls';

interface WhatsNewModalProps {
    /** Version to show first. Falls back to the newest entry. */
    initialVersion?: string;
    onClose: () => void;
}

export const WhatsNewModal: React.FC<WhatsNewModalProps> = ({ initialVersion, onClose }) => {
    const initialEntry =
        (initialVersion ? getChangelogEntry(initialVersion) : undefined) ?? getLatestChangelogEntry();
    const [activeVersion, setActiveVersion] = useState<string | undefined>(initialEntry?.version);

    const entry: ChangelogEntry | undefined = activeVersion ? getChangelogEntry(activeVersion) : initialEntry;

    if (!entry) return null;

    return (
        <div className="absolute inset-0 z-[260] flex items-center justify-center bg-black/70" onClick={onClose}>
            <div
                className="flex max-h-[80vh] w-[640px] flex-col border-2 border-white border-b-[#373737] border-r-[#373737] bg-[#151515]"
                onClick={(event) => event.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-baseline justify-between border-b border-[#373737] px-6 py-4">
                    <h2 className="text-2xl font-bold text-white [text-shadow:1px_1px_0px_#3f3f3f]">What&apos;s New</h2>
                    <span className="font-minecraft text-sm text-yellow-300">
                        {entry.displayVersion}
                        {entry.date ? ` • ${entry.date}` : ' • Unreleased'}
                    </span>
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto px-6 py-4 font-minecraft text-sm leading-relaxed text-gray-200">
                    {entry.tagline && <p className="mb-4 text-gray-300">{entry.tagline}</p>}

                    {entry.highlights.length > 0 && (
                        <div className="mb-5 border-l-4 border-yellow-400/70 bg-white/5 px-4 py-3">
                            <h3 className="mb-2 text-xs uppercase tracking-wide text-yellow-300">Highlights</h3>
                            <ul className="list-disc space-y-1 pl-5 text-gray-100">
                                {entry.highlights.map((item, index) => (
                                    <li key={index}>{item}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {entry.sections.map((section) => (
                        <div key={section.title} className="mb-4">
                            <h3 className="mb-1 font-bold text-white">{section.title}</h3>
                            <ul className="list-disc space-y-1 pl-5 text-gray-300">
                                {section.items.map((item, index) => (
                                    <li key={index}>{item}</li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>

                {/* Footer: version switcher + close */}
                <div className="flex items-center justify-between gap-4 border-t border-[#373737] px-6 py-4">
                    <div className="flex flex-wrap gap-2">
                        {CHANGELOG.map((option) => {
                            const active = option.version === entry.version;
                            return (
                                <button
                                    key={option.version}
                                    onClick={() => setActiveVersion(option.version)}
                                    className={`border px-2 py-1 font-minecraft text-xs ${
                                        active
                                            ? 'border-white bg-[#8b8b8b] text-white'
                                            : 'border-[#373737] text-gray-400 hover:text-white'
                                    }`}
                                >
                                    {option.displayVersion}
                                </button>
                            );
                        })}
                    </div>
                    <MenuButton label="Got it!" onClick={onClose} width="w-[140px]" variant="primary" small />
                </div>
            </div>
        </div>
    );
};
