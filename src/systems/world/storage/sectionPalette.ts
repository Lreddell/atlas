export const SECTION_EDGE = 16;
export const SECTION_VOLUME = SECTION_EDGE ** 3;

export interface PalettedSection {
    palette: number[];
    bitsPerEntry: number;
    data: Uint32Array;
}

const bitsFor = (count: number) => Math.max(1, Math.ceil(Math.log2(Math.max(1, count))));

/** Compact a 16^3 runtime-id section into a local palette and packed words. */
export function encodePalettedSection(values: Uint16Array): PalettedSection {
    if (values.length !== SECTION_VOLUME) throw new Error(`Expected ${SECTION_VOLUME} section values`);
    const palette: number[] = [];
    const indices = new Map<number, number>();
    const local = new Uint16Array(values.length);
    for (let i = 0; i < values.length; i++) {
        const value = values[i];
        let index = indices.get(value);
        if (index === undefined) {
            index = palette.length;
            palette.push(value);
            indices.set(value, index);
        }
        local[i] = index;
    }
    const bitsPerEntry = bitsFor(palette.length);
    const data = new Uint32Array(Math.ceil(values.length * bitsPerEntry / 32));
    const mask = 2 ** bitsPerEntry - 1;
    for (let i = 0; i < local.length; i++) {
        const bit = i * bitsPerEntry;
        const word = bit >>> 5;
        const offset = bit & 31;
        data[word] |= (local[i] & mask) << offset;
        const spill = offset + bitsPerEntry - 32;
        if (spill > 0) data[word + 1] |= local[i] >>> (bitsPerEntry - spill);
    }
    return { palette, bitsPerEntry, data };
}

export function decodePalettedSection(section: PalettedSection): Uint16Array {
    const out = new Uint16Array(SECTION_VOLUME);
    const mask = 2 ** section.bitsPerEntry - 1;
    for (let i = 0; i < out.length; i++) {
        const bit = i * section.bitsPerEntry;
        const word = bit >>> 5;
        const offset = bit & 31;
        let local = section.data[word] >>> offset;
        const spill = offset + section.bitsPerEntry - 32;
        if (spill > 0) local |= section.data[word + 1] << (section.bitsPerEntry - spill);
        out[i] = section.palette[local & mask] ?? 0;
    }
    return out;
}
