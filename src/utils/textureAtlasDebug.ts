export const openAtlasDebugWindow = (
    atlasUrl: string,
    width: number,
    height: number,
    cols: number,
    padding: number,
    stride: number,
) => {
    const img = new Image();
    img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0);

        const rows = height / stride;
        for (let row = 0; row < rows; row += 1) {
            for (let col = 0; col < cols; col += 1) {
                const index = row * cols + col;
                const ox = col * stride;
                const oy = row * stride;

                ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
                ctx.lineWidth = 1;
                ctx.strokeRect(ox + 0.5, oy + 0.5, stride - 1, stride - 1);

                ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
                ctx.strokeRect(ox + padding + 0.5, oy + padding + 0.5, 15, 15);

                ctx.fillStyle = 'white';
                ctx.font = '8px monospace';
                ctx.textBaseline = 'top';
                ctx.fillText(index.toString(), ox + 2, oy + 2);
            }
        }

        const debugUrl = canvas.toDataURL();
        const win = window.open();
        if (win) {
            win.document.write(`<img src="${debugUrl}" style="image-rendering:pixelated; background:#222;"/>`);
        } else {
            console.log('Atlas Debug URL:', debugUrl);
        }
    };
    img.src = atlasUrl;
};
