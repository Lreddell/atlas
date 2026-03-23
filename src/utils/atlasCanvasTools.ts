import type { CutoutTileConfig } from './atlasTileFamilies';

export const sanitizeCutoutTiles = (
    ctx: CanvasRenderingContext2D,
    size: number,
    cols: number,
    rows: number,
    configs: CutoutTileConfig[],
) => {
    const sanitizeCutoutTile = (
        tileCol: number,
        tileRow: number,
        alphaCutoff = 160,
        iterations = 4,
        forcedTransparentRgb?: [number, number, number],
    ) => {
        const tileX = tileCol * size;
        const tileY = tileRow * size;
        const imageData = ctx.getImageData(tileX, tileY, size, size);
        const pixels = imageData.data;
        const tileWidth = size;

        let opaqueRSum = 0;
        let opaqueGSum = 0;
        let opaqueBSum = 0;
        let opaqueCount = 0;

        for (let y = 0; y < size; y += 1) {
            for (let x = 0; x < size; x += 1) {
                const idx = (y * tileWidth + x) * 4;
                const alpha = pixels[idx + 3];
                pixels[idx + 3] = alpha >= alphaCutoff ? 255 : 0;
                if (pixels[idx + 3] > 0) {
                    opaqueRSum += pixels[idx];
                    opaqueGSum += pixels[idx + 1];
                    opaqueBSum += pixels[idx + 2];
                    opaqueCount += 1;
                }
            }
        }

        for (let pass = 0; pass < iterations; pass += 1) {
            const source = new Uint8ClampedArray(pixels);

            for (let y = 0; y < size; y += 1) {
                for (let x = 0; x < size; x += 1) {
                    const idx = (y * tileWidth + x) * 4;
                    if (source[idx + 3] > 0) continue;

                    let rSum = 0;
                    let gSum = 0;
                    let bSum = 0;
                    let count = 0;

                    for (let oy = -1; oy <= 1; oy += 1) {
                        for (let ox = -1; ox <= 1; ox += 1) {
                            if (ox === 0 && oy === 0) continue;
                            const nx = x + ox;
                            const ny = y + oy;
                            if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
                            const nIdx = (ny * tileWidth + nx) * 4;
                            if (source[nIdx + 3] === 0) continue;
                            rSum += source[nIdx];
                            gSum += source[nIdx + 1];
                            bSum += source[nIdx + 2];
                            count += 1;
                        }
                    }

                    if (count > 0) {
                        pixels[idx] = Math.round(rSum / count);
                        pixels[idx + 1] = Math.round(gSum / count);
                        pixels[idx + 2] = Math.round(bSum / count);
                    }
                }
            }
        }

        const fallbackR = forcedTransparentRgb?.[0] ?? (opaqueCount > 0 ? Math.round(opaqueRSum / opaqueCount) : 96);
        const fallbackG = forcedTransparentRgb?.[1] ?? (opaqueCount > 0 ? Math.round(opaqueGSum / opaqueCount) : 144);
        const fallbackB = forcedTransparentRgb?.[2] ?? (opaqueCount > 0 ? Math.round(opaqueBSum / opaqueCount) : 96);

        for (let y = 0; y < size; y += 1) {
            for (let x = 0; x < size; x += 1) {
                const idx = (y * tileWidth + x) * 4;
                if (pixels[idx + 3] !== 0) continue;

                const isZeroed = pixels[idx] === 0 && pixels[idx + 1] === 0 && pixels[idx + 2] === 0;
                const isNearWhite = pixels[idx] > 180 && pixels[idx + 1] > 180 && pixels[idx + 2] > 180;

                if (isZeroed || isNearWhite) {
                    pixels[idx] = fallbackR;
                    pixels[idx + 1] = fallbackG;
                    pixels[idx + 2] = fallbackB;
                }
            }
        }

        ctx.putImageData(imageData, tileX, tileY);
    };

    configs.forEach(({ slot, alphaCutoff, forcedTransparentRgb }) => {
        const tileCol = slot % cols;
        const tileRow = Math.floor(slot / cols);
        if (tileRow < rows) {
            sanitizeCutoutTile(tileCol, tileRow, alphaCutoff, 4, forcedTransparentRgb);
        }
    });
};

export const createPaddedAtlasCanvas = (
    rawCanvas: HTMLCanvasElement,
    rows: number,
    cols: number,
    padding: number,
    stride: number,
) => {
    const paddedCanvas = document.createElement('canvas');
    const finalWidth = cols * stride;
    const finalHeight = rows * stride;

    paddedCanvas.width = finalWidth;
    paddedCanvas.height = finalHeight;

    const paddedContext = paddedCanvas.getContext('2d');
    if (!paddedContext) return null;

    paddedContext.imageSmoothingEnabled = false;

    for (let index = 0; index < cols * rows; index += 1) {
        const col = index % cols;
        const row = Math.floor(index / cols);
        const srcX = col * 16;
        const srcY = row * 16;
        const destX = col * stride + padding;
        const destY = row * stride + padding;

        paddedContext.drawImage(rawCanvas, srcX, srcY, 16, 16, destX, destY, 16, 16);
        paddedContext.drawImage(rawCanvas, srcX, srcY, 16, 1, destX, destY - padding, 16, padding);
        paddedContext.drawImage(rawCanvas, srcX, srcY + 15, 16, 1, destX, destY + 16, 16, padding);
        paddedContext.drawImage(rawCanvas, srcX, srcY, 1, 16, destX - padding, destY, padding, 16);
        paddedContext.drawImage(rawCanvas, srcX + 15, srcY, 1, 16, destX + 16, destY, padding, 16);
        paddedContext.drawImage(rawCanvas, srcX, srcY, 1, 1, destX - padding, destY - padding, padding, padding);
        paddedContext.drawImage(rawCanvas, srcX + 15, srcY, 1, 1, destX + 16, destY - padding, padding, padding);
        paddedContext.drawImage(rawCanvas, srcX, srcY + 15, 1, 1, destX - padding, destY + 16, padding, padding);
        paddedContext.drawImage(rawCanvas, srcX + 15, srcY + 15, 1, 1, destX + 16, destY + 16, padding, padding);
    }

    return {
        canvas: paddedCanvas,
        width: finalWidth,
        height: finalHeight,
    };
};
