
import React from 'react';
import * as THREE from 'three';

interface ErrorOverlayProps {
    error: string;
    playerPos?: THREE.Vector3;
}

export const ErrorOverlay: React.FC<ErrorOverlayProps> = ({ error, playerPos }) => (
    <div className="absolute top-0 left-0 w-full h-full z-[9999] pointer-events-auto p-8 flex flex-col items-start justify-center bg-black/80 text-white font-mono">
        <h1 className="text-4xl font-bold text-red-500 mb-4">Runtime Error</h1>
        <div className="bg-red-950/50 border border-red-500 p-4 rounded max-w-4xl max-h-[60vh] overflow-auto whitespace-pre-wrap mb-4">
            {error}
        </div>
        {playerPos && (
            <div className="text-yellow-400">
                Last Known Position: {playerPos.x.toFixed(2)}, {playerPos.y.toFixed(2)}, {playerPos.z.toFixed(2)}
            </div>
        )}
        <button 
            className="mt-8 px-6 py-2 bg-white text-black font-bold rounded hover:bg-gray-200"
            onClick={() => window.location.reload()}
        >
            Reload Application
        </button>
    </div>
);
