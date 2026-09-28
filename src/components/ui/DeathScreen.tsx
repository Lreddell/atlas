
import React from 'react';
import { MenuButton } from './mainMenu/MainMenuControls';

interface DeathScreenProps {
    onRespawn: () => void;
}

export const DeathScreen: React.FC<DeathScreenProps> = ({ onRespawn }) => {
    return (
        <div
            className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-[#3a0b0e]/60 backdrop-grayscale-[.8] atlas-fade-in-slow pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
        >
            {/* The world behind drains of colour; the words stand in parchment. */}
            <h1 className="mb-10 text-[66px] leading-[80px] text-parchment-50 [text-shadow:6px_6px_0_#070917] atlas-panel-in" style={{ animationDelay: '250ms' }}>You Died!</h1>
            <div className="atlas-panel-in" style={{ animationDelay: '550ms' }}>
                <MenuButton label="Respawn" onClick={onRespawn} width="w-[320px]" variant="primary" />
            </div>
        </div>
    );
};
