// Pure, testable migration driver. Used by DesktopFsBackend to copy worlds from
// the legacy IndexedDB store into filesystem saves on first run. It never deletes
// the source: a failed world migration leaves IndexedDB intact and is retried on
// the next launch (skipped once present), so migration is idempotent and safe.

export interface MigrationResult {
    migrated: string[];
    skipped: string[];
    failed: Array<{ id: string; error: string }>;
}

export interface MigrationDriver<W extends { id: string }> {
    /** Worlds in the source store (IndexedDB). */
    listLegacy(): Promise<W[]>;
    /** IDs already present in the destination (filesystem) store. */
    listExisting(): Promise<string[]>;
    /** Copy a single world's metadata + chunks into the destination. Throws on failure. */
    migrateOne(world: W): Promise<void>;
}

export async function migrateWorlds<W extends { id: string }>(driver: MigrationDriver<W>): Promise<MigrationResult> {
    const result: MigrationResult = { migrated: [], skipped: [], failed: [] };
    const existing = new Set(await driver.listExisting());
    const legacy = await driver.listLegacy();
    for (const world of legacy) {
        if (existing.has(world.id)) { result.skipped.push(world.id); continue; }
        try {
            await driver.migrateOne(world);
            result.migrated.push(world.id);
        } catch (error) {
            // Leave the source intact; the world stays loadable from IndexedDB and
            // will be retried next launch.
            result.failed.push({ id: world.id, error: String((error as Error)?.message || error) });
        }
    }
    return result;
}
