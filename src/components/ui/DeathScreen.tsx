
import React from 'react';
import { MenuButton } from './mainMenu/MainMenuControls';

interface DeathScreenProps {
    onRespawn: () => void;
}

export const DeathScreen: React.FC<DeathScreenProps> = ({ onRespawn }) => {
    return (
        <div 
            className="absolute inset-0 bg-red-950/80 z-[100] flex flex-col items-center justify-center backdrop-blur-sm atlas-fade-in-slow pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
        >
            <h1 className="text-6xl font-bold font-pixel text-white drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)] mb-8 atlas-panel-in" style={{ animationDelay: '250ms' }}>You Died!</h1>
            <div className="atlas-panel-in" style={{ animationDelay: '550ms' }}>
                <MenuButton label="Respawn" onClick={onRespawn} width="w-[240px]" />
            </div>
        </div>
    );
};
