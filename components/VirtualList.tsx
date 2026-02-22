
import React, { useState, useEffect, useRef } from 'react';

interface VirtualListProps<T> {
    items: T[];
    itemHeight: number;
    renderItem: (item: T, index: number) => React.ReactNode;
    overscan?: number;
    className?: string;
    layoutVersion?: number | string;
    scrollContainerRef?: React.RefObject<HTMLElement>; // New optional prop
}

export function VirtualList<T>({ 
    items, 
    itemHeight, 
    renderItem, 
    overscan = 5, 
    className = '', 
    layoutVersion,
    scrollContainerRef 
}: VirtualListProps<T>) {
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(0);
    const [listOffset, setListOffset] = useState(0);
    const listRef = useRef<HTMLDivElement>(null);

    // Dynamic Overscan: Cap to 3 on mobile to reduce rendering cost
    const isMobile = typeof window !== 'undefined' && (window.innerWidth <= 768 || window.matchMedia('(pointer: coarse)').matches);
    const effectiveOverscan = isMobile ? Math.min(overscan, 3) : overscan;

    useEffect(() => {
        // Prefer passed ref, fallback to main app container, then window/body
        const container = scrollContainerRef?.current || document.getElementById('main-scroll-container') || document.body;
        
        const updateState = () => {
            if (!container) return;
            
            // Handle window/body vs Element scrolling differences
            const isBody = container === document.body;
            const currentScrollTop = isBody ? window.scrollY : container.scrollTop;
            const currentHeight = isBody ? window.innerHeight : container.clientHeight;

            setScrollTop(currentScrollTop);
            setViewportHeight(currentHeight);
            
            if (listRef.current) {
                const listRect = listRef.current.getBoundingClientRect();
                // If container is an element, we need relative offset. 
                // If body, simple rect.top + scrollY works.
                let offset = 0;
                
                if (isBody) {
                    offset = listRect.top + window.scrollY;
                } else {
                    const containerRect = container.getBoundingClientRect();
                    offset = currentScrollTop + (listRect.top - containerRect.top);
                }
                setListOffset(offset);
            }
        };

        let scheduled = false;
        let lastRun = 0;

        const handler = () => {
            const now = performance.now();
            if (now - lastRun < 50) {
                if (!scheduled) {
                    scheduled = true;
                    requestAnimationFrame(() => {
                        scheduled = false;
                        lastRun = performance.now();
                        updateState();
                    });
                }
                return;
            }
            lastRun = now;
            if (!scheduled) {
                scheduled = true;
                requestAnimationFrame(() => {
                    scheduled = false;
                    updateState();
                });
            }
        };

        updateState();

        // Attach listeners
        const target = container === document.body ? window : container;
        target.addEventListener('scroll', handler, { passive: true });
        
        const resizeObserver = new ResizeObserver(handler);
        resizeObserver.observe(container);
        if (listRef.current?.parentElement) {
            resizeObserver.observe(listRef.current.parentElement);
        }

        return () => {
            target.removeEventListener('scroll', handler);
            resizeObserver.disconnect();
        };
    }, [items.length, layoutVersion, scrollContainerRef]); // Add scrollContainerRef dependency

    const totalHeight = items.length * itemHeight;
    const relativeScrollTop = Math.max(0, scrollTop - listOffset);
    const relativeScrollBottom = scrollTop + viewportHeight - listOffset;
    
    let startIndex = Math.floor(relativeScrollTop / itemHeight);
    let endIndex = Math.ceil(relativeScrollBottom / itemHeight);
    
    startIndex = Math.max(0, startIndex - effectiveOverscan);
    endIndex = Math.min(items.length, endIndex + effectiveOverscan);
    
    const visibleItems = [];
    for (let i = startIndex; i < endIndex; i++) {
        visibleItems.push(
            <div 
                key={i} 
                style={{ 
                    position: 'absolute', 
                    top: 0, 
                    left: 0, 
                    width: '100%', 
                    height: `${itemHeight}px`,
                    transform: `translateY(${i * itemHeight}px)` 
                }}
            >
                {renderItem(items[i], i)}
            </div>
        );
    }

    return (
        <div 
            ref={listRef} 
            className={className}
            style={{ position: 'relative', height: `${totalHeight}px` }}
        >
            {visibleItems}
        </div>
    );
}
