
import React from 'react';

export const FireOverlay: React.FC = () => {
    return (
        <div 
            className="absolute inset-0 pointer-events-none z-30 opacity-70 mix-blend-screen"
            style={{
                background: `
                    radial-gradient(circle at 50% 120%, rgba(255, 100, 0, 0.8) 10%, transparent 60%),
                    linear-gradient(0deg, rgba(255, 50, 0, 0.6) 0%, transparent 40%)
                `,
                animation: 'firePulse 0.5s infinite alternate'
            }}
        >
            <style>{`
                @keyframes firePulse {
                    0% { transform: scale(1.0); opacity: 0.7; }
                    100% { transform: scale(1.05); opacity: 0.8; }
                }
            `}</style>
        </div>
    );
};
