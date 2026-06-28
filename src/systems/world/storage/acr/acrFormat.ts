// =============================================================================
// Atlas Chunk Region (.acr) file format — v1   (THE authoritative layout)
// =============================================================================
//
// An .acr file packs a 32x32 = 1024-chunk grid into one file, using a classic
// region-file architecture (fixed header tables + 4096-byte sectors) but WIDENED
// so there is no 255-sector (~1 MiB) per-chunk cap and therefore no overflow
// sidecar files. Both the pure-TS codec (this folder) and the
// Electron main-process port (electron/saves/acrCore.cjs) implement EXACTLY this
// layout; acrCrossCompat.test.mjs asserts they are byte-identical.
//
// All multi-byte integers are BIG-ENDIAN.
//
// Sector map (sector size = 4096 bytes):
//   sector 0        bytes      0 ..   4095   FILE HEADER
//   sectors 1..2    bytes   4096 ..  12287   LOCATION TABLE   (1024 x 8 bytes)
//   sectors 3..4    bytes  12288 ..  20479   TIMESTAMP TABLE  (1024 x 8 bytes)
//   sectors 5..     bytes  20480 ..          CHUNK DATA SECTORS
//
// FILE HEADER (sector 0):
//   off 0   u8[4]  magic            = 'A','C','R','1'  (0x41 0x43 0x52 0x31)
//   off 4   u32    formatVersion    = 1
//   off 8   u32    sectorSize       = 4096
//   off 12  u32    regionEdge       = 32      (chunks per region edge)
//   off 16  u32    headerSectors    = 5       (first data sector index)
//   off 20  ..4095 reserved (zero)
//
// LOCATION TABLE entry (8 bytes), slot = localX + localZ*32:
//   off 0   u32    sectorOffset     (absolute sector index; 0 => chunk absent)
//   off 4   u32    sectorCount      (sectors occupied; 0 => chunk absent)
//   -> 32-bit offset + 32-bit count: this is the "widened sector count". No cap.
//
// TIMESTAMP TABLE entry (8 bytes):
//   off 0   u64    timestampMs      (epoch ms of last write; 0 => never)
//
// CHUNK SLOT PAYLOAD (begins at sectorOffset*4096; zero-padded up to a whole
// number of sectors):
//   off 0   u32    payloadLength    (# bytes that follow, EXCLUDING these 4 and
//                                     EXCLUDING sector padding)
//   off 4   u8     compressionType  (0 = raw, 1 = deflate)
//   off 5   ..     payload bytes    (the CHUNK BODY below, deflated if type=1)
//
// CHUNK BODY (the framed chunk, before optional compression):
//   off 0   u8     bodySchema       = 1   (forward-compatible payload schema)
//   off 1   u64    timestampMs      (chunk save timestamp; preserves the
//                                     existing ChunkStorageData.timestamp)
//   off 9   u32    blocksLen
//   off 13  u32    lightLen
//   off 17  u32    metaLen
//   off 21  ..     blocks bytes | light bytes | meta bytes  (concatenated)
//
// COMMIT ORDERING (crash-safety): a writer MUST write the payload sectors and
// flush them BEFORE writing the location/timestamp table entry that points at
// them, then flush the header. The header entry is the commit point, so a crash
// can never leave a table entry referencing an incomplete payload.
// =============================================================================

export const ACR_MAGIC = Object.freeze([0x41, 0x43, 0x52, 0x31]); // "ACR1"
export const ACR_FORMAT_VERSION = 1;
export const SECTOR_SIZE = 4096;
export const REGION_EDGE = 32;
export const SLOTS_PER_REGION = REGION_EDGE * REGION_EDGE; // 1024

// Header / table geometry, in sectors and bytes.
export const HEADER_SECTOR = 0;
export const LOCATION_TABLE_SECTOR = 1; // sectors 1..2
export const TIMESTAMP_TABLE_SECTOR = 3; // sectors 3..4
export const HEADER_SECTORS = 5; // first data sector
export const LOCATION_TABLE_OFFSET = LOCATION_TABLE_SECTOR * SECTOR_SIZE; // 4096
export const TIMESTAMP_TABLE_OFFSET = TIMESTAMP_TABLE_SECTOR * SECTOR_SIZE; // 12288
export const DATA_START_OFFSET = HEADER_SECTORS * SECTOR_SIZE; // 20480

export const LOCATION_ENTRY_BYTES = 8;
export const TIMESTAMP_ENTRY_BYTES = 8;

export const CHUNK_SLOT_HEADER_BYTES = 5; // u32 length + u8 compression
export const BODY_SCHEMA_VERSION = 1;
// bodySchema(1) + timestampMs(8) + blocksLen(4) + lightLen(4) + metaLen(4)
export const BODY_HEADER_BYTES = 21;

export const COMPRESSION_RAW = 0;
export const COMPRESSION_DEFLATE = 1;

/** Bytes -> whole sectors, rounded up (min handled by caller). */
export function sectorsFor(byteLength: number): number {
    return Math.ceil(byteLength / SECTOR_SIZE);
}
