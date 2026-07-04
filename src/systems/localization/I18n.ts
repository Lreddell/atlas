export type TranslationTable = Record<string, string>;

class I18n {
    private locale = 'en_us';
    private tables = new Map<string, TranslationTable>([['en_us', {}]]);

    register(locale: string, table: TranslationTable): void {
        this.tables.set(locale.toLowerCase(), { ...(this.tables.get(locale.toLowerCase()) ?? {}), ...table });
    }
    setLocale(locale: string): void { this.locale = this.tables.has(locale.toLowerCase()) ? locale.toLowerCase() : 'en_us'; }
    getLocale(): string { return this.locale; }
    translate(key: string, values: Record<string, string | number> = {}): string {
        let text = this.tables.get(this.locale)?.[key] ?? this.tables.get('en_us')?.[key] ?? key;
        for (const [name, value] of Object.entries(values)) text = text.split(`{${name}}`).join(String(value));
        return text;
    }
}

export const i18n = new I18n();
i18n.register('en_us', {
    'weather.clear': 'Clear',
    'weather.rain': 'Rain',
    'weather.thunder': 'Thunderstorm',
    'weather.snow': 'Snow',
});
