
import React, { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';

interface ImageViewerProps {
    src: string;
    alt?: string;
    onClose: () => void;
}

export const ImageViewer: React.FC<ImageViewerProps> = ({ src, alt, onClose }) => {
    const [scale, setScale] = useState(1);
    const [translate, setTranslate] = useState({ x: 0, y: 0 });
    const [isGesturing, setIsGesturing] = useState(false);
    
    // Refs for gesture math to avoid closure staleness during high-frequency events
    const stateRef = useRef({ scale: 1, translate: { x: 0, y: 0 } });
    
    const startDist = useRef<number>(0);
    const startScale = useRef<number>(1);
    const startPan = useRef<{ x: number, y: number }>({ x: 0, y: 0 });
    const startTranslate = useRef<{ x: number, y: number }>({ x: 0, y: 0 });
    const lastTap = useRef<number>(0);

    // Sync ref
    useEffect(() => {
        stateRef.current = { scale, translate };
    }, [scale, translate]);

    // Lock body scroll
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);

    // --- Touch Logic ---

    const handleTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length === 2) {
            // PINCH START
            setIsGesturing(true);
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            startDist.current = dist;
            startScale.current = stateRef.current.scale;
        } else if (e.touches.length === 1) {
            // DOUBLE TAP DETECT
            const now = Date.now();
            if (now - lastTap.current < 300) {
                // Double Tap Triggered
                if (stateRef.current.scale > 1) {
                    resetZoom();
                } else {
                    // Zoom towards center
                    updateTransform(2.5, { x: 0, y: 0 });
                }
                lastTap.current = 0;
            } else {
                // PAN START
                lastTap.current = now;
                setIsGesturing(true);
                startPan.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                startTranslate.current = { ...stateRef.current.translate };
            }
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (e.touches.length === 2) {
            // PINCH MOVE
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            if (startDist.current > 0) {
                const newScale = startScale.current * (dist / startDist.current);
                // Clamp 0.5x to 5x during gesture (will snap back later)
                updateTransform(Math.min(Math.max(0.5, newScale), 5), stateRef.current.translate);
            }
        } else if (e.touches.length === 1 && stateRef.current.scale > 1) {
            // PAN MOVE (Only if zoomed)
            const dx = e.touches[0].clientX - startPan.current.x;
            const dy = e.touches[0].clientY - startPan.current.y;
            
            // Add momentum/elasticity logic here if desired, simple linear for now
            updateTransform(stateRef.current.scale, {
                x: startTranslate.current.x + dx,
                y: startTranslate.current.y + dy
            });
        }
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        setIsGesturing(false);
        // Snap Back Logic
        if (e.touches.length === 0) {
            if (stateRef.current.scale < 1) {
                resetZoom();
            } else if (stateRef.current.scale > 5) {
                updateTransform(5, stateRef.current.translate);
            }
        }
    };

    // --- Mouse Logic (Desktop Support) ---
    
    const handleWheel = (e: React.WheelEvent) => {
        // Pinch-to-zoom on trackpad sends ctrlKey + wheel
        // Regular wheel scrolls
        const delta = -e.deltaY * 0.002;
        const newScale = Math.min(Math.max(1, stateRef.current.scale + delta), 5);
        
        // Reset pan if zooming out to 1
        const newTranslate = newScale <= 1 ? { x: 0, y: 0 } : stateRef.current.translate;
        
        updateTransform(newScale, newTranslate);
    };

    const updateTransform = (s: number, t: {x: number, y: number}) => {
        setScale(s);
        setTranslate(t);
    };

    const resetZoom = () => updateTransform(1, { x: 0, y: 0 });

    return (
        <div 
            className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center touch-none overflow-hidden animate-in fade-in duration-200"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onWheel={handleWheel}
            onClick={onClose} // Tap background to close
        >
            <button 
                onClick={onClose}
                className="absolute top-6 right-6 p-3 bg-white/10 text-white rounded-full z-50 backdrop-blur-md hover:bg-white/20 transition shadow-lg"
            >
                <X size={24} />
            </button>

            <img 
                src={src} 
                alt={alt}
                className={`max-w-full max-h-full object-contain origin-center will-change-transform ${isGesturing ? '' : 'transition-transform duration-200 ease-out'}`}
                style={{
                    transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`
                }}
                onClick={(e) => e.stopPropagation()} 
                draggable={false}
            />
            
            {/* Visual Hint */}
            <div className="absolute bottom-10 left-0 right-0 text-center pointer-events-none animate-in slide-in-from-bottom-4 duration-500 delay-200">
                <span className="text-white/50 text-[10px] uppercase tracking-widest font-bold bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm border border-white/5">
                    {scale <= 1 ? "Double tap to zoom" : "Pinch to adjust"}
                </span>
            </div>
        </div>
    );
};
