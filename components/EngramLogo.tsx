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

    // 1. Build canonical path
    // The files live under public/brand/engram_logo/, so the runtime path is /brand/...
    // Use import.meta.env.BASE_URL to support subpath deployments (e.g. GitHub Pages) or relative base.
    const basePath = import.meta.env.BASE_URL.endsWith('/') 
        ? import.meta.env.BASE_URL.slice(0, -1) 
        : import.meta.env.BASE_URL;
    const src = `${basePath}/brand/engram_logo/engram_logo_${targetSize}.png`;

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