import React, { useState } from 'react';
import { CHANGELOG, getChangelogEntry, getLatestChangelogEntry, type ChangelogEntry } from '../../data/changelog';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { MenuButton } from './mainMenu/MainMenuControls';

interface WhatsNewModalProps {
    /** Version to show first. Falls back to the newest entry. */
    initialVersion?: string;
    onClose: () => void;
}

export const WhatsNewModal: React.FC<WhatsNewModalProps> = ({ initialVersion, onClose }) => {
    const dialogRef = useDialogFocus<HTMLDivElement>(onClose);
    const titleId = 'atlas-whats-new-title';
    const initialEntry =
        (initialVersion ? getChangelogEntry(initialVersion) : undefined) ?? getLatestChangelogEntry();
    const [activeVersion, setActiveVersion] = useState<string | undefined>(initialEntry?.version);

    const entry: ChangelogEntry | undefined = activeVersion ? getChangelogEntry(activeVersion) : initialEntry;

    if (!entry) return null;

    const sections = entry.highlights.length > 0
        ? [{ title: 'Highlights', items: entry.highlights }, ...entry.sections]
        : entry.sections;

    return (
        <div className="absolute inset-0 z-[260] flex items-center justify-center bg-black/70 atlas-fade-in" onClick={onClose}>
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                className="flex max-h-[88vh] w-[760px] max-w-[calc(100vw-2rem)] flex-col border-2 border-white border-b-[#373737] border-r-[#373737] bg-[#151515] font-pixel text-white outline-none"
                onClick={(event) => event.stopPropagation()}
            >
                {/* Header */}
                <div className="shrink-0 border-b-2 border-[#373737] px-4 py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <h2 id={titleId} className="text-xl font-bold [text-shadow:2px_2px_0px_#3f3f3f]">What&apos;s New</h2>
                        <span className="text-xs text-gray-300">
                            {entry.displayVersion}
                            {entry.date ? ` • ${entry.date}` : ' • Unreleased'}
                        </span>
                    </div>
                    {entry.title && <p className="mt-2 text-2xl font-bold text-yellow-200 [text-shadow:2px_2px_0px_#3f3f3f]">{entry.title}</p>}
                </div>

                {/* Scrollable body */}
                <div key={entry.version} role="region" aria-label="Release notes" tabIndex={0} className="mx-4 my-4 min-h-0 flex-1 overflow-y-auto border-2 border-[#373737] border-b-[#777] border-r-[#777] bg-black/40 p-4 text-sm leading-relaxed text-gray-200 scrollbar-thin atlas-fade-in focus-visible:outline focus-visible:outline-1 focus-visible:outline-white">
                    {entry.tagline && <p className="mb-6 text-gray-300">{entry.tagline}</p>}

                    {sections.map((section) => (
                        <section key={section.title} className="mb-6 last:mb-0">
                            <h3 className="mb-3 border-b border-white/20 pb-2 text-base font-bold text-white [text-shadow:1px_1px_0px_#3f3f3f]">{section.title}</h3>
                            <ul className="list-disc space-y-2 pl-5 marker:text-gray-400">
                                {section.items.map((item, index) => (
                                    <li key={index}>{item}</li>
                                ))}
                            </ul>
                        </section>
                    ))}
                </div>

                {/* Footer: version switcher + close */}
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-4 pb-4">
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Release history">
                        {CHANGELOG.map((option) => {
                            const active = option.version === entry.version;
                            return (
                                <MenuButton
                                    key={option.version}
                                    label={option.displayVersion}
                                    onClick={() => setActiveVersion(option.version)}
                                    pressed={active}
                                    width="w-[116px]"
                                    small
                                />
                            );
                        })}
                    </div>
                    <MenuButton label="Done" onClick={onClose} width="w-[120px]" small />
                </div>
            </div>
        </div>
    );
};
