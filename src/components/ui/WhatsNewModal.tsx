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
        <div className="absolute inset-0 z-[260] flex items-center justify-center bg-ink-950/70 atlas-fade-in" onClick={onClose}>
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                className="atlas-panel flex max-h-[88vh] w-[800px] max-w-[calc(100vw-2rem)] flex-col outline-none atlas-panel-in"
                onClick={(event) => event.stopPropagation()}
            >
                {/* Header */}
                <div className="shrink-0 px-7 pt-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <h2 id={titleId} className="atlas-title">What&apos;s New</h2>
                        <span className="text-px-2 text-parchment-400">
                            {entry.displayVersion}
                            {entry.date ? ` • ${entry.date}` : ' • Unreleased'}
                        </span>
                    </div>
                    {entry.title && <p className="mt-1 text-px-2 text-parchment-50 text-shadow-md">{entry.title}</p>}
                </div>

                {/* Scrollable body */}
                <div key={entry.version} role="region" aria-label="Release notes" tabIndex={0} className="atlas-well mx-7 my-4 min-h-0 flex-1 overflow-y-auto px-5 py-4 text-read text-parchment-100 scrollbar-thin atlas-fade-in focus-visible:outline focus-visible:outline-2 focus-visible:outline-star">
                    {entry.tagline && <p className="mb-6 text-parchment-300">{entry.tagline}</p>}

                    {sections.map((section) => (
                        <section key={section.title} className="mb-6 last:mb-0">
                            <h3 className="atlas-heading mb-3 border-b-2 border-ink-600 pb-2">{section.title}</h3>
                            <ul className="list-disc space-y-2 pl-5 marker:text-brass-400">
                                {section.items.map((item, index) => (
                                    <li key={index}>{item}</li>
                                ))}
                            </ul>
                        </section>
                    ))}
                </div>

                {/* Footer: version switcher + close */}
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-7 pb-6">
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Release history">
                        {CHANGELOG.map((option) => {
                            const active = option.version === entry.version;
                            return (
                                <MenuButton
                                    key={option.version}
                                    label={option.displayVersion}
                                    onClick={() => setActiveVersion(option.version)}
                                    pressed={active}
                                    width="w-[140px]"
                                    small
                                />
                            );
                        })}
                    </div>
                    <MenuButton label="Got it!" onClick={onClose} width="w-[140px]" variant="primary" small />
                </div>
            </div>
        </div>
    );
};
