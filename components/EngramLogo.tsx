import React, { useState, useEffect } from 'react';

interface EngramLogoProps {
    size?: number;
    alt?: string;
    className?: string;
}

export const EngramLogo: React.FC<EngramLogoProps> = ({ 
    size = 96, 
    alt = "Engram logo", 
    className = "" 
}) => {
    // Available asset sizes in brand/engram_logo/
    const availableSizes = [16, 32, 48, 64, 96, 128, 180, 192, 256, 512, 1024];
    
    // Find the closest available size to the requested size to ensure crisp rendering
    const targetSize = availableSizes.reduce((prev, curr) => {
        return (Math.abs(curr - size) < Math.abs(prev - size) ? curr : prev);
    });

    const [hasError, setHasError] = useState(false);

    // Reset state if size changes (dynamic resizing)
    useEffect(() => {
        setHasError(false);
    }, [targetSize]);

    // 1. Detect AI Studio Preview environment
    // These domains indicate we are running inside the Google AI Studio sandbox
    const isAIStudioPreview =
        window.location.hostname.includes("aistudio.google.com") ||
        window.location.hostname.includes("ai.studio") ||
        window.location.origin.includes("usercontent.goog") ||
        window.location.protocol === "blob:";

    // 2. Define Base URLs
    // In production (Vercel) or Localhost, assets are served at root relative to index.html.
    // In AI Studio Preview, we must fetch from the live production CDN.
    const PREVIEW_ASSET_BASE = "https://engram-space.vercel.app";
    const assetBase = isAIStudioPreview ? PREVIEW_ASSET_BASE : "";

    // 3. Build canonical path
    // The files live under public/brand/engram_logo/, so the runtime path is /brand/...
    const path = `/brand/engram_logo/engram_logo_${targetSize}.png`;
    
    // 4. Construct Source
    // If in preview, prepend the prod domain. If prod/local, use the path as-is.
    const src = assetBase ? `${assetBase}${path}` : path;

    if (hasError) {
        return (
            <div 
                className={`flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-300 rounded-xl font-bold text-[10px] uppercase border border-dashed border-gray-300 ${className}`}
                style={{ width: size, height: size }}
                title="Logo Missing"
            >
                Engram
            </div>
        );
    }

    return (
        <img 
            key={`${targetSize}`} 
            src={src} 
            width={size} 
            height={size} 
            alt={alt} 
            onError={() => setHasError(true)}
            // "block" prevents the image from sitting on the text baseline (fixes "low logo" issue)
            // "object-contain" ensures aspect ratio is preserved
            className={`block object-contain select-none pointer-events-none ${className}`}
            style={{ width: size, height: size }}
        />
    );
};