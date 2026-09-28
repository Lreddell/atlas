import React, { useState } from 'react';
import { soundManager } from '../../../systems/sound/SoundManager';

// The menus' buttons and sliders (styles in styles.css: .atlas-btn,
// .atlas-slider). One slider serves the title screen and the pause menu.

interface MenuButtonProps {
    label: string;
    onClick?: () => void;
    width?: string;
    disabled?: boolean;
    tooltip?: string;
    small?: boolean;
    variant?: 'normal' | 'primary' | 'danger';
    pressed?: boolean;
}

const VARIANT_CLASS: Record<NonNullable<MenuButtonProps['variant']>, string> = {
    normal: '',
    primary: 'atlas-btn-primary',
    danger: 'atlas-btn-danger',
};

export const MenuButton: React.FC<MenuButtonProps> = ({
    label,
    onClick,
    width = 'w-96',
    disabled = false,
    tooltip,
    small,
    variant = 'normal',
    pressed,
}) => {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <div
            className={`relative ${width}`}
            onMouseEnter={() => {
                setIsHovered(true);
                if (!disabled) soundManager.play('ui.hover', { volume: 0.2, pitch: 2.0 });
            }}
            onMouseLeave={() => setIsHovered(false)}
        >
            <button
                type="button"
                disabled={disabled}
                aria-disabled={disabled}
                aria-pressed={pressed}
                onClick={(event) => {
                    event.stopPropagation();
                    if (!disabled && onClick) {
                        soundManager.play('ui.click');
                        onClick();
                    }
                }}
                className={`atlas-btn ${VARIANT_CLASS[variant]} w-full ${small ? 'h-8 leading-[22px]' : 'h-10'}`}
                title={tooltip}
            >
                <span className="atlas-btn-label">{label}</span>
            </button>
            {disabled && isHovered && tooltip && (
                <div className="atlas-tooltip pointer-events-none absolute left-[calc(100%+8px)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap text-px-2 text-parchment-100">
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
    step?: number;
    onChange: (value: number) => void;
    width?: string;
    formatValue?: (value: number) => string;
    disabled?: boolean;
}

export const MenuSlider: React.FC<MenuSliderProps> = ({
    label,
    value,
    min,
    max,
    step = 0.01,
    onChange,
    width = 'w-80',
    formatValue,
    disabled = false,
}) => {
    const fraction = Math.max(0, Math.min(1, (value - min) / (max - min)));
    const percentage = fraction * 100;

    return (
        <div
            className={`atlas-slider h-10 ${width} ${disabled ? 'opacity-60' : ''}`}
            aria-disabled={disabled}
            onMouseDown={(event) => { if (!disabled) event.stopPropagation(); }}
            onMouseUp={(event) => {
                event.stopPropagation();
                if (!disabled) soundManager.play('ui.slider');
            }}
        >
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                disabled={disabled}
                aria-label={label}
                onChange={(event) => onChange(parseFloat(event.target.value))}
                className="absolute inset-0 z-20 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
            />
            <div className="atlas-slider-fill pointer-events-none" style={{ width: `calc((100% - 12px) * ${fraction} + 4px)` }} />
            <div className="atlas-slider-knob pointer-events-none" style={{ left: `calc((100% - 12px) * ${fraction})` }} />
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center whitespace-nowrap px-4 text-px-2 text-parchment-100 text-shadow-md">
                {label}: {formatValue ? formatValue(value) : `${Math.round(percentage)}%`}
            </div>
        </div>
    );
};
