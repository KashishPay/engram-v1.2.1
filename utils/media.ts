
import * as pdfjsLibProxy from 'pdfjs-dist';

// Initialize PDF.js worker
const pdfjsLib = (pdfjsLibProxy as any).default || pdfjsLibProxy;

// Resilient Worker Loader
let workerInitPromise: Promise<void> | null = null;
let activeWorkerBlobUrl: string | null = null;

// Export clamp constants for external margin-aware logic
export const MIN_MARGIN_PX = 24; 
export const MAX_MARGIN_PX = 120;

const initPdfWorker = () => {
    if (workerInitPromise) return workerInitPromise;

    workerInitPromise = (async () => {
        if (!pdfjsLib || !pdfjsLib.GlobalWorkerOptions) return;

        if (activeWorkerBlobUrl) {
            URL.revokeObjectURL(activeWorkerBlobUrl);
            activeWorkerBlobUrl = null;
        }

        // Strategy 1: Try Local (Best for PWA)
        try {
            // Correct path for files served from 'public' in Vite/Capacitor
            const localUrl = './pdf.worker.min.js'; 
            console.debug("[PDF] Checking local UMD worker...");
            const res = await fetch(localUrl, { cache: "no-store" });
            const contentType = res.headers.get('Content-Type') || '';
            
            if (res.ok && (contentType.includes('javascript') || contentType.includes('application/x-javascript'))) {
                pdfjsLib.GlobalWorkerOptions.workerSrc = localUrl;
                console.debug("[PDF] workerSrc set to same-origin UMD");
                return;
            }
        } catch (e) {
            console.debug("[PDF] Local worker not found, trying CDN fallback.");
        }

        // Strategy 2: Try CDN Blob (Best for Capacitor to bypass file:// protocol issues)
        try {
            const cdnUrl = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
            console.debug("[PDF] Fetching UMD worker from CDN (fallback)...");
            
            const cdnRes = await fetch(cdnUrl);
            if (cdnRes.ok) {
                const blob = await cdnRes.blob();
                activeWorkerBlobUrl = URL.createObjectURL(blob);
                pdfjsLib.GlobalWorkerOptions.workerSrc = activeWorkerBlobUrl;
                console.debug("[PDF] workerSrc set to UMD blob (cdn)");
                return;
            } else {
                console.warn("[PDF] CDN fetch failed:", cdnRes.status);
            }
        } catch (e) {
            console.error("[PDF] Failed to load worker from CDN", e);
        }
        
        // Strategy 3: Main Thread Fallback
        // If we reach here, we leave workerSrc undefined or null.
        // PDF.js might throw a warning or error depending on the build, but it's our last resort.
        console.warn("[PDF] Worker initialization failed. PDF parsing will run on main thread (might freeze UI).");
    })();

    return workerInitPromise;
};

export const getPdfDocument = async (file: File) => {
    await initPdfWorker();
    
    try {
        console.debug(`[PDF] loading ${file.name} (${file.size} bytes)`);
        const arrayBuffer = await file.arrayBuffer();
        
        const data = new Uint8Array(arrayBuffer);
        
        console.debug("[PDF] getDocument start");
        const loadingTask = pdfjsLib.getDocument({ data });
        
        loadingTask.onProgress = (p: { loaded: number; total: number }) => {
            if (p.total > 0 && p.loaded < p.total) {
                 // console.debug(`[PDF] progress: ${Math.round((p.loaded / p.total) * 100)}%`);
            }
        };

        const pdf = await loadingTask.promise;
        console.debug(`[PDF] loaded successfully: ${pdf.numPages} pages`);
        return pdf;
    } catch (e: any) {
        console.error("[PDF] Load Error:", e.name, e.message);
        throw new Error(`Failed to load PDF: ${e.message || "Invalid file structure"}`);
    }
}

export const renderPdfPage = async (pdf: any, pageNum: number): Promise<string> => {
    try {
        console.debug(`[PDF] rendering page ${pageNum}`);
        const page = await pdf.getPage(pageNum);
        
        // Scale 1.5 is a good balance for OCR accuracy vs Memory usage on mobile
        const viewport = page.getViewport({ scale: 1.5 }); 
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        if (!context) throw new Error("Canvas context missing");
        
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context, viewport: viewport }).promise;
        console.debug(`[PDF] render complete page ${pageNum}`);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.80); 
        return dataUrl.split(',')[1];
    } catch (e) {
        console.error(`[PDF] Error rendering page ${pageNum}`, e);
        return "";
    }
};

/**
 * OPTIMIZED: Memory-safe image compression using URL.createObjectURL
 * instead of FileReader.readAsDataURL.
 * This prevents loading the entire raw file string into RAM.
 */
export const compressImage = async (file: File): Promise<{ base64: string, mimeType: string }> => {
    return new Promise((resolve, reject) => {
        // Create a blob URL reference (Efficient memory usage)
        const objectUrl = URL.createObjectURL(file);
        
        const img = new Image();
        img.src = objectUrl;
        
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                // Reduced resolution for mobile stability (1024px is standard safe texture size)
                const MAX_WIDTH = 1024;
                const MAX_HEIGHT = 1024;
                
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    URL.revokeObjectURL(objectUrl);
                    reject(new Error("Could not get canvas context"));
                    return;
                }
                
                ctx.drawImage(img, 0, 0, width, height);
                
                // Compress to 0.8 quality
                const dataUrl = canvas.toDataURL('image/jpeg', 0.80);
                const base64 = dataUrl.split(',')[1];
                
                // CLEANUP: Revoke blob URL immediately
                URL.revokeObjectURL(objectUrl);
                
                resolve({ base64, mimeType: 'image/jpeg' });
            } catch (err) {
                URL.revokeObjectURL(objectUrl);
                reject(err);
            }
        };
        
        img.onerror = (err) => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error("Failed to load image for compression."));
        };
    });
};

export const getImageDimensions = (base64Image: string): Promise<{ width: number, height: number }> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.onerror = (e) => reject(e);
        img.src = `data:image/jpeg;base64,${base64Image}`;
    });
};

// --- Mobile Optimization Helpers ---

// Pre-load image into memory for batch operations (Mobile Optimization)
export const loadImageFromBase64 = (base64: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = `data:image/jpeg;base64,${base64}`;
    });
};

// Crop from pre-loaded source (Synchronous & Fast)
export const cropImageFromSource = (
    img: HTMLImageElement, 
    ymin: number, 
    xmin: number, 
    ymax: number, 
    xmax: number
): string => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("No canvas context");

    const imgW = img.naturalWidth;
    const imgH = img.naturalHeight;

    // 1. Convert 0-1000 scale to pixels
    const x = (xmin / 1000) * imgW;
    const y = (ymin / 1000) * imgH;
    const w = ((xmax - xmin) / 1000) * imgW;
    const h = ((ymax - ymin) / 1000) * imgH;

    // 2. Apply Scale-Aware Margins with Clamps (Matches cropImageFromBase64)
    const EXPAND = 0.10; 
    const marginX = Math.min(Math.max(w * EXPAND, MIN_MARGIN_PX), MAX_MARGIN_PX);
    const marginY = Math.min(Math.max(h * EXPAND, MIN_MARGIN_PX), MAX_MARGIN_PX);

    // 3. Calculate safe source bounds
    const sx = Math.max(0, x - marginX);
    const sy = Math.max(0, y - marginY);
    const sw = Math.min(imgW - sx, w + (marginX * 2));
    const sh = Math.min(imgH - sy, h + (marginY * 2));

    canvas.width = sw;
    canvas.height = sh;

    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    
    return canvas.toDataURL('image/jpeg', 0.90).split(',')[1];
};

// Legacy single-shot crop (Web)
export const cropImageFromBase64 = async (
    base64Image: string, 
    ymin: number, 
    xmin: number, 
    ymax: number, 
    xmax: number
): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = `data:image/jpeg;base64,${base64Image}`;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject("No canvas context");
                return;
            }

            // 1. Convert 0-1000 scale to pixels
            const x = (xmin / 1000) * img.width;
            const y = (ymin / 1000) * img.height;
            const w = ((xmax - xmin) / 1000) * img.width;
            const h = ((ymax - ymin) / 1000) * img.height;

            // 2. Apply Scale-Aware Margins with Clamps
            // Percentage expansion
            const EXPAND = 0.10; 
            
            const marginX = Math.min(Math.max(w * EXPAND, MIN_MARGIN_PX), MAX_MARGIN_PX);
            const marginY = Math.min(Math.max(h * EXPAND, MIN_MARGIN_PX), MAX_MARGIN_PX);

            console.debug("[CROP] Bounds & Margins:", { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), marginX: Math.round(marginX), marginY: Math.round(marginY) });

            // 3. Calculate safe source bounds (clamped to image dimensions)
            const sx = Math.max(0, x - marginX);
            const sy = Math.max(0, y - marginY);
            // Source width/height must not exceed image bounds relative to sx/sy
            const sw = Math.min(img.width - sx, w + (marginX * 2));
            const sh = Math.min(img.height - sy, h + (marginY * 2));

            canvas.width = sw;
            canvas.height = sh;

            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
            
            const dataUrl = canvas.toDataURL('image/jpeg', 0.90);
            resolve(dataUrl.split(',')[1]);
        };
        img.onerror = (e) => reject(e);
    });
};
