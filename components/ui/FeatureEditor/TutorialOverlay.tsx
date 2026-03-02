
import React, { useState, useEffect, useRef } from 'react';

export interface TutorialStep {
    targetId: string;
    title: string;
    text: string;
}

interface TutorialOverlayProps {
    steps: TutorialStep[];
    currentStep: number;
    onNext: () => void;
    onBack: () => void;
    onClose: () => void;
}

export const TutorialOverlay: React.FC<TutorialOverlayProps> = ({ steps, currentStep, onNext, onBack, onClose }) => {
    const [rect, setRect] = useState<DOMRect | null>(null);
    const step = steps[currentStep];
    const requestRef = useRef<number | null>(null);

    const updateRect = () => {
        const el = document.getElementById(step.targetId);
        if (el) {
            setRect(el.getBoundingClientRect());
        } else {
            console.warn(`Tutorial target element #${step.targetId} not found. Skipping to next step.`);
            onNext();
        }
        requestRef.current = requestAnimationFrame(updateRect);
    };

    useEffect(() => {
        requestRef.current = requestAnimationFrame(updateRect);
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [currentStep, step.targetId]);

    if (!rect) return null;

    const padding = 4;
    const boxX = rect.left - padding;
    const boxY = rect.top - padding;
    const boxW = rect.width + padding * 2;
    const boxH = rect.height + padding * 2;

    // Determine tooltip position
    const tooltipOnTop = boxY > 250;
    const tooltipX = Math.max(20, Math.min(window.innerWidth - 320, boxX + boxW / 2 - 150));
    const tooltipY = tooltipOnTop ? boxY - 180 : boxY + boxH + 20;

    return (
        <div className="fixed inset-0 z-[600] pointer-events-none overflow-hidden font-minecraft">
            {/* Darkened Mask with hole using SVG */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
                <defs>
                    <mask id="spotlight-mask">
                        <rect width="100%" height="100%" fill="white" />
                        <rect 
                            x={boxX} 
                            y={boxY} 
                            width={boxW} 
                            height={boxH} 
                            fill="black" 
                            rx="4"
                        />
                    </mask>
                </defs>
                <rect 
                    width="100%" 
                    height="100%" 
                    fill="rgba(0,0,0,0.75)" 
                    mask="url(#spotlight-mask)" 
                    className="pointer-events-auto"
                    onClick={onClose}
                />
                {/* Highlight border */}
                <rect 
                    x={boxX} 
                    y={boxY} 
                    width={boxW} 
                    height={boxH} 
                    fill="none" 
                    stroke="#3b82f6" 
                    strokeWidth="3" 
                    rx="4"
                    className="animate-pulse"
                />
            </svg>

            {/* Instruction Tooltip */}
            <div 
                className="absolute w-80 bg-black border-2 border-blue-500 p-5 rounded-lg shadow-2xl pointer-events-auto z-[610] transition-all duration-300"
                style={{ left: tooltipX, top: tooltipY }}
            >
                <div className="flex justify-between items-start mb-2">
                    <h3 className="text-blue-400 font-bold text-lg">{step.title}</h3>
                    <span className="text-gray-500 text-xs">{currentStep + 1}/{steps.length}</span>
                </div>
                <p className="text-gray-300 text-sm leading-relaxed mb-6">
                    {step.text}
                </p>
                <div className="flex justify-between gap-2">
                    <button 
                        onClick={onClose}
                        className="text-gray-500 hover:text-white text-xs px-2"
                    >
                        Skip
                    </button>
                    <div className="flex gap-2">
                        {currentStep > 0 && (
                            <button 
                                onClick={onBack}
                                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-xs font-bold"
                            >
                                Back
                            </button>
                        )}
                        <button 
                            onClick={onNext}
                            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-xs font-bold shadow-lg"
                        >
                            {currentStep === steps.length - 1 ? 'Finish' : 'Next'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
