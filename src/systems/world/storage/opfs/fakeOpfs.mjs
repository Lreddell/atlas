// In-memory fake of the OPFS handle subset (opfsTypes) for Node tests. Models
// the bits OpfsSavesCore depends on: nested directories, file buffers, atomic
// createWritable (replace-on-close), and EXCLUSIVE createSyncAccessHandle locking
// (so the session-lock test can observe a second opener being rejected).

function concat(chunks) {
    let len = 0; for (const c of chunks) len += c.length;
    const out = new Uint8Array(len); let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
}

class FakeFile {
    constructor() { this.buf = new Uint8Array(0); this.locked = false; }
}

class FakeSyncHandle {
    constructor(file) { this.file = file; }
    getSize() { return this.file.buf.length; }
    read(view, opts = {}) {
        const at = opts.at || 0;
        const n = Math.max(0, Math.min(view.length, this.file.buf.length - at));
        view.set(this.file.buf.subarray(at, at + n));
        return n;
    }
    write(view, opts = {}) {
        const at = opts.at || 0;
        if (at + view.length > this.file.buf.length) {
            const grown = new Uint8Array(at + view.length);
            grown.set(this.file.buf);
            this.file.buf = grown;
        }
        this.file.buf.set(view, at);
        return view.length;
    }
    truncate(n) {
        if (n <= this.file.buf.length) this.file.buf = this.file.buf.slice(0, n);
        else { const g = new Uint8Array(n); g.set(this.file.buf); this.file.buf = g; }
    }
    flush() {}
    close() { this.file.locked = false; }
}

class FakeWritable {
    constructor(file) { this.file = file; this.chunks = []; }
    async write(data) { this.chunks.push(data instanceof Uint8Array ? data : new Uint8Array(data)); }
    async close() { this.file.buf = concat(this.chunks); } // OPFS replaces content on close
}

class FakeFileHandle {
    constructor(file) { this.kind = 'file'; this.file = file; }
    async createSyncAccessHandle() {
        if (this.file.locked) { const e = new Error('NoModificationAllowedError'); e.name = 'NoModificationAllowedError'; throw e; }
        this.file.locked = true;
        return new FakeSyncHandle(this.file);
    }
    async createWritable() { return new FakeWritable(this.file); }
    async getFile() { const buf = this.file.buf.slice(); return { size: buf.length, async arrayBuffer() { return buf.buffer; } }; }
}

export class FakeDir {
    constructor() { this.kind = 'directory'; this.entries_ = new Map(); }
    async getDirectoryHandle(name, opts = {}) {
        let e = this.entries_.get(name);
        if (!e) { if (!opts.create) { const err = new Error('NotFoundError'); err.name = 'NotFoundError'; throw err; } e = new FakeDir(); this.entries_.set(name, e); }
        if (e.kind !== 'directory') throw new Error('TypeMismatchError');
        return e;
    }
    async getFileHandle(name, opts = {}) {
        let e = this.entries_.get(name);
        if (!e) { if (!opts.create) { const err = new Error('NotFoundError'); err.name = 'NotFoundError'; throw err; } e = new FakeFileHandle(new FakeFile()); this.entries_.set(name, e); }
        if (e.kind !== 'file') throw new Error('TypeMismatchError');
        return e;
    }
    async removeEntry(name) { this.entries_.delete(name); }
    async *entries() { for (const [k, v] of this.entries_) yield [k, v]; }
}
