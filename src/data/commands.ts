export interface CommandAutocompleteOptions {
    biomes: string[];
    regions: string[];
    items: string[];
    equippableItems: string[];
    entities: string[];
    sounds: string[];
}

export const COMMANDS = [
    '/help',
    '/gamemode',
    '/keepinventory',
    '/time',
    '/phase',
    '/locate',
    '/tp',
    '/sound',
    '/music',
    '/playsound',
    '/shootingstar',
    '/bloodmoon',
    '/region',
    '/cleanse',
    '/seal',
    '/giveitem',
    '/equip',
    '/unequip',
    '/spawn',
    '/setspawn',
    '/boss',
    '/vault',
    '/magfields',
];

/**
 * Commands that work even where a world's commands are off: help and the
 * player's own sound settings. Everything else changes the game, so it is a
 * cheat and needs Allow Commands (set at world creation, or in World Options).
 */
export const ALWAYS_ALLOWED_COMMANDS: ReadonlySet<string> = new Set(['/help', '/sound', '/music']);

export const SUBCOMMANDS: Record<string, string[]> = {
    '/help': [],
    '/gamemode': ['survival', 'creative', 'spectator'],
    '/keepinventory': ['on', 'off'],
    '/time': ['set', 'add', 'query'],
    '/phase': ['set'],
    '/locate': ['biome', 'vault'],
    '/tp': [],
    '/sound': ['reload', 'volume'],
    '/music': ['skip'],
    '/playsound': [],
    '/shootingstar': ['spawn'],
    '/bloodmoon': ['force', 'clear', 'query'],
    '/region': [],
    '/cleanse': [],
    '/seal': [],
    '/giveitem': [],
    '/equip': [],
    '/unequip': ['helmet', 'chestplate', 'leggings', 'boots', 'accessory'],
    '/spawn': [],
    '/setspawn': [],
    '/boss': ['spawn', 'kill'],
    '/vault': ['skip'],
    '/magfields': ['on', 'off', 'toggle'],
};

export const ARGUMENT_OPTIONS: Record<string, string[]> = {
    '/time set': ['day', 'night', 'noon', 'midnight', 'sunrise', 'sunset', '0', '1000', '6000', '12000', '13000', '18000', '23000'],
    '/time add': ['100', '1000', '6000'],
    '/phase set': ['0', '1', '2', '3', '4', '5', '6', '7'],
    '/bloodmoon force': ['current', 'next'],
    '/bloodmoon clear': ['current', 'next'],
    '/sound volume': ['0', '0.25', '0.5', '0.75', '1'],
};

const GIVE_COUNTS = ['1', '16', '32', '64'];

const filterPrefix = (values: string[], prefix: string): string[] =>
    values.filter(value => value.startsWith(prefix));

export function getAutocompleteCandidates(
    input: string,
    options: CommandAutocompleteOptions,
    commandsAllowed = true,
): string[] {
    const trimmed = input.trim();
    const parts = trimmed ? trimmed.split(/\s+/) : [];
    const endsWithSpace = input.endsWith(' ');
    const tokenIndex = endsWithSpace ? parts.length : Math.max(0, parts.length - 1);
    const prefix = endsWithSpace ? '' : (parts[tokenIndex] ?? '');

    if (tokenIndex === 0) {
        const available = commandsAllowed ? COMMANDS : COMMANDS.filter((command) => ALWAYS_ALLOWED_COMMANDS.has(command));
        return filterPrefix(available, prefix);
    }

    const command = parts[0];
    if (!commandsAllowed && !ALWAYS_ALLOWED_COMMANDS.has(command)) return [];
    if (tokenIndex === 1) {
        switch (command) {
            case '/cleanse':
            case '/seal':
                return filterPrefix(options.regions, prefix);
            case '/giveitem':
                return filterPrefix(options.items, prefix);
            case '/equip':
                return filterPrefix(options.equippableItems, prefix);
            case '/spawn':
                return filterPrefix(options.entities, prefix);
            case '/playsound':
                return filterPrefix(options.sounds, prefix);
            default:
                return filterPrefix(SUBCOMMANDS[command] ?? [], prefix);
        }
    }

    if (tokenIndex === 2) {
        if (command === '/locate' && parts[1] === 'biome') return filterPrefix(options.biomes, prefix);
        if (command === '/giveitem') return filterPrefix(GIVE_COUNTS, prefix);
        const commandContext = `${command} ${parts[1]}`;
        return filterPrefix(ARGUMENT_OPTIONS[commandContext] ?? [], prefix);
    }

    return [];
}
