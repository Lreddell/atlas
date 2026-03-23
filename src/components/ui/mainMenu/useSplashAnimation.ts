import React, { useEffect, useMemo, useState } from 'react';

const SPLASH_HOLD_DURATION_MS = 10000;
const SPLASH_GLYPHIFY_TICK_MS = 50;
const SPLASH_REVEAL_TICK_MS = 90;
const ULTRA_RARE_SPLASH_CHANCE = 0.01;
const SPLASH_FORMAT_MARKER = '\u00A7';
const DEFAULT_SPLASH_COLOR = '#fde047';

const SPLASHES = [
    'Also try Minecraft!', 'Procedural!', 'Voxel based!', 'React + Three.js!', 'Infinite world!',
    'Open source!', 'Made with AI!', '100% bugs!', 'Check out the code!', "Don't dig down!",
    'Uses Web Workers!', 'Greedy meshing!', 'Now with biomes!', 'Hello World!',
    'Powered by Vite!', 'Diamonds!', 'Look behind you!', 'Splashes are random!',
    'Better than real life!', 'Try WorldEdit!', 'Blocky goodness!', 'Undefined behavior!', 'NaN!', '0 FPS!', 'Just one more block...',
    'Lighting is hard!', 'Shadows included!', 'Made in a cave!', 'With a box of scraps!',
    'Now with extra splashes!', 'Chunk by chunk!', 'Sky is not the limit!', 'Sunrise simulator!',
    'Bedtime approved!', 'Inventory Tetris!', 'Craft responsibly!', 'Punching trees works?', 'Grass is greener here!',
    'Cobble all day!', "Smelt it like it's hot!", 'Awaiting multiplayer!', 'Press E to inventory!',
    'Press / for commands!', 'Biome hunter!', 'Spawn point saved!', 'Sleep to skip night!',
    'Clouds enabled!', 'Fog machine online!', 'GPU says hello!', 'CPU doing its best!', 'Loading chunks...',
    'Meshing in progress!', 'Worker-powered!', 'Procedurally delicious!', 'Terrain never ends!', 'Watch your step!',
    'Build. Break. Repeat.', 'Paused? Never heard of it.', 'Worlds in your pocket!', 'Atlas knows the way!',
    'No microtransactions!', 'Free-range voxels!', 'Seed of destiny!', 'Try a weird seed!', 'Day-night certified!',
    'Friendly neighborhood blocks!', 'Stone age speedrun!', 'Wood acquired!', 'Torch the darkness!', 'Stay hydrated, player!',
    'Spectator mode unlocked!', 'Creative juices flowing!', 'Survival instincts active!', 'This splash is true!',
    'Bug? Feature!', 'Blocks all the way down!', 'Welcome back, crafter!', 'Pickaxe recommended!', '*Digging intensifies*',
    'Now with fewer crashes*!', '*Not guaranteed!', 'If you see void, walk away!', 'Gravity works most days!', 'Physics is a suggestion!',
    'May contain minor chaos*', 'Chunk not found? Keep walking!', 'Lag spike detected!',
    'Works on my machine!', 'Reload and pretend nothing happened!', 'Unexpectedly expected behavior!',
    'If stuck, jump repeatedly!', 'Try turning it off and on!', 'Feature-rich, bug-richer!', 'One tiny bug at a time!',
    'No clip? Not today!', "Edge of map? There isn't one!", 'Oops, all edge cases!', 'Patch notes pending...', 'Debug mode is my love language!',
    'Fresh bugs, hot and ready!', 'Collision is negotiable!', 'This block is definitely solid... probably!', "Don't trust floating sand!",
    "Broken? It's immersive!", 'Warning: fun may be unstable!', 'Glitch% speedrun ready!', 'Alt+F4 is not a feature!', 'Your bug report is appreciated!',
    'Water physics went on vacation!', 'Fire spreads fast, regret faster!',
    "Don't be scared of the dark!", 'Just a harmless rendering artifact!', 'FPS is a social construct!', 'Compiling more confidence!',
    'Everything is fine. Totally.',
    'Mining with confidence issues!', '100% reproducible... maybe!', 'Bug fixed in the next timeline!',
    'Hotfix incoming eventually!', "If it flickers, it's dynamic!",
    'Blood moon build incoming!', 'Moon phase certified!', 'Touch grass block.', 'F3 knows too much!', 'F4 sees every pixel!',
    'F8 for the postcard shot!', 'Panorama worthy terrain!', 'Chunk fade looks intentional!', 'Texture atlas inspected!',
    'slash command enjoyer', '/gamemode fixes everything!', '/time set day, coward.', '/music skip, DJ player!',
    'Locate biome, lose afternoon.', "Blood moon? That's content.", 'Spectator mode, look but no touch',
    'Creative mode tax write-off.', 'Survival first, patch later.', 'Import world, export chaos!',
    'Saved as atlas-world-export!', 'Seedposting encouraged.',
    'Greedy meshing, greedy dreams.', 'Clouds on, excuses off.', 'Inventory full, ambitions fuller.',
    'Moon phase meta incoming.', 'Panorama settings perfectionist.', 'World Editor remembers.',
    'Feature Editor arc begins soon.', 'Biome hunting hours!', 'Debug screen jumpscare!', 'Soundtrack swap approved.',
    'Blood moon arc loading...', 'Chunkbase called. Again.',
    '\u00A74\u00A7lC\u00A7c\u00A7lo\u00A76\u00A7ll\u00A7e\u00A7lo\u00A7a\u00A7lr\u00A72\u00A7lm\u00A7b\u00A7la\u00A79\u00A7lt\u00A7d\u00A7li\u00A75\u00A7lc\u00A7r\u00A7l!',
    'Also try Hytale!', 'Does anyone call it x.com?', "Don't forget to do your taxes!",
];

const ULTRA_RARE_SPLASHES = [
    '',
    '\u00A76\u00A7lI wonder if anyone will ever see this splash?',
    "\u00A76Use code \u00A7lATLAS \u00A7r\u00A76for 10% off! Just kidding, it's free!",
    "\u00A76\u00A7lI can't believe it's not Minecraft!",
    '\u00A76\u00A7lVibe check failed. Please insert more vibes.',
    '\u00A76\u00A7l12 FPS on a supercomputer?',
    '\u00A76\u00A7lThe block is a lie!',
    '\u00A76\u00A7lZero crashes today! I swear!',
    '\u00A76\u00A7lHerobrine added!',
    '\u00A70\u00A7lT H E V O I D S T A R E S B A C K',
    '\u00A76\u00A7lChatGPT wrote this splash!',
    '\u00A76\u00A7lHey @Grok, why is the entire game broken?',
    "\u00A7k\u00A7l\u00A76Youshouldn'tbeabletoseethis",
    '\u00A76\u00A7lPlaying for the \u00A7l*vibes*',
    '\u00A76\u00A7lYou found a rare splash!',
    '\u00A76\u00A7lDid you know?',
    '\u00A76\u00A7l42',
    '\u00A76\u00A7lwhy am I even writing these?',
    '\u00A76\u00A7l50% of the time, it works every time!',
    '\u00A77\u00A7l50 shades of blocks!',
    '\u00A76\u00A7lNot owned by Microslop!',
    '\u00A7c\u00A7lClanker approved!',
    '\u00A76\u00A7lwhy are you still reading this? go play the game!',
    '\u00A76\u00A7lggs no heals',
    '\u00A7b\u00A7l80 hours of jeff on marvel rivals!',
    '\u00A76\u00A7lsub to @ry_no_xx on youtube!',
    '\u00A76\u00A7lwatch @ry_no_x on twitch!',
    '\u00A7c\u00A7lBased and red-pilled',
    "\u00A7b\u00A7lYou are amazon's 100,000th customer! Just kidding, but you found a rare splash!",
    "\u00A76Congratulations! You've unlocked the secret ultra-rare splash! Celebrate by sharing it with your friends, or maybe even screenshotting it and setting it as your desktop background. Enjoy this moment of pixelated glory!",
    "\u00A7dThis splash is so rare, it only appears once in a blue moon. In fact, it's so elusive that some players have spent hours trying to see it, only to be rewarded with this very message. If you've found this splash, consider yourself part of an exclusive club of Atlas enthusiasts who have witnessed one of the rarest occurrences in the game. Share your discovery and bask in the glory of your ultra-rare find!",
];

const MC_COLOR_BY_CODE: Record<string, string> = {
    '0': '#000000',
    '1': '#0000AA',
    '2': '#00AA00',
    '3': '#00AAAA',
    '4': '#AA0000',
    '5': '#AA00AA',
    '6': '#FFAA00',
    '7': '#AAAAAA',
    '8': '#555555',
    '9': '#5555FF',
    a: '#55FF55',
    b: '#55FFFF',
    c: '#FF5555',
    d: '#FF55FF',
    e: '#FFFF55',
    f: '#FFFFFF',
};

const OBFUSCATION_SOURCE = [
    ...Array.from({ length: 94 }, (_, index) => String.fromCharCode(index + 33)),
    ...Array.from({ length: 95 }, (_, index) => String.fromCharCode(index + 161)),
].join('');

interface SplashCharacter {
    char: string;
    style: React.CSSProperties;
    styleKey: string;
    isAuthoredObfuscated: boolean;
}

interface DisplaySplashCharacter {
    char: string;
    style: React.CSSProperties;
    styleKey: string;
}

interface TransitionSlot {
    id: number;
    currentCharacter?: SplashCharacter;
    targetCharacter?: SplashCharacter;
    isGlyphified: boolean;
    isRevealed: boolean;
    displayCharacter: string;
    displayStyle: React.CSSProperties;
    displayStyleKey: string;
}

interface SplashTransitionState {
    slots: TransitionSlot[];
    pendingGlyphifySlotIds: number[];
    pendingAddLeft: SplashCharacter[];
    pendingAddRight: SplashCharacter[];
    pendingRemoveLeft: number;
    pendingRemoveRight: number;
    targetCharacters: SplashCharacter[];
    targetRaw: string;
    targetFontSize: number;
}

export interface FormattedSplashSegment {
    text: string;
    style: React.CSSProperties;
}

const getRandomArrayItem = <T,>(items: T[]): T | undefined => items[Math.floor(Math.random() * items.length)];

const takeRandomArrayItem = <T,>(items: T[]): T | undefined => {
    if (items.length === 0) return undefined;
    const index = Math.floor(Math.random() * items.length);
    const [item] = items.splice(index, 1);
    return item;
};

const getRandomSplash = (items: string[]) => getRandomArrayItem(items) ?? '';

const getNextSplash = (previousSplash: string) => {
    const source = Math.random() < ULTRA_RARE_SPLASH_CHANCE ? ULTRA_RARE_SPLASHES : SPLASHES;
    const candidates = source.filter((entry) => entry !== previousSplash);
    return getRandomSplash(candidates.length > 0 ? candidates : source);
};

const getObfuscatedChar = () => OBFUSCATION_SOURCE[Math.floor(Math.random() * OBFUSCATION_SOURCE.length)];

const getSplashFormatMarkerLengthAt = (value: string, index: number) => {
    if (value[index] === SPLASH_FORMAT_MARKER) return 1;
    return 0;
};

const getVisibleSplashLength = (value: string) => {
    let visibleCount = 0;
    for (let index = 0; index < value.length; index += 1) {
        const formatMarkerLength = getSplashFormatMarkerLengthAt(value, index);
        if (formatMarkerLength > 0 && index + formatMarkerLength < value.length) {
            index += formatMarkerLength;
            continue;
        }
        visibleCount += 1;
    }
    return visibleCount;
};

const getSplashFontSizeForValue = (value: string) => {
    const baseSize = 20;
    const threshold = 20;
    const visibleLength = Math.max(1, getVisibleSplashLength(value));
    const scale = Math.max(0.5, Math.min(1, threshold / visibleLength));
    return baseSize * scale;
};

const parseSplashCharacters = (value: string): SplashCharacter[] => {
    const parsedCharacters: SplashCharacter[] = [];

    let currentColor = DEFAULT_SPLASH_COLOR;
    let isBold = false;
    let isItalic = false;
    let isUnderlined = false;
    let isStrikethrough = false;
    let isObfuscated = false;

    const getCurrentStyle = () => {
        const fontWeight = isBold ? 700 : 400;
        const fontStyle = isItalic ? 'italic' : 'normal';
        const textDecoration = [isUnderlined ? 'underline' : '', isStrikethrough ? 'line-through' : ''].filter(Boolean).join(' ');

        return {
            style: {
                color: currentColor,
                fontWeight,
                fontStyle,
                textDecoration,
            } satisfies React.CSSProperties,
            styleKey: `${currentColor}|${fontWeight}|${fontStyle}|${textDecoration}`,
        };
    };

    for (let index = 0; index < value.length; index += 1) {
        const character = value[index];
        const formatMarkerLength = getSplashFormatMarkerLengthAt(value, index);
        const formatCode = formatMarkerLength > 0 ? value[index + formatMarkerLength]?.toLowerCase() : undefined;

        if (formatMarkerLength > 0 && formatCode) {
            if (formatCode in MC_COLOR_BY_CODE) {
                currentColor = MC_COLOR_BY_CODE[formatCode];
                isBold = false;
                isItalic = false;
                isUnderlined = false;
                isStrikethrough = false;
                isObfuscated = false;
            } else if (formatCode === 'l') {
                isBold = true;
            } else if (formatCode === 'm') {
                isStrikethrough = true;
            } else if (formatCode === 'n') {
                isUnderlined = true;
            } else if (formatCode === 'o') {
                isItalic = true;
            } else if (formatCode === 'k') {
                isObfuscated = true;
            } else if (formatCode === 'r') {
                currentColor = DEFAULT_SPLASH_COLOR;
                isBold = false;
                isItalic = false;
                isUnderlined = false;
                isStrikethrough = false;
                isObfuscated = false;
            } else {
                const { style, styleKey } = getCurrentStyle();
                parsedCharacters.push({ char: character, style, styleKey, isAuthoredObfuscated: isObfuscated });
                continue;
            }

            index += formatMarkerLength;
            continue;
        }

        const { style, styleKey } = getCurrentStyle();
        parsedCharacters.push({ char: character, style, styleKey, isAuthoredObfuscated: isObfuscated });
    }

    return parsedCharacters;
};

const getFullyRevealedDisplayCharacters = (characters: SplashCharacter[]): DisplaySplashCharacter[] =>
    characters.map((character) => ({
        char: character.isAuthoredObfuscated ? getObfuscatedChar() : character.char,
        style: character.style,
        styleKey: character.styleKey,
    }));

const getDisplayCharactersFromSlots = (slots: TransitionSlot[]): DisplaySplashCharacter[] =>
    slots.map((slot) => ({
        char: slot.displayCharacter,
        style: slot.displayStyle,
        styleKey: slot.displayStyleKey,
    }));

const groupSplashSegments = (characters: DisplaySplashCharacter[]): FormattedSplashSegment[] => {
    const parsedSegments: FormattedSplashSegment[] = [];
    let currentText = '';
    let currentStyle: React.CSSProperties | null = null;
    let currentStyleKey = '';

    const pushSegment = () => {
        if (!currentText || !currentStyle) return;
        parsedSegments.push({ text: currentText, style: currentStyle });
        currentText = '';
    };

    for (const character of characters) {
        if (currentStyleKey && currentStyleKey !== character.styleKey) {
            pushSegment();
        }

        if (!currentStyleKey || currentStyleKey !== character.styleKey) {
            currentStyle = character.style;
            currentStyleKey = character.styleKey;
        }

        currentText += character.char;
    }

    pushSegment();
    return parsedSegments;
};

export const useSplashAnimation = (isActive: boolean) => {
    const [splashCharacters, setSplashCharacters] = useState<DisplaySplashCharacter[]>([]);
    const [splashFontSize, setSplashFontSize] = useState(20);

    useEffect(() => {
        if (!isActive) return undefined;

        let isDisposed = false;
        let holdTimeoutId: number | null = null;
        let phaseIntervalId: number | null = null;
        let liveGlyphIntervalId: number | null = null;
        let currentSplashRaw = '';
        let currentSplashParsed: SplashCharacter[] = [];
        let nextSlotId = 0;

        const commitSplashCharacters = (characters: DisplaySplashCharacter[]) => {
            if (!isDisposed) {
                setSplashCharacters(characters);
            }
        };

        const commitSplashFontSize = (value: number) => {
            if (!isDisposed) {
                setSplashFontSize(value);
            }
        };

        const clearSplashTimers = () => {
            if (holdTimeoutId !== null) {
                window.clearTimeout(holdTimeoutId);
                holdTimeoutId = null;
            }
            if (phaseIntervalId !== null) {
                window.clearInterval(phaseIntervalId);
                phaseIntervalId = null;
            }
            if (liveGlyphIntervalId !== null) {
                window.clearInterval(liveGlyphIntervalId);
                liveGlyphIntervalId = null;
            }
        };

        const createTransitionSlot = (
            currentCharacter: SplashCharacter | undefined,
            targetCharacter: SplashCharacter | undefined,
            isGlyphified: boolean,
            displayStyle: React.CSSProperties,
            displayStyleKey: string,
        ): TransitionSlot => ({
            id: nextSlotId++,
            currentCharacter,
            targetCharacter,
            isGlyphified,
            isRevealed: false,
            displayCharacter: getObfuscatedChar(),
            displayStyle,
            displayStyleKey,
        });

        const buildTransitionState = (targetRaw: string): SplashTransitionState => {
            const targetCharacters = parseSplashCharacters(targetRaw);
            const slots: TransitionSlot[] = [];
            const pendingGlyphifySlotIds: number[] = [];
            let pendingAddLeft: SplashCharacter[] = [];
            let pendingAddRight: SplashCharacter[] = [];
            let pendingRemoveLeft = 0;
            let pendingRemoveRight = 0;

            if (targetCharacters.length >= currentSplashParsed.length) {
                const addCount = targetCharacters.length - currentSplashParsed.length;
                const addLeft = Math.floor(addCount / 2);
                const addRight = Math.ceil(addCount / 2);
                pendingAddLeft = targetCharacters.slice(0, addLeft);
                pendingAddRight = targetCharacters.slice(targetCharacters.length - addRight);

                currentSplashParsed.forEach((currentCharacter, index) => {
                    const slot = createTransitionSlot(
                        currentCharacter,
                        targetCharacters[index + addLeft],
                        false,
                        currentCharacter.style,
                        currentCharacter.styleKey,
                    );
                    slot.displayCharacter = currentCharacter.isAuthoredObfuscated ? getObfuscatedChar() : currentCharacter.char;
                    slots.push(slot);
                    pendingGlyphifySlotIds.push(slot.id);
                });
            } else {
                const removeCount = currentSplashParsed.length - targetCharacters.length;
                const removeLeft = Math.floor(removeCount / 2);
                const removeRight = Math.ceil(removeCount / 2);
                pendingRemoveLeft = removeLeft;
                pendingRemoveRight = removeRight;

                currentSplashParsed.forEach((currentCharacter, index) => {
                    const targetCharacter =
                        index < removeLeft || index >= currentSplashParsed.length - removeRight
                            ? undefined
                            : targetCharacters[index - removeLeft];
                    const slot = createTransitionSlot(
                        currentCharacter,
                        targetCharacter,
                        false,
                        currentCharacter.style,
                        currentCharacter.styleKey,
                    );
                    slot.displayCharacter = currentCharacter.isAuthoredObfuscated ? getObfuscatedChar() : currentCharacter.char;
                    slots.push(slot);
                    pendingGlyphifySlotIds.push(slot.id);
                });
            }

            return {
                slots,
                pendingGlyphifySlotIds,
                pendingAddLeft,
                pendingAddRight,
                pendingRemoveLeft,
                pendingRemoveRight,
                targetCharacters,
                targetRaw,
                targetFontSize: getSplashFontSizeForValue(targetRaw),
            };
        };

        const isGlyphifyComplete = (state: SplashTransitionState) =>
            state.pendingGlyphifySlotIds.length === 0 &&
            state.pendingAddLeft.length === 0 &&
            state.pendingAddRight.length === 0 &&
            state.pendingRemoveLeft === 0 &&
            state.pendingRemoveRight === 0 &&
            state.slots.length === state.targetCharacters.length &&
            state.slots.every((slot) => slot.isGlyphified);

        const rerollGlyphifyDisplay = (state: SplashTransitionState) => {
            state.slots.forEach((slot) => {
                if (slot.isGlyphified || slot.currentCharacter?.isAuthoredObfuscated) {
                    slot.displayCharacter = getObfuscatedChar();
                    return;
                }

                if (slot.currentCharacter) {
                    slot.displayCharacter = slot.currentCharacter.char;
                }
            });
        };

        const getNextGlyphifyOperation = (state: SplashTransitionState) => {
            const operations: Array<'glyphify' | 'add-left' | 'add-right' | 'remove-left' | 'remove-right'> = [];
            const firstSlot = state.slots[0];
            const lastSlot = state.slots[state.slots.length - 1];

            if (state.pendingGlyphifySlotIds.length > 0) operations.push('glyphify');
            if (state.pendingAddLeft.length > 0) operations.push('add-left');
            if (state.pendingAddRight.length > 0) operations.push('add-right');
            if (state.pendingRemoveLeft > 0 && firstSlot?.targetCharacter === undefined && firstSlot.isGlyphified) {
                operations.push('remove-left');
            }
            if (state.pendingRemoveRight > 0 && lastSlot?.targetCharacter === undefined && lastSlot.isGlyphified) {
                operations.push('remove-right');
            }

            return getRandomArrayItem(operations);
        };

        const applyGlyphifyOperation = (
            state: SplashTransitionState,
            operation: 'glyphify' | 'add-left' | 'add-right' | 'remove-left' | 'remove-right',
        ) => {
            if (operation === 'glyphify') {
                const slotId = takeRandomArrayItem(state.pendingGlyphifySlotIds);
                if (slotId === undefined) return;
                const slot = state.slots.find((entry) => entry.id === slotId);
                if (!slot) return;
                slot.isGlyphified = true;
                slot.displayCharacter = getObfuscatedChar();
                return;
            }

            if (operation === 'add-left') {
                const targetCharacter = state.pendingAddLeft.pop();
                if (!targetCharacter) return;
                const slot = createTransitionSlot(undefined, targetCharacter, true, targetCharacter.style, targetCharacter.styleKey);
                slot.displayCharacter = getObfuscatedChar();
                state.slots.unshift(slot);
                return;
            }

            if (operation === 'add-right') {
                const targetCharacter = state.pendingAddRight.shift();
                if (!targetCharacter) return;
                const slot = createTransitionSlot(undefined, targetCharacter, true, targetCharacter.style, targetCharacter.styleKey);
                slot.displayCharacter = getObfuscatedChar();
                state.slots.push(slot);
                return;
            }

            if (operation === 'remove-left') {
                state.slots.shift();
                state.pendingRemoveLeft -= 1;
                return;
            }

            state.slots.pop();
            state.pendingRemoveRight -= 1;
        };

        const startHoldPhase = (raw: string, parsedCharacters: SplashCharacter[]) => {
            currentSplashRaw = raw;
            currentSplashParsed = parsedCharacters;
            commitSplashFontSize(getSplashFontSizeForValue(raw));
            commitSplashCharacters(getFullyRevealedDisplayCharacters(parsedCharacters));

            if (parsedCharacters.some((character) => character.isAuthoredObfuscated)) {
                liveGlyphIntervalId = window.setInterval(() => {
                    commitSplashCharacters(getFullyRevealedDisplayCharacters(parsedCharacters));
                }, SPLASH_REVEAL_TICK_MS);
            }

            holdTimeoutId = window.setTimeout(() => {
                holdTimeoutId = null;
                startGlyphifyPhase();
            }, SPLASH_HOLD_DURATION_MS);
        };

        const startRevealPhase = (state: SplashTransitionState) => {
            commitSplashFontSize(state.targetFontSize);

            if (state.slots.length === 0) {
                startHoldPhase(state.targetRaw, state.targetCharacters);
                return;
            }

            phaseIntervalId = window.setInterval(() => {
                state.slots.forEach((slot) => {
                    if (!slot.isRevealed) {
                        slot.displayCharacter = getObfuscatedChar();
                    }
                });

                const unrevealedSlots = state.slots.filter((slot) => !slot.isRevealed);
                const slotToReveal = getRandomArrayItem(unrevealedSlots);
                if (slotToReveal?.targetCharacter) {
                    slotToReveal.isRevealed = true;
                    slotToReveal.displayStyle = slotToReveal.targetCharacter.style;
                    slotToReveal.displayStyleKey = slotToReveal.targetCharacter.styleKey;
                    slotToReveal.displayCharacter = slotToReveal.targetCharacter.isAuthoredObfuscated
                        ? getObfuscatedChar()
                        : slotToReveal.targetCharacter.char;
                }

                commitSplashCharacters(getDisplayCharactersFromSlots(state.slots));

                if (state.slots.every((slot) => slot.isRevealed)) {
                    if (phaseIntervalId !== null) {
                        window.clearInterval(phaseIntervalId);
                        phaseIntervalId = null;
                    }
                    startHoldPhase(state.targetRaw, state.targetCharacters);
                }
            }, SPLASH_REVEAL_TICK_MS);
        };

        const startGlyphifyPhase = () => {
            if (liveGlyphIntervalId !== null) {
                window.clearInterval(liveGlyphIntervalId);
                liveGlyphIntervalId = null;
            }

            const state = buildTransitionState(getNextSplash(currentSplashRaw));

            const runGlyphifyTick = () => {
                rerollGlyphifyDisplay(state);
                const operation = getNextGlyphifyOperation(state);
                if (operation) {
                    applyGlyphifyOperation(state, operation);
                }

                commitSplashCharacters(getDisplayCharactersFromSlots(state.slots));

                if (isGlyphifyComplete(state)) {
                    if (phaseIntervalId !== null) {
                        window.clearInterval(phaseIntervalId);
                        phaseIntervalId = null;
                    }
                    startRevealPhase(state);
                }
            };

            runGlyphifyTick();
            if (!isGlyphifyComplete(state)) {
                phaseIntervalId = window.setInterval(runGlyphifyTick, SPLASH_GLYPHIFY_TICK_MS);
            }
        };

        const initialSplashRaw = getNextSplash('');
        startHoldPhase(initialSplashRaw, parseSplashCharacters(initialSplashRaw));

        return () => {
            isDisposed = true;
            clearSplashTimers();
        };
    }, [isActive]);

    const formattedSplash = useMemo(() => groupSplashSegments(splashCharacters), [splashCharacters]);

    return { formattedSplash, splashFontSize };
};
