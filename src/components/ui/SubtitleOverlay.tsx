import React, { useEffect, useState } from 'react';
import { subtitleEvents, type SubtitleEvent } from '../../systems/sound/SubtitleEvents';

export const SubtitleOverlay: React.FC = () => {
    const [events, setEvents] = useState<SubtitleEvent[]>([]);
    useEffect(() => subtitleEvents.subscribe((event) => {
        setEvents((current) => [...current.filter((value) => Date.now() - value.createdAt < 3000), event].slice(-4));
        window.setTimeout(() => setEvents((current) => current.filter((value) => value.id !== event.id)), 3000);
    }), []);
    if (events.length === 0) return null;
    return (
        <div className="absolute right-5 bottom-24 z-[210] pointer-events-none flex flex-col items-end gap-1" aria-live="polite">
            {events.map((event) => <div key={event.id} className="bg-black/75 text-white px-2 py-1 font-pixel text-xs border border-white/20">{event.text}</div>)}
        </div>
    );
};
