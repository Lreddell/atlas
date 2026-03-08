
export const COMMANDS = ['/gamemode', '/time', '/phase', '/locate', '/tp', '/sound', '/music', '/playsound', '/shootingstar', '/bloodmoon'];

export const SUBCOMMANDS: Record<string, string[]> = {
    '/gamemode': ['survival', 'creative', 'spectator'],
    '/time': ['set', 'add', 'query'],
    '/phase': ['set'],
    '/locate': ['biome'],
    '/tp': [], // Coordinates usually
    '/sound': ['reload', 'volume'],
    '/music': ['skip'],
    '/playsound': [],
    '/shootingstar': ['spawn'],
    '/bloodmoon': ['force', 'clear', 'query']
};

// Nested options based on "Command + SubCommand" key
export const ARGUMENT_OPTIONS: Record<string, string[]> = {
    '/time set': ['day', 'night', 'noon', 'midnight', 'sunrise', 'sunset', '0', '1000', '6000', '12000', '13000', '18000', '23000'],
    '/time add': ['100', '1000', '6000'],
    '/phase set': ['0', '1', '2', '3', '4', '5', '6', '7'],
    '/bloodmoon force': ['current', 'next'],
    '/bloodmoon clear': ['current', 'next'],
};
