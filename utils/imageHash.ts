
/**
 * Computes a perceptual hash (aHash) for a base64 image.
 * Uses a 16x16 mean hash algorithm.
 * 
 * Process:
 * 1. Resize to 16x16.
 * 2. Convert to grayscale.
 * 3. Compute mean brightness.
 * 4. Generate 256-bit hash (1 if pixel >= mean, else 0).
 * 5. Return as Hex string.
 */
export const computeBitmapHash = async (base64: string): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = `data:image/jpeg;base64,${base64}`;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 16;
            canvas.height = 16;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                resolve('');
                return;
            }
            
            // Draw resized
            ctx.drawImage(img, 0, 0, 16, 16);
            const imageData = ctx.getImageData(0, 0, 16, 16);
            const data = imageData.data;
            
            const grays: number[] = [];
            let sum = 0;

            // Convert to grayscale & sum
            for (let i = 0; i < data.length; i += 4) {
                // Luminance: 0.299*R + 0.587*G + 0.114*B
                const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
                grays.push(gray);
                sum += gray;
            }

            const mean = sum / grays.length;
            let hex = '';

            // Generate Hex from bits (4 bits per hex char)
            for (let i = 0; i < grays.length; i += 4) {
                const b0 = grays[i] >= mean ? 1 : 0;
                const b1 = (grays[i+1] || 0) >= mean ? 1 : 0;
                const b2 = (grays[i+2] || 0) >= mean ? 1 : 0;
                const b3 = (grays[i+3] || 0) >= mean ? 1 : 0;
                
                const val = (b0 << 3) | (b1 << 2) | (b2 << 1) | b3;
                hex += val.toString(16);
            }

            resolve(hex);
        };
        img.onerror = () => {
            console.warn("[pHash] Image load failed");
            resolve('');
        };
    });
};
