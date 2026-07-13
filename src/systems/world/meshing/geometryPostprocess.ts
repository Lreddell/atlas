export interface LegacyGeometryAttributes {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  tileUvs?: Float32Array;
  tileData?: Float32Array;
}

interface FaceCell {
  sourceQuad: number;
  plane: number;
  u: number;
  v: number;
  axis: 0 | 1 | 2;
  axisU: 0 | 1 | 2;
  axisV: 0 | 1 | 2;
  sign: -1 | 1;
  uvMinU: number;
  uvMinV: number;
  uvSpanU: number;
  uvSpanV: number;
  tileOriginU: number;
  tileOriginV: number;
  tileStepUU: number;
  tileStepUV: number;
  tileStepVU: number;
  tileStepVV: number;
  color: [number, number, number];
}

interface Rectangle {
  cell: FaceCell;
  width: number;
  height: number;
}

const EPSILON = 1e-5;
const close = (a: number, b: number): boolean => Math.abs(a - b) <= EPSILON;
const integerish = (value: number): boolean => close(value, Math.round(value));
const numberKey = (value: number): string => Number(value.toFixed(7)).toString();

const axesForNormal = (normal: readonly number[]): { axis: 0 | 1 | 2; axisU: 0 | 1 | 2; axisV: 0 | 1 | 2; sign: -1 | 1 } | null => {
  if (Math.abs(normal[0]) > 0.999 && close(normal[1], 0) && close(normal[2], 0)) {
    return { axis: 0, axisU: 2, axisV: 1, sign: normal[0] > 0 ? 1 : -1 };
  }
  if (Math.abs(normal[1]) > 0.999 && close(normal[0], 0) && close(normal[2], 0)) {
    return { axis: 1, axisU: 0, axisV: 2, sign: normal[1] > 0 ? 1 : -1 };
  }
  if (Math.abs(normal[2]) > 0.999 && close(normal[0], 0) && close(normal[1], 0)) {
    return { axis: 2, axisU: 0, axisV: 1, sign: normal[2] > 0 ? 1 : -1 };
  }
  return null;
};

const readVertex = (positions: Float32Array, quad: number, vertex: number): [number, number, number] => {
  const offset = (quad * 4 + vertex) * 3;
  return [positions[offset], positions[offset + 1], positions[offset + 2]];
};

const readUv = (uvs: Float32Array, quad: number, vertex: number): [number, number] => {
  const offset = (quad * 4 + vertex) * 2;
  return [uvs[offset], uvs[offset + 1]];
};

const readColor = (colors: Float32Array, quad: number, vertex: number): [number, number, number] => {
  const offset = (quad * 4 + vertex) * 3;
  return [colors[offset], colors[offset + 1], colors[offset + 2]];
};

const analyzeCell = (geometry: LegacyGeometryAttributes, quad: number): FaceCell | null => {
  const normalOffset = quad * 12;
  const axes = axesForNormal([
    geometry.normals[normalOffset],
    geometry.normals[normalOffset + 1],
    geometry.normals[normalOffset + 2],
  ]);
  if (!axes) return null;

  const positions = [0, 1, 2, 3].map((vertex) => readVertex(geometry.positions, quad, vertex));
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const position of positions) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], position[axis]);
      max[axis] = Math.max(max[axis], position[axis]);
    }
  }
  if (!close(min[axes.axis], max[axes.axis])) return null;
  if (!close(max[axes.axisU] - min[axes.axisU], 1)) return null;
  if (!close(max[axes.axisV] - min[axes.axisV], 1)) return null;
  if (!integerish(min[axes.axisU]) || !integerish(min[axes.axisV]) || !integerish(min[axes.axis])) return null;

  const baseColor = readColor(geometry.colors, quad, 0);
  for (let vertex = 1; vertex < 4; vertex += 1) {
    const color = readColor(geometry.colors, quad, vertex);
    if (!close(color[0], baseColor[0]) || !close(color[1], baseColor[1]) || !close(color[2], baseColor[2])) return null;
  }

  const uvs = [0, 1, 2, 3].map((vertex) => readUv(geometry.uvs, quad, vertex));
  const uvMinU = Math.min(...uvs.map((uv) => uv[0]));
  const uvMinV = Math.min(...uvs.map((uv) => uv[1]));
  const uvMaxU = Math.max(...uvs.map((uv) => uv[0]));
  const uvMaxV = Math.max(...uvs.map((uv) => uv[1]));
  const uvSpanU = uvMaxU - uvMinU;
  const uvSpanV = uvMaxV - uvMinV;
  if (!(uvSpanU > EPSILON) || !(uvSpanV > EPSILON)) return null;

  const normalized = uvs.map(([u, v]) => [(u - uvMinU) / uvSpanU, (v - uvMinV) / uvSpanV] as [number, number]);
  let originIndex = -1;
  let uIndex = -1;
  let vIndex = -1;
  for (let vertex = 0; vertex < 4; vertex += 1) {
    const p = positions[vertex];
    const localU = p[axes.axisU] - min[axes.axisU];
    const localV = p[axes.axisV] - min[axes.axisV];
    if (close(localU, 0) && close(localV, 0)) originIndex = vertex;
    else if (close(localU, 1) && close(localV, 0)) uIndex = vertex;
    else if (close(localU, 0) && close(localV, 1)) vIndex = vertex;
  }
  if (originIndex < 0 || uIndex < 0 || vIndex < 0) return null;
  const origin = normalized[originIndex];
  const uCorner = normalized[uIndex];
  const vCorner = normalized[vIndex];

  return {
    sourceQuad: quad,
    plane: Math.round(min[axes.axis]),
    u: Math.round(min[axes.axisU]),
    v: Math.round(min[axes.axisV]),
    ...axes,
    uvMinU,
    uvMinV,
    uvSpanU,
    uvSpanV,
    tileOriginU: origin[0],
    tileOriginV: origin[1],
    tileStepUU: uCorner[0] - origin[0],
    tileStepUV: uCorner[1] - origin[1],
    tileStepVU: vCorner[0] - origin[0],
    tileStepVV: vCorner[1] - origin[1],
    color: baseColor,
  };
};

const signatureFor = (cell: FaceCell): string => [
  cell.axis,
  cell.sign,
  cell.plane,
  numberKey(cell.uvMinU), numberKey(cell.uvMinV), numberKey(cell.uvSpanU), numberKey(cell.uvSpanV),
  numberKey(cell.tileOriginU), numberKey(cell.tileOriginV),
  numberKey(cell.tileStepUU), numberKey(cell.tileStepUV), numberKey(cell.tileStepVU), numberKey(cell.tileStepVV),
  numberKey(cell.color[0]), numberKey(cell.color[1]), numberKey(cell.color[2]),
].join('|');

const rectanglesForGroup = (cells: FaceCell[]): Rectangle[] => {
  const grid = new Map<string, FaceCell>();
  for (const cell of cells) grid.set(`${cell.u},${cell.v}`, cell);
  const ordered = [...cells].sort((a, b) => a.v - b.v || a.u - b.u);
  const rectangles: Rectangle[] = [];
  for (const cell of ordered) {
    const startKey = `${cell.u},${cell.v}`;
    if (!grid.has(startKey)) continue;
    let width = 1;
    while (grid.has(`${cell.u + width},${cell.v}`)) width += 1;
    let height = 1;
    outer: while (true) {
      const nextV = cell.v + height;
      for (let offset = 0; offset < width; offset += 1) {
        if (!grid.has(`${cell.u + offset},${nextV}`)) break outer;
      }
      height += 1;
    }
    for (let dv = 0; dv < height; dv += 1) {
      for (let du = 0; du < width; du += 1) grid.delete(`${cell.u + du},${cell.v + dv}`);
    }
    rectangles.push({ cell, width, height });
  }
  return rectangles;
};

class OutputBuilder {
  private positions: number[] = [];
  private normals: number[] = [];
  private uvs: number[] = [];
  private colors: number[] = [];
  private indices: number[] = [];
  private tileUvs: number[] = [];
  private tileData: number[] = [];
  mergedQuads = 0;

  appendSource(geometry: LegacyGeometryAttributes, quad: number): void {
    const vertexBase = this.positions.length / 3;
    const pOffset = quad * 12;
    const uvOffset = quad * 8;
    for (let index = 0; index < 12; index += 1) {
      this.positions.push(geometry.positions[pOffset + index]);
      this.normals.push(geometry.normals[pOffset + index]);
      this.colors.push(geometry.colors[pOffset + index]);
    }
    for (let index = 0; index < 8; index += 1) this.uvs.push(geometry.uvs[uvOffset + index]);
    for (let vertex = 0; vertex < 4; vertex += 1) {
      this.tileUvs.push(0, 0);
      this.tileData.push(0, 0, 0, 0);
    }
    this.indices.push(vertexBase, vertexBase + 1, vertexBase + 2, vertexBase, vertexBase + 2, vertexBase + 3);
  }

  appendRectangle(rectangle: Rectangle, geometry: LegacyGeometryAttributes): void {
    const { cell, width, height } = rectangle;
    if (width === 1 && height === 1) {
      this.appendSource(geometry, cell.sourceQuad);
      return;
    }
    this.mergedQuads += width * height - 1;
    const sourcePositions = [0, 1, 2, 3].map((vertex) => readVertex(geometry.positions, cell.sourceQuad, vertex));
    const minU = cell.u;
    const minV = cell.v;
    const vertexBase = this.positions.length / 3;
    for (let vertex = 0; vertex < 4; vertex += 1) {
      const source = sourcePositions[vertex];
      const sourceU = close(source[cell.axisU], minU) ? 0 : 1;
      const sourceV = close(source[cell.axisV], minV) ? 0 : 1;
      const position = [...source];
      position[cell.axis] = cell.plane;
      position[cell.axisU] = minU + sourceU * width;
      position[cell.axisV] = minV + sourceV * height;
      this.positions.push(position[0], position[1], position[2]);
      const normal = [0, 0, 0];
      normal[cell.axis] = cell.sign;
      this.normals.push(normal[0], normal[1], normal[2]);
      this.colors.push(cell.color[0], cell.color[1], cell.color[2]);
      const tileU = cell.tileOriginU + cell.tileStepUU * (sourceU * width) + cell.tileStepVU * (sourceV * height);
      const tileV = cell.tileOriginV + cell.tileStepUV * (sourceU * width) + cell.tileStepVV * (sourceV * height);
      this.tileUvs.push(tileU, tileV);
      this.tileData.push(cell.uvMinU, cell.uvMinV, cell.uvSpanU, cell.uvSpanV);
      const sourceUv = readUv(geometry.uvs, cell.sourceQuad, vertex);
      this.uvs.push(sourceUv[0], sourceUv[1]);
    }
    this.indices.push(vertexBase, vertexBase + 1, vertexBase + 2, vertexBase, vertexBase + 2, vertexBase + 3);
  }

  finish(): LegacyGeometryAttributes & { mergedQuadCount: number } {
    return {
      positions: Float32Array.from(this.positions),
      normals: Float32Array.from(this.normals),
      uvs: Float32Array.from(this.uvs),
      colors: Float32Array.from(this.colors),
      indices: Uint32Array.from(this.indices),
      tileUvs: Float32Array.from(this.tileUvs),
      tileData: Float32Array.from(this.tileData),
      mergedQuadCount: this.mergedQuads,
    };
  }
}

export const mergeOpaqueGeometryQuads = (
  geometry: LegacyGeometryAttributes,
): LegacyGeometryAttributes & { mergedQuadCount: number } => {
  const quadCount = Math.floor(geometry.positions.length / 12);
  if (quadCount === 0 || geometry.indices.length !== quadCount * 6) {
    return { ...geometry, mergedQuadCount: 0 };
  }
  const groups = new Map<string, FaceCell[]>();
  const ineligible: number[] = [];
  for (let quad = 0; quad < quadCount; quad += 1) {
    const cell = analyzeCell(geometry, quad);
    if (!cell) {
      ineligible.push(quad);
      continue;
    }
    const signature = signatureFor(cell);
    const group = groups.get(signature);
    if (group) group.push(cell);
    else groups.set(signature, [cell]);
  }

  const builder = new OutputBuilder();
  // Preserve special/shaped geometry before merged cube faces. Opaque ordering is irrelevant.
  for (const quad of ineligible) builder.appendSource(geometry, quad);
  for (const cells of groups.values()) {
    for (const rectangle of rectanglesForGroup(cells)) builder.appendRectangle(rectangle, geometry);
  }
  return builder.finish();
};

export const compactIndices = (geometry: LegacyGeometryAttributes): LegacyGeometryAttributes => {
  const vertexCount = geometry.positions.length / 3;
  if (vertexCount > 0xffff) return geometry;
  return { ...geometry, indices: Uint32Array.from(Uint16Array.from(geometry.indices)) };
};
