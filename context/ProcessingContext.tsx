
import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { callGeminiApiWithRetry, getFeatureConfig, detectMathStyle } from '../services/gemini';
import { compressImage, getPdfDocument, renderPdfPage, getImageDimensions, loadImageFromBase64, cropImageFromSource, MIN_MARGIN_PX, MAX_MARGIN_PX, cropImageFromBase64 } from '../utils/media';
import { saveImageToIDB, saveTopicBodyToIDB, getTopicBodyFromIDB, getNextSourceIndex, getSourceImageCount } from '../services/storage';
import { getOCRPrompt, OCR_SYSTEM_INSTRUCTION } from '../services/llmPrompt';
import { normalizeLLMOutput } from '../utils/llmOutputNormalize';
import { computeBitmapHash } from '../utils/imageHash';
import { Capacitor } from '@capacitor/core';
import { requestWakeLock, releaseWakeLock } from '../utils/wakeLock';

// --- Spatial Grouping & NMS Utilities ---

interface Rect {
    ymin: number;
    xmin: number;
    ymax: number;
    xmax: number;
    fullTag: string;
    desc: string;
}

// ExpandedRect carries the "visual" footprint used for clustering
interface ExpandedRect extends Rect {
    original: Rect;
}

interface ProcessedCluster {
    union: Rect;         // The raw union of the ORIGINAL tags
    visualUnion: Rect;   // The union of EXPANDED tags (for NMS)
    originalTags: Rect[];
}

// Minimum dimensions for a crop to be considered valid (prevents micro-fragments)
const MIN_DIM_PX = 48;
const MIN_AREA_PX2 = 48 * 48;

function getUnion(rects: Rect[]): Rect {
    if (rects.length === 0) throw new Error("Empty cluster");
    let ymin = rects[0].ymin, xmin = rects[0].xmin;
    let ymax = rects[0].ymax, xmax = rects[0].xmax;
    // Use first tag's desc/fullTag as representative for the union object structure
    const { fullTag, desc } = rects[0];
    
    for (let i = 1; i < rects.length; i++) {
        ymin = Math.min(ymin, rects[i].ymin);
        xmin = Math.min(xmin, rects[i].xmin);
        ymax = Math.max(ymax, rects[i].ymax);
        xmax = Math.max(xmax, rects[i].xmax);
    }
    return { ymin, xmin, ymax, xmax, fullTag, desc };
}

function iou(a: Rect, b: Rect): number {
    const interX1 = Math.max(a.xmin, b.xmin);
    const interY1 = Math.max(a.ymin, b.ymin);
    const interX2 = Math.min(a.xmax, b.xmax);
    const interY2 = Math.min(a.ymax, b.ymax);

    const interW = Math.max(0, interX2 - interX1);
    const interH = Math.max(0, interY2 - interY1);
    const interArea = interW * interH;

    const areaA = (a.xmax - a.xmin) * (a.ymax - a.ymin);
    const areaB = (b.xmax - b.xmin) * (b.ymax - b.ymin);
    const unionArea = areaA + areaB - interArea;

    return unionArea > 0 ? interArea / unionArea : 0;
}

function distance(a: Rect, b: Rect): number {
    // 0 if overlapping
    const dx = Math.max(0, Math.max(a.xmin, b.xmin) - Math.min(a.xmax, b.xmax));
    const dy = Math.max(0, Math.max(a.ymin, b.ymin) - Math.min(a.ymax, b.ymax));
    return Math.sqrt(dx * dx + dy * dy);
}

// Cluster using ExpandedRects (Visual Footprints)
function clusterRects(rects: ExpandedRect[]): ExpandedRect[][] {
    const clusters: ExpandedRect[][] = [];
    const used = new Set<number>();

    for (let i = 0; i < rects.length; i++) {
        if (used.has(i)) continue;
        
        const currentCluster = [rects[i]];
        used.add(i);
        
        let changed = true;
        while (changed) {
            changed = false;
            for (let j = 0; j < rects.length; j++) {
                if (used.has(j)) continue;
                
                // Threshold: 5% intersection or 50 units proximity (on 1000 scale)
                // We use the EXPANDED rects here, so margins effectively overlap
                const connects = currentCluster.some(c => 
                    iou(c, rects[j]) > 0.05 || distance(c, rects[j]) < 50
                );

                if (connects) {
                    currentCluster.push(rects[j]);
                    used.add(j);
                    changed = true;
                }
            }
        }
        clusters.push(currentCluster);
    }
    return clusters;
}

function expandRect(r: Rect, imgW: number, imgH: number): ExpandedRect {
    // 1. To Pixels
    const x = (r.xmin / 1000) * imgW;
    const y = (r.ymin / 1000) * imgH;
    const w = ((r.xmax - r.xmin) / 1000) * imgW;
    const h = ((r.ymax - r.ymin) / 1000) * imgH;

    // 2. Calculate Margins (Same logic as utils/media.ts)
    const mx = Math.min(Math.max(w * 0.10, MIN_MARGIN_PX), MAX_MARGIN_PX);
    const my = Math.min(Math.max(h * 0.10, MIN_MARGIN_PX), MAX_MARGIN_PX);

    // 3. Apply & Clamp Bounds
    const sx = Math.max(0, x - mx);
    const sy = Math.max(0, y - my);
    const ex = Math.min(imgW, x + w + mx);
    const ey = Math.min(imgH, y + h + my);

    // 4. Back to 0-1000
    return {
        ...r, 
        original: r,
        xmin: (sx / imgW) * 1000,
        ymin: (sy / imgH) * 1000,
        xmax: (ex / imgW) * 1000,
        ymax: (ey / imgH) * 1000
    };
}

function passesFloors(r: Rect, imgW: number, imgH: number): boolean {
    // Convert 0-1000 scale to pixels
    const wPx = ((r.xmax - r.xmin) / 1000) * imgW;
    const hPx = ((r.ymax - r.ymin) / 1000) * imgH;
    return wPx >= MIN_DIM_PX && hPx >= MIN_DIM_PX && (wPx * hPx) >= MIN_AREA_PX2;
}

// Non-Maximum Suppression to remove duplicate/overlapping crops
function nonMaxSuppress(clusters: ProcessedCluster[]): { kept: ProcessedCluster[], removed: ProcessedCluster[] } {
    const iouRemoveTh = 0.85; // Remove if IoU >= 85%
    const centerDistTh = 30;  // Remove if centers within 30 units (3%)

    // Sort by visual area descending so larger boxes tend to win
    const sorted = clusters.slice().sort((a, b) => {
        const areaA = (a.visualUnion.xmax - a.visualUnion.xmin) * (a.visualUnion.ymax - a.visualUnion.ymin);
        const areaB = (b.visualUnion.xmax - b.visualUnion.xmin) * (b.visualUnion.ymax - b.visualUnion.ymin);
        return areaB - areaA;
    });

    const kept: ProcessedCluster[] = [];
    const removed: ProcessedCluster[] = [];

    for (const curr of sorted) {
        let duplicate = false;
        const r = curr.visualUnion; // Use Expanded/Visual union for NMS
        
        for (const k of kept) {
            const kr = k.visualUnion;
            // Center distance check
            const cxr = (r.xmin + r.xmax) / 2;
            const cyr = (r.ymin + r.ymax) / 2;
            const cxk = (kr.xmin + kr.xmax) / 2;
            const cyk = (kr.ymin + kr.ymax) / 2;
            
            const dist = Math.sqrt(Math.pow(cxr - cxk, 2) + Math.pow(cyr - cyk, 2));
            const overlap = iou(r, kr);

            if (overlap >= iouRemoveTh || dist <= centerDistTh) {
                duplicate = true;
                break;
            }
        }

        if (duplicate) removed.push(curr);
        else kept.push(curr);
    }

    return { kept, removed };
}

// --- End Utilities ---

interface ProcessingJob {
    id: string; // topicId
    status: 'idle' | 'uploading' | 'processing' | 'success' | 'error';
    progress: { current: number; total: number };
    message?: string;
    stats?: { pages: number; size: string; totalImages?: number }; // Added totalImages
    startTime: number;
}

interface ProcessingContextType {
    jobs: Record<string, ProcessingJob>;
    startProcessing: (userId: string, topicId: string, files: FileList) => Promise<void>;
    clearJob: (topicId: string) => void;
}

const ProcessingContext = createContext<ProcessingContextType | undefined>(undefined);

export const ProcessingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [jobs, setJobs] = useState<Record<string, ProcessingJob>>({});

    const updateJob = (topicId: string, updates: Partial<ProcessingJob>) => {
        setJobs(prev => ({
            ...prev,
            [topicId]: { ...prev[topicId], ...updates }
        }));
    };

    const processAttachment = async (attachment: { base64: string, mimeType: string }) => {
        // Read optional persona for OCR style
        const prefs = getFeatureConfig('ocr');
        const styleParams = detectMathStyle(prefs.persona);
        
        // Use centralized prompt builder with strict invariants
        const prompt = getOCRPrompt(prefs.persona, styleParams);

        try {
            // Pre-fetch dims for validation
            const imgDims = await getImageDimensions(attachment.base64);

            const data = await callGeminiApiWithRetry(
                prompt, 
                OCR_SYSTEM_INSTRUCTION, 
                null, 
                [attachment], 
                null, 
                3, 
                'gemini-3-flash-preview',
                'ocr'
            );
            
            // Normalize output: standardize delimiters
            let text = normalizeLLMOutput(data?.text?.trim() || '');

            // FIX: Robustly strip fenced code blocks from anywhere in the output
            // This handles cases where LLM output includes code fences in the middle of text
            // or when multiple pages are concatenated.
            text = text.replace(/```[a-z]*\n/gi, '').replace(/\n```/g, '');

            // Apply style tag if detected
            if (styleParams) {
                text = `[STYLE: math=${styleParams}]\n\n${text}`;
            }

            // 1. Extract Matches using Tolerant Regex
            // Allows spaces: [CROP: 10, 20, 30, 40 | Caption]
            const cropRegex = /\[CROP[:\s]+\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:\|\s*(.*?))?\]/gi;
            const matches = [...text.matchAll(cropRegex)];
            
            console.debug(`[OCR] Crop Tags matched=${matches.length}`);

            if (matches.length > 0) {
                // 2. Parse Raw Rects
                const rawRects: Rect[] = matches.map(m => ({
                    ymin: parseInt(m[1]),
                    xmin: parseInt(m[2]),
                    ymax: parseInt(m[3]),
                    xmax: parseInt(m[4]),
                    desc: m[5]?.trim() || 'Figure',
                    fullTag: m[0]
                }));

                // 3. Expand Rects (Apply Margins in logic)
                const expandedRects = rawRects.map(r => expandRect(r, imgDims.width, imgDims.height));

                // 4. Cluster using Expanded Geometry
                const clusters = clusterRects(expandedRects);
                
                // 5. Create Unions (Raw & Visual) & Filter Floors
                let processedClusters: ProcessedCluster[] = clusters.map(cluster => ({
                    visualUnion: getUnion(cluster), // Cluster is list of ExpandedRects
                    union: getUnion(cluster.map(c => c.original)), // Raw union for cropping
                    originalTags: cluster.map(c => c.original)
                })).filter(pc => passesFloors(pc.union, imgDims.width, imgDims.height));

                // 6. NMS Deduplication (using Visual Unions)
                const { kept: finalClusters, removed } = nonMaxSuppress(processedClusters);
                const nmsRemoved = removed.length;

                // 7. Bitmap Deduplication (pHash)
                const seenHashes = new Set<string>();
                let hashDupes = 0;
                let cropsProcessed = 0;

                console.debug(`[OCR] Pipeline: ${rawRects.length} tags -> ${clusters.length} clusters -> ${finalClusters.length} post-NMS`);

                // -- MOBILE OPTIMIZATION CHECK --
                const isNative = Capacitor.isNativePlatform();
                let sharedSource: HTMLImageElement | null = null;

                if (isNative) {
                    try {
                        console.debug("[OCR] Native Mode: Pre-loading image for batch processing...");
                        sharedSource = await loadImageFromBase64(attachment.base64);
                    } catch (e) {
                        console.warn("[OCR] Failed to pre-load image, falling back to legacy mode", e);
                    }
                }

                // 8. Process Kept Clusters
                for (const pc of finalClusters) {
                    try {
                        let croppedBase64: string;

                        if (isNative && sharedSource) {
                            // FAST PATH: Crop from shared source object
                            croppedBase64 = cropImageFromSource(
                                sharedSource,
                                pc.union.ymin,
                                pc.union.xmin,
                                pc.union.ymax,
                                pc.union.xmax
                            );
                        } else {
                            // LEGACY PATH: Decode base64 again (Web)
                            croppedBase64 = await cropImageFromBase64(
                                attachment.base64, 
                                pc.union.ymin, 
                                pc.union.xmin, 
                                pc.union.ymax, 
                                pc.union.xmax
                            );
                        }
                        
                        // Compute pHash
                        const hash = await computeBitmapHash(croppedBase64);
                        if (seenHashes.has(hash)) {
                            hashDupes++;
                            // Remove tags for duplicate visual
                            for (const rect of pc.originalTags) {
                                text = text.replace(rect.fullTag, '');
                            }
                            continue;
                        }
                        seenHashes.add(hash);
                        cropsProcessed++;

                        const imageId = `img_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
                        await saveImageToIDB(imageId, croppedBase64);

                        // Replace the FIRST tag of the cluster with the image
                        const firstTag = pc.originalTags[0];
                        const newTag = `\n[FIG_CAPTURE: ${imageId} | ${firstTag.desc}]\n`;
                        text = text.replace(firstTag.fullTag, newTag);

                        // Remove subsequent tags in the same cluster to avoid duplicates in text
                        for (let i = 1; i < pc.originalTags.length; i++) {
                            text = text.replace(pc.originalTags[i].fullTag, '');
                        }

                    } catch (cropError) {
                        console.error("Failed to crop image cluster", cropError);
                        // Fallback replacement for error
                        for (const rect of pc.originalTags) {
                            text = text.replace(rect.fullTag, `\n*[Figure: ${rect.desc}]*\n`);
                        }
                    }
                }

                console.debug(`[OCR] Stats: NMS_Dropped=${nmsRemoved}, Hash_Dupes=${hashDupes}, Final_Crops=${cropsProcessed}`);

                // 9. CLEANUP: Strip ANY remaining crop tags
                // This covers: NMS removed, Bitmap removed, and invalid small crops that failed filter
                text = text.replace(cropRegex, '');
            }

            return text;
        } catch (e: any) {
            // FIX: Rethrow API Key errors so they aren't swallowed as generic "Error processing page"
            if (e.code === 'NO_API_KEY' || e.name === 'NoApiKeyError' || e.name === 'UsageLimitError') {
                throw e;
            }
            
            console.error("Error processing page:", e);
            const errorMessage = e.message || "Unknown error";
            return `\n\n> ⚠️ **Processing Error:** ${errorMessage}\n\n`;
        }
    };

    const startProcessing = useCallback(async (userId: string, topicId: string, files: FileList) => {
        if (!files || files.length === 0) return;

        console.debug("[UPLOAD] startProcessing", { userId, topicId, count: files.length });

        // Initialize Job
        const jobId = topicId;
        setJobs(prev => ({
            ...prev,
            [jobId]: {
                id: jobId,
                status: 'uploading',
                progress: { current: 0, total: 0 },
                startTime: Date.now(),
                message: 'Preparing files...'
            }
        }));

        // Universal: Request Wake Lock to keep screen alive during heavy processing
        await requestWakeLock();

        try {
            let totalSizeBytes = 0;
            for (let i = 0; i < files.length; i++) totalSizeBytes += files[i].size;
            const sizeMb = (totalSizeBytes / (1024 * 1024)).toFixed(2) + " MB";

            const attachments: { base64: string, mimeType: string }[] = [];
            const failedFiles: { name: string, reason: string }[] = [];
            
            const MAX_PDF_PAGES = 10;
            let processedPagesCount = 0;
            let isTruncatedPdf = false;

            // 1. Pre-process files (Robust Loop with individual catch)
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                console.debug(`[UPLOAD] processing file ${i}: ${file.name}`, file.type, file.size);
                
                try {
                    const isImage = file.type.startsWith('image/');
                    const isPdf = file.type === 'application/pdf';

                    if (!isImage && !isPdf) {
                        console.warn(`[UPLOAD] Unsupported file type: ${file.type}`);
                        failedFiles.push({ name: file.name, reason: "Unsupported type" });
                        continue;
                    }

                    if (isImage) {
                        const result = await compressImage(file);
                        attachments.push(result);
                        processedPagesCount++;
                    } else if (isPdf) {
                        // PDF Pipeline
                        const pdf = await getPdfDocument(file);
                        
                        let pagesToProcess = pdf.numPages;
                        if (pagesToProcess > MAX_PDF_PAGES) {
                            pagesToProcess = MAX_PDF_PAGES;
                            isTruncatedPdf = true;
                            console.warn(`[UPLOAD] PDF ${file.name} truncated: ${pdf.numPages} -> ${MAX_PDF_PAGES} pages`);
                        }
                        
                        processedPagesCount += pagesToProcess;
                        
                        for (let j = 1; j <= pagesToProcess; j++) {
                            const base64 = await renderPdfPage(pdf, j);
                            if (base64) {
                                attachments.push({ base64, mimeType: 'image/jpeg' });
                            }
                        }
                    }
                    console.debug(`[UPLOAD] success: ${file.name}`);
                } catch (e: any) {
                    console.error(`[UPLOAD] fail: ${file.name}`, e);
                    failedFiles.push({ name: file.name, reason: e.message || "Parse error" });
                }
            }

            // CRITICAL: Check if we have ANY valid data to proceed
            if (attachments.length === 0) {
                const errorMsg = failedFiles.length > 0 
                    ? `Failed to load: ${failedFiles[0].name} (${failedFiles[0].reason})` 
                    : 'No valid images or PDFs found.';
                
                updateJob(jobId, { status: 'error', message: errorMsg });
                return;
            }

            // Update Job with Stats and Warnings
            let statusMsg = 'AI Agent analyzing content...';
            if (isTruncatedPdf) statusMsg = `Processing (PDF limited to ${MAX_PDF_PAGES} pages)...`;
            if (failedFiles.length > 0) statusMsg = `Processing valid files (${failedFiles.length} failed)...`;

            updateJob(jobId, { 
                status: 'processing', 
                progress: { current: 0, total: attachments.length },
                stats: { pages: processedPagesCount, size: sizeMb }, // pages: current batch count
                message: statusMsg
            });

            // 2. Fetch existing content to append
            const existingBody = await getTopicBodyFromIDB(userId, topicId) || "";
            let newContentAccumulator = "";

            // 3. Process each page/image
            // Determine starting index to append properly (Smart Fetch compliant)
            const startIndex = await getNextSourceIndex(topicId);

            for (let i = 0; i < attachments.length; i++) {
                // Save Source Image for "View Original" feature using appended index
                const sourceKey = `source_${topicId}_${startIndex + i}`;
                await saveImageToIDB(sourceKey, attachments[i].base64).catch(e => console.warn("Failed to save source", e));

                // Update progress
                updateJob(jobId, { 
                    progress: { current: i + 1, total: attachments.length },
                    message: `Processing page ${i + 1} of ${attachments.length}...`
                });

                console.debug(`[UPLOAD] OCR processing chunk ${i + 1}`);
                const pageText = await processAttachment(attachments[i]);
                newContentAccumulator += pageText + "\n\n";
            }

            // Append error log to content if partial failures occurred
            if (failedFiles.length > 0) {
                newContentAccumulator += `\n\n> **Upload Note**: The following files could not be processed: ${failedFiles.map(f => f.name).join(', ')}.\n\n`;
            }
            if (isTruncatedPdf) {
                newContentAccumulator += `\n\n> **Upload Note**: Large PDF detected. Processing was limited to the first ${MAX_PDF_PAGES} pages to ensure performance.\n\n`;
            }

            // 4. Save Final Result
            const finalContent = (existingBody + "\n\n" + newContentAccumulator).trim();
            await saveTopicBodyToIDB(userId, topicId, finalContent);

            // 5. Compute Final Total Image Count (Smart Fetch compliant)
            const totalImages = await getSourceImageCount(topicId);

            // Final Status Message
            let finalMsg = 'Processing complete!';
            if (failedFiles.length > 0) {
                finalMsg = `Saved ${attachments.length} items. ${failedFiles.length} file(s) failed.`;
            } else if (isTruncatedPdf) {
                finalMsg = `Saved. Large PDF truncated to ${MAX_PDF_PAGES} pages.`;
            }

            console.debug("[UPLOAD] summary", { ok: attachments.length, fail: failedFiles.length, truncated: isTruncatedPdf, totalImages });
            
            // Pass totalImages in stats for UI update
            updateJob(jobId, { 
                status: 'success', 
                message: finalMsg,
                stats: { pages: processedPagesCount, size: sizeMb, totalImages } 
            });

        } catch (error: any) {
            console.error("[UPLOAD] Global processing failed:", error);
            updateJob(jobId, { status: 'error', message: error.message || 'Unknown error occurred.' });
        } finally {
            // Universal: Release lock when done or errored
            await releaseWakeLock();
        }
    }, []);

    const clearJob = useCallback((topicId: string) => {
        setJobs(prev => {
            const newJobs = { ...prev };
            delete newJobs[topicId];
            return newJobs;
        });
    }, []);

    return (
        <ProcessingContext.Provider value={{ jobs, startProcessing, clearJob }}>
            {children}
        </ProcessingContext.Provider>
    );
};

export const useProcessing = () => {
    const context = useContext(ProcessingContext);
    if (!context) throw new Error("useProcessing must be used within ProcessingProvider");
    return context;
};
