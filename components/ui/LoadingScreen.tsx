
import React, { useEffect, useState } from 'react';
import { getDirtBackground } from '../../utils/textures';
import { MenuPanoramaBackground } from './MenuPanoramaBackground';

interface LoadingScreenProps {
    phase: string;
    percent: number;
    details: string;
    backgroundMode?: 'dirt' | 'panorama';
    panoramaBackgroundDataUrl?: string | null;
    panoramaFaceDataUrls?: string[] | null;
    panoramaBlur?: number;
    panoramaGradient?: number;
    panoramaRotationSpeed?: number;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
    phase,
    percent,
    details,
    backgroundMode = 'dirt',
    panoramaBackgroundDataUrl = null,
    panoramaFaceDataUrls = null,
    panoramaBlur = 0,
    panoramaGradient = 0.4,
    panoramaRotationSpeed = 1,
}) => {
    const [bgPattern, setBgPattern] = useState('');
    const clampedPercent = Math.max(0, Math.min(100, Math.floor(percent)));

    useEffect(() => {
        setBgPattern(getDirtBackground());
    }, []);

    return (
        <div 
            className="absolute inset-0 flex flex-col items-center justify-center z-[500]"
            style={backgroundMode === 'panorama' ? undefined : {
                backgroundImage: `url(${bgPattern})`,
                backgroundSize: '64px',
                imageRendering: 'pixelated'
            }}
        >
            {backgroundMode === 'panorama' && (
                <MenuPanoramaBackground
                    backgroundMode={backgroundMode}
                    panoramaBackgroundDataUrl={panoramaBackgroundDataUrl}
                    panoramaFaceDataUrls={panoramaFaceDataUrls}
                    panoramaBlur={panoramaBlur}
                    panoramaGradient={panoramaGradient}
                    panoramaRotationSpeed={panoramaRotationSpeed}
                />
            )}
            <div className="flex flex-col items-center w-[400px] gap-6">
                <h1 className="text-white font-minecraft text-xl shadow-black drop-shadow-md">
                    {phase || 'Loading'}
                </h1>
                
                <div className="w-full bg-[#111] border-2 border-white/30 h-8 relative">
                    <div 
                        className="h-full bg-[#2e7d32] transition-all duration-100 ease-linear"
                        style={{ width: `${clampedPercent}%` }}
                    />
                </div>
                
                <div className="text-gray-400 font-minecraft text-sm">
                    {details || 'Please wait...'} ({clampedPercent}%)
                </div>
            </div>
        </div>
    );
};
