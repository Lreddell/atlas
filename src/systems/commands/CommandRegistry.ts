export interface CommandDescriptor {
    name: `/${string}`;
    aliases?: readonly `/${string}`[];
    summary: string;
    usage: string;
    subcommands?: readonly string[];
}

export class CommandRegistry {
    private commands = new Map<string, CommandDescriptor>();

    register(descriptor: CommandDescriptor): void {
        this.commands.set(descriptor.name, descriptor);
        for (const alias of descriptor.aliases ?? []) this.commands.set(alias, descriptor);
    }
    get(name: string): CommandDescriptor | undefined { return this.commands.get(name); }
    list(): CommandDescriptor[] {
        return Array.from(new Set(this.commands.values())).sort((a, b) => a.name.localeCompare(b.name));
    }
}

export const commandRegistry = new CommandRegistry();
