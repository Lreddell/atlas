import React, { useState } from 'react';
import { soundManager } from '../../../systems/sound/SoundManager';

interface MenuButtonProps {
    label: string;
    onClick?: () => void;
    width?: string;
    disabled?: boolean;
    tooltip?: string;
    small?: boolean;
    variant?: 'normal' | 'primary' | 'danger';
}

export const MenuButton: React.FC<MenuButtonProps> = ({
    label,
    onClick,
    width = 'w-96',
    disabled = false,
    tooltip,
    small,
    variant = 'normal',
}) => {
    const [isHovered, setIsHovered] = useState(false);

    let colors = 'bg-[#8b8b8b] border-white border-b-[#373737] border-r-[#373737] text-white';
    if (variant === 'primary') colors = 'bg-[#8b8b8b] border-white border-b-[#373737] border-r-[#373737] text-white';
    if (variant === 'danger') colors = 'bg-red-700 border-red-400 border-b-red-950 border-r-red-950 text-white';

    return (
        <div className="relative">
            <button
                onClick={(event) => {
                    event.stopPropagation();
                    if (!disabled && onClick) {
                        soundManager.play('ui.click');
                        onClick();
                    }
                }}
                onMouseEnter={() => {
                    setIsHovered(true);
                    if (!disabled) soundManager.play('ui.hover', { volume: 0.2, pitch: 2.0 });
                }}
                onMouseLeave={() => setIsHovered(false)}
                className={`
                    ${width} ${small ? 'h-8 text-sm' : 'h-10'} relative border-2 select-none outline-none group
                    ${colors}
                    font-minecraft [text-shadow:1px_1px_0px_#3f3f3f]
                    ${disabled ? 'opacity-70 cursor-not-allowed grayscale' : 'hover:brightness-110 active:border-white active:border-b-white active:border-r-white'}
                `}
                title={tooltip}
            >
                <div className={`absolute inset-[2px] border-2 border-transparent ${!disabled && 'group-active:border-white/10'} pointer-events-none`} />
                <span className="relative top-0 group-active:top-[1px]">{label}</span>
            </button>
            {disabled && isHovered && tooltip && (
                <div className="absolute left-[105%] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap border-2 border-[#2a0b4d] bg-[#100010] px-2 py-1 text-sm text-white font-minecraft">
                    {tooltip}
                </div>
            )}
        </div>
    );
};

interface MenuSliderProps {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
    width?: string;
    formatValue?: (value: number) => string;
}

export const MenuSlider: React.FC<MenuSliderProps> = ({
    label,
    value,
    min,
    max,
    step,
    onChange,
    width = 'w-80',
    formatValue,
}) => {
    const percentage = ((value - min) / (max - min)) * 100;

    return (
        <div
            className={`relative h-10 ${width} border-2 border-white border-b-[#373737] border-r-[#373737]`}
            onMouseDown={(event) => event.stopPropagation()}
            onMouseUp={(event) => {
                event.stopPropagation();
                soundManager.play('ui.slider');
            }}
        >
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(event) => onChange(parseFloat(event.target.value))}
                className="absolute inset-0 z-20 h-full w-full cursor-pointer opacity-0"
            />
            <div className="pointer-events-none absolute inset-0 border border-[#555] bg-[#8b8b8b]">
                <div
                    className="absolute bottom-0 top-0 border-r-2 border-black/20 bg-[#a0a0a0]"
                    style={{ width: `${percentage}%` }}
                />
            </div>
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center font-minecraft text-white [text-shadow:1px_1px_0px_#3f3f3f]">
                {label}: {formatValue ? formatValue(value) : `${Math.round(percentage)}%`}
            </div>
        </div>
    );
};
