import React from 'react';
import * as THREE from 'three';
import { MenuButton } from './mainMenu/MainMenuControls';

interface ErrorOverlayProps {
    error: string;
    playerPos?: THREE.Vector3;
}

export const ErrorOverlay: React.FC<ErrorOverlayProps> = ({ error, playerPos }) => (
    <div className="absolute inset-0 z-[9999] pointer-events-auto flex items-center justify-center bg-ink-950/85 p-8">
        <div className="atlas-panel flex max-w-4xl flex-col items-start gap-4 px-6 pb-6 pt-4">
            <h1 className="atlas-heading text-ember-300">Runtime Error</h1>
            <div className="atlas-well max-h-[60vh] w-full overflow-auto whitespace-pre-wrap p-4 font-mono text-mono-2 text-parchment-100">
                {error}
            </div>
            {playerPos && (
                <div className="atlas-hint">
                    Last known position: {playerPos.x.toFixed(2)}, {playerPos.y.toFixed(2)}, {playerPos.z.toFixed(2)}
                </div>
            )}
            <MenuButton label="Reload Application" onClick={() => window.location.reload()} width="w-[260px]" />
        </div>
    </div>
);
