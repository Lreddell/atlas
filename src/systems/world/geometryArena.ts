import * as THREE from 'three';

// A geometry that many meshes share, each in its own ranges of one set of GPU
// buffers: for the chunk regions (regionBatcher.ts), which take chunks in and
// let them go one at a time.
//
// A chunk joins by writing just its own vertices and indices into free ranges
// (bufferSubData), and leaves by zeroing its indices, so it draws nothing
// while its ranges wait for the next one to reuse. Nothing is merged again
// and nothing already there uploads again, and no copy of the geometry stays
// on the CPU: the chunks keep their own. When the buffers fill up they are
// reallocated half as large again and copied on the GPU (copyBufferSubData);
// once the members have held still, repack() closes the holes and trims the
// spare room the same way, so the buffers end up little larger than what
// they hold.
//
// Three draws the buffers through GLBufferAttribute. Its vertex-array cache
// only notices a new attribute object, not a new buffer under an old one, so a
// reallocation always installs fresh attributes.

/** The raw GPU buffers an arena writes to. WebGLArenaGpu in the game; tests use a CPU stand-in. */
export interface ArenaGpu {
    create(kind: ArenaBufferKind, bytes: number): unknown;
    write(kind: ArenaBufferKind, buffer: unknown, byteOffset: number, data: ArrayBufferView): void;
    /** Copies bytes on the GPU, from one buffer's offset to another's. */
    copy(kind: ArenaBufferKind, from: unknown, to: unknown, bytes: number, fromOffset?: number, toOffset?: number): void;
    destroy(buffer: unknown): void;
}

export type ArenaBufferKind = 'vertex' | 'index';

/**
 * WebGL 2 buffers. The vertex array three last bound is set aside while an
 * index buffer is bound, since which index buffer is bound belongs to the
 * vertex array, and put back after.
 */
export class WebGLArenaGpu implements ArenaGpu {
    constructor(private readonly gl: WebGL2RenderingContext) {}

    private target(kind: ArenaBufferKind): number {
        return kind === 'index' ? this.gl.ELEMENT_ARRAY_BUFFER : this.gl.ARRAY_BUFFER;
    }

    private outsideVertexArray<T>(run: () => T): T {
        const gl = this.gl;
        const bound = gl.getParameter(gl.VERTEX_ARRAY_BINDING) as WebGLVertexArrayObject | null;
        if (bound) gl.bindVertexArray(null);
        try {
            return run();
        } finally {
            if (bound) gl.bindVertexArray(bound);
        }
    }

    create(kind: ArenaBufferKind, bytes: number): unknown {
        return this.outsideVertexArray(() => {
            const gl = this.gl;
            const buffer = gl.createBuffer();
            gl.bindBuffer(this.target(kind), buffer);
            gl.bufferData(this.target(kind), bytes, gl.STATIC_DRAW);
            gl.bindBuffer(this.target(kind), null);
            return buffer;
        });
    }

    write(kind: ArenaBufferKind, buffer: unknown, byteOffset: number, data: ArrayBufferView): void {
        this.outsideVertexArray(() => {
            const gl = this.gl;
            gl.bindBuffer(this.target(kind), buffer as WebGLBuffer);
            gl.bufferSubData(this.target(kind), byteOffset, data);
            gl.bindBuffer(this.target(kind), null);
        });
    }

    copy(_kind: ArenaBufferKind, from: unknown, to: unknown, bytes: number, fromOffset = 0, toOffset = 0): void {
        const gl = this.gl;
        gl.bindBuffer(gl.COPY_READ_BUFFER, from as WebGLBuffer);
        gl.bindBuffer(gl.COPY_WRITE_BUFFER, to as WebGLBuffer);
        gl.copyBufferSubData(gl.COPY_READ_BUFFER, gl.COPY_WRITE_BUFFER, fromOffset, toOffset, bytes);
        gl.bindBuffer(gl.COPY_READ_BUFFER, null);
        gl.bindBuffer(gl.COPY_WRITE_BUFFER, null);
    }

    destroy(buffer: unknown): void {
        this.gl.deleteBuffer(buffer as WebGLBuffer);
    }
}

/** One vertex attribute of an arena: its name, components, their GL type and size in bytes. */
export interface ArenaAttributeLayout {
    name: string;
    itemSize: number;
    /** A GL component type (THREE.FloatType is not one: gl.FLOAT, gl.BYTE and the like). */
    glType: number;
    componentBytes: 1 | 2 | 4;
    normalized: boolean;
}

// GL component types, as numbers, so the layout needs no context to describe.
export const GL_BYTE = 0x1400;
export const GL_UNSIGNED_BYTE = 0x1401;
export const GL_UNSIGNED_SHORT = 0x1403;
export const GL_UNSIGNED_INT = 0x1405;
export const GL_FLOAT = 0x1406;

/** A run of elements: [start, count]. */
export type ArenaRange = [number, number];

/**
 * Hands out runs of a buffer, lowest first: freed runs are reused (first
 * fit) and merge with their neighbours; `end` is where the highest run in use
 * stops, which is as far as the arena needs to draw.
 */
export class RangeAllocator {
    /** Free runs below `end`, by start. */
    private free: ArenaRange[] = [];
    end = 0;

    constructor(public capacity: number) {}

    /** A run of `count` elements, or -1 when none is left. */
    allocate(count: number): number {
        for (let i = 0; i < this.free.length; i++) {
            const run = this.free[i];
            if (run[1] < count) continue;
            const start = run[0];
            if (run[1] === count) this.free.splice(i, 1);
            else { run[0] += count; run[1] -= count; }
            return start;
        }
        if (this.end + count > this.capacity) return -1;
        const start = this.end;
        this.end += count;
        return start;
    }

    release(start: number, count: number): void {
        if (count <= 0) return;
        let i = 0;
        while (i < this.free.length && this.free[i][0] < start) i++;
        this.free.splice(i, 0, [start, count]);
        // Merge with the neighbours on either side.
        if (i + 1 < this.free.length && this.free[i][0] + this.free[i][1] === this.free[i + 1][0]) {
            this.free[i][1] += this.free[i + 1][1];
            this.free.splice(i + 1, 1);
        }
        if (i > 0 && this.free[i - 1][0] + this.free[i - 1][1] === this.free[i][0]) {
            this.free[i - 1][1] += this.free[i][1];
            this.free.splice(i, 1);
            i--;
        }
        // A free run reaching the top lowers it.
        const last = this.free[this.free.length - 1];
        if (last && last[0] + last[1] === this.end) {
            this.end = last[0];
            this.free.pop();
        }
    }

    /** Everything below `count` in use, packed from 0, in a buffer of `capacity`. */
    reset(count: number, capacity: number): void {
        this.free = [];
        this.end = count;
        this.capacity = capacity;
    }

    /** Elements free below `end`. */
    get holes(): number {
        let total = 0;
        for (const run of this.free) total += run[1];
        return total;
    }
}

/** Where one member sits in an arena. */
export interface ArenaSlot {
    vertices: ArenaRange;
    indices: ArenaRange;
}

/** A member's geometry, as the chunk mesher lays it out, and where it sits in the arena's space. */
export interface ArenaPart {
    attributes: Record<string, ArrayBufferView & ArrayLike<number>>;
    index: ArrayLike<number>;
    offsetX: number;
    offsetZ: number;
    /** Its bounds in its own space (min x, y, z, max x, y, z), for the arena's. */
    bounds?: readonly number[];
}

const scratch = {
    positions: new Float32Array(0),
    indices: new Uint32Array(0),
    zeros: new Uint32Array(0),
};
const grow = <T extends Float32Array | Uint32Array>(array: T, length: number, make: (n: number) => T): T =>
    array.length >= length ? array : make(Math.max(length, array.length * 2));

export class GeometryArena {
    readonly geometry = new THREE.BufferGeometry();
    private vertexBuffers = new Map<string, unknown>();
    private indexBuffer: unknown = null;
    private readonly vertices: RangeAllocator;
    private readonly indices: RangeAllocator;
    private readonly bounds = new THREE.Box3();
    private disposed = false;

    constructor(
        private readonly gpu: ArenaGpu,
        private readonly layout: readonly ArenaAttributeLayout[],
        vertexCapacity: number,
        indexCapacity: number,
    ) {
        this.vertices = new RangeAllocator(vertexCapacity);
        this.indices = new RangeAllocator(indexCapacity);
        this.allocate(vertexCapacity, indexCapacity, 0, 0);
        this.geometry.boundingBox = new THREE.Box3();
        this.geometry.boundingSphere = new THREE.Sphere();
        this.geometry.setDrawRange(0, 0);
    }

    /** Vertices and indices in use and free below the top (diagnostics, and when to compact). */
    stats(): { vertices: number; vertexHoles: number; indices: number; indexHoles: number; bytes: number } {
        const vertexBytes = this.layout.reduce((sum, a) => sum + a.itemSize * a.componentBytes, 0);
        return {
            vertices: this.vertices.end - this.vertices.holes,
            vertexHoles: this.vertices.holes,
            indices: this.indices.end - this.indices.holes,
            indexHoles: this.indices.holes,
            bytes: this.vertices.capacity * vertexBytes + this.indices.capacity * 4,
        };
    }

    /** Writes a part into free ranges (growing the buffers if it must) and returns where it went. */
    add(part: ArenaPart): ArenaSlot {
        const vertexCount = part.attributes.position.length / 3;
        const indexCount = part.index.length;
        let vertexStart = this.vertices.allocate(vertexCount);
        let indexStart = this.indices.allocate(indexCount);
        if (vertexStart < 0 || indexStart < 0) {
            if (vertexStart >= 0) this.vertices.release(vertexStart, vertexCount);
            if (indexStart >= 0) this.indices.release(indexStart, indexCount);
            this.reserve(vertexCount, indexCount);
            vertexStart = this.vertices.allocate(vertexCount);
            indexStart = this.indices.allocate(indexCount);
        }

        for (const attribute of this.layout) {
            const source = part.attributes[attribute.name];
            const byteOffset = vertexStart * attribute.itemSize * attribute.componentBytes;
            if (attribute.name === 'position' && (part.offsetX !== 0 || part.offsetZ !== 0)) {
                // Positions move into the arena's space.
                const count = vertexCount * 3;
                const positions = scratch.positions = grow(scratch.positions, count, (n) => new Float32Array(n));
                for (let i = 0; i < count; i += 3) {
                    positions[i] = source[i] + part.offsetX;
                    positions[i + 1] = source[i + 1];
                    positions[i + 2] = source[i + 2] + part.offsetZ;
                }
                this.gpu.write('vertex', this.vertexBuffers.get(attribute.name), byteOffset, positions.subarray(0, count));
            } else {
                this.gpu.write('vertex', this.vertexBuffers.get(attribute.name), byteOffset, source);
            }
        }
        // Indices count from the part's first vertex.
        const indices = scratch.indices = grow(scratch.indices, indexCount, (n) => new Uint32Array(n));
        for (let i = 0; i < indexCount; i++) indices[i] = part.index[i] + vertexStart;
        this.gpu.write('index', this.indexBuffer, indexStart * 4, indices.subarray(0, indexCount));

        if (part.bounds) {
            const [minX, minY, minZ, maxX, maxY, maxZ] = part.bounds;
            this.bounds.expandByPoint(new THREE.Vector3(minX + part.offsetX, minY, minZ + part.offsetZ));
            this.bounds.expandByPoint(new THREE.Vector3(maxX + part.offsetX, maxY, maxZ + part.offsetZ));
            this.updateBounds();
        }
        this.geometry.setDrawRange(0, this.indices.end);
        return { vertices: [vertexStart, vertexCount], indices: [indexStart, indexCount] };
    }

    /** Takes a part out: its triangles collapse at once and its ranges are free for the next. */
    remove(slot: ArenaSlot): void {
        const [indexStart, indexCount] = slot.indices;
        if (indexCount > 0) {
            const zeros = scratch.zeros = grow(scratch.zeros, indexCount, (n) => new Uint32Array(n));
            this.gpu.write('index', this.indexBuffer, indexStart * 4, zeros.subarray(0, indexCount));
        }
        this.indices.release(indexStart, indexCount);
        this.vertices.release(slot.vertices[0], slot.vertices[1]);
        this.geometry.setDrawRange(0, this.indices.end);
    }

    get empty(): boolean {
        return this.indices.end === 0;
    }

    /** Whether repack() would give back a fair share of the buffers: holes, or spare room past the top. */
    get slack(): boolean {
        const usedVertices = this.vertices.end - this.vertices.holes;
        const usedIndices = this.indices.end - this.indices.holes;
        return this.vertices.capacity > usedVertices * 1.12 + 1024 || this.indices.capacity > usedIndices * 1.12 + 1536;
    }

    /**
     * Packs the members into new buffers just larger than they need: each one's
     * vertices copied on the GPU to its new place, its indices (from its own
     * index array, which the chunks keep) written again for it. The slots are
     * updated in place.
     */
    repack(members: ReadonlyArray<{ slot: ArenaSlot; index: ArrayLike<number> }>): void {
        let vertexCount = 0;
        let indexCount = 0;
        for (const { slot } of members) {
            vertexCount += slot.vertices[1];
            indexCount += slot.indices[1];
        }
        const vertexCapacity = Math.max(1024, Math.ceil(vertexCount * 1.08));
        const indexCapacity = Math.max(1536, Math.ceil(indexCount * 1.08));
        const oldBuffers = new Map(this.vertexBuffers);
        const oldIndex = this.indexBuffer;
        // New buffers, nothing kept: the members move in one by one.
        this.vertexBuffers = new Map();
        this.indexBuffer = null;
        this.allocate(vertexCapacity, indexCapacity, 0, 0);

        let vertexStart = 0;
        let indexStart = 0;
        for (const { slot, index } of members) {
            const [from, count] = slot.vertices;
            for (const attribute of this.layout) {
                const bytes = attribute.itemSize * attribute.componentBytes;
                if (count > 0) this.gpu.copy('vertex', oldBuffers.get(attribute.name), this.vertexBuffers.get(attribute.name), count * bytes, from * bytes, vertexStart * bytes);
            }
            const indices = scratch.indices = grow(scratch.indices, index.length, (n) => new Uint32Array(n));
            for (let i = 0; i < index.length; i++) indices[i] = index[i] + vertexStart;
            if (index.length > 0) this.gpu.write('index', this.indexBuffer, indexStart * 4, indices.subarray(0, index.length));
            slot.vertices = [vertexStart, count];
            slot.indices = [indexStart, index.length];
            vertexStart += count;
            indexStart += index.length;
        }
        for (const buffer of oldBuffers.values()) this.gpu.destroy(buffer);
        if (oldIndex) this.gpu.destroy(oldIndex);
        this.vertices.reset(vertexStart, vertexCapacity);
        this.indices.reset(indexStart, indexCapacity);
        this.geometry.setDrawRange(0, indexStart);
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const buffer of this.vertexBuffers.values()) this.gpu.destroy(buffer);
        if (this.indexBuffer) this.gpu.destroy(this.indexBuffer);
        this.geometry.dispose();
    }

    private updateBounds(): void {
        // Wind sways leaves and plants by up to ~0.2 blocks: pad the bounds for it.
        this.geometry.boundingBox!.copy(this.bounds).expandByScalar(0.5);
        this.geometry.boundingBox!.getBoundingSphere(this.geometry.boundingSphere!);
    }

    /** Room for at least this many more vertices and indices: larger buffers, the old contents copied over on the GPU. */
    private reserve(vertexCount: number, indexCount: number): void {
        const vertexCapacity = Math.max(Math.ceil(this.vertices.capacity * 1.5), this.vertices.end + vertexCount);
        const indexCapacity = Math.max(Math.ceil(this.indices.capacity * 1.5), this.indices.end + indexCount);
        this.allocate(vertexCapacity, indexCapacity, this.vertices.end, this.indices.end);
        this.vertices.capacity = vertexCapacity;
        this.indices.capacity = indexCapacity;
    }

    /** New buffers of these capacities, keeping what the old ones held below the given counts. */
    private allocate(vertexCapacity: number, indexCapacity: number, keepVertices: number, keepIndices: number): void {
        for (const attribute of this.layout) {
            const bytesPerVertex = attribute.itemSize * attribute.componentBytes;
            const buffer = this.gpu.create('vertex', vertexCapacity * bytesPerVertex);
            const old = this.vertexBuffers.get(attribute.name);
            if (old) {
                if (keepVertices > 0) this.gpu.copy('vertex', old, buffer, keepVertices * bytesPerVertex);
                this.gpu.destroy(old);
            }
            this.vertexBuffers.set(attribute.name, buffer);
            const glAttribute = new THREE.GLBufferAttribute(buffer as WebGLBuffer, attribute.glType, attribute.itemSize, attribute.componentBytes, vertexCapacity);
            // Read by three's vertex-array setup; GLBufferAttribute has no such field of its own.
            (glAttribute as unknown as { normalized: boolean }).normalized = attribute.normalized;
            this.geometry.setAttribute(attribute.name, glAttribute as unknown as THREE.BufferAttribute);
        }
        const indexBuffer = this.gpu.create('index', indexCapacity * 4);
        if (this.indexBuffer) {
            if (keepIndices > 0) this.gpu.copy('index', this.indexBuffer, indexBuffer, keepIndices * 4);
            this.gpu.destroy(this.indexBuffer);
        }
        this.indexBuffer = indexBuffer;
        const index = new THREE.GLBufferAttribute(indexBuffer as WebGLBuffer, GL_UNSIGNED_INT, 1, 4, indexCapacity);
        this.geometry.setIndex(index as unknown as THREE.BufferAttribute);
    }
}
