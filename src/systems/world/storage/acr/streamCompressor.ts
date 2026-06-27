// Browser-native deflate for .acr payloads, via CompressionStream/DecompressionStream
// (async — the codec's Compressor interface awaits the result). Used by the OPFS
// SaveWorker. Falls back handled by the caller via streamCompressorAvailable().

import type { Compressor } from './acrCodec';

async function run(data: Uint8Array, stream: { writable: WritableStream<BufferSource>; readable: ReadableStream<Uint8Array> }): Promise<Uint8Array> {
    const writer = stream.writable.getWriter();
    // Cast around the ArrayBufferLike/ArrayBuffer generic friction in current lib types.
    void writer.write(data as unknown as BufferSource);
    void writer.close();
    const buf = await new Response(stream.readable).arrayBuffer();
    return new Uint8Array(buf);
}

export const streamCompressor: Compressor = {
    compress: (data) => run(data, new CompressionStream('deflate-raw')),
    decompress: (data) => run(data, new DecompressionStream('deflate-raw')),
};

export function streamCompressorAvailable(): boolean {
    return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
}
