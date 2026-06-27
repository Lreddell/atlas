// Adapts an OPFS synchronous-access-handle to the codec's RandomAccessFile. The
// handle's read/write/getSize/truncate/flush are all synchronous (the codec awaits
// them anyway), giving fast random-access region IO inside a Web Worker.

import type { RandomAccessFile } from './acrCodec';
import type { OpfsSyncAccessHandle } from '../opfs/opfsTypes';

export class OpfsRandomAccessFile implements RandomAccessFile {
    constructor(private handle: OpfsSyncAccessHandle) {}

    size(): number { return this.handle.getSize(); }

    read(into: Uint8Array, fileOffset: number): void {
        let read = 0;
        while (read < into.length) {
            const n = this.handle.read(into.subarray(read), { at: fileOffset + read });
            if (n <= 0) throw new Error('Unexpected EOF reading OPFS .acr region');
            read += n;
        }
    }

    write(data: Uint8Array, fileOffset: number): void {
        let written = 0;
        while (written < data.length) {
            const n = this.handle.write(data.subarray(written), { at: fileOffset + written });
            if (n <= 0) throw new Error('OPFS write made no progress');
            written += n;
        }
    }

    truncate(size: number): void { this.handle.truncate(size); }
    flush(): void { this.handle.flush(); }
}
