import React, { useState, useEffect, useRef } from 'react';

export const CalculatorView: React.FC<{
    themeColor?: string;
    themeIntensity?: string;
}> = ({ themeColor = 'amber', themeIntensity = '100' }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [dims, setDims] = useState({ w: '100%', h: '100%', isPortrait: false });

    useEffect(() => {
        const updateDims = () => {
            if (containerRef.current) {
                const { clientWidth, clientHeight } = containerRef.current;
                const isTablet = /ipad|playbook|silk|kindle|tablet|android(?!.*mobile)/i.test(navigator.userAgent) || 
                                 (navigator.maxTouchPoints > 1 && window.innerWidth >= 500);
                const isPortrait = window.innerHeight > window.innerWidth && window.innerWidth < 500 && !isTablet;
                setDims({
                    w: isPortrait ? `${clientHeight}px` : '100%',
                    h: isPortrait ? `${clientWidth}px` : '100%',
                    isPortrait
                });
            }
        };
        // Small delay to ensure layout is done
        setTimeout(updateDims, 50);
        window.addEventListener('resize', updateDims);
        return () => window.removeEventListener('resize', updateDims);
    }, []);

    return (
        <div className={`flex h-[100dvh] bg-${themeColor}-${themeIntensity} dark:bg-gray-950 overflow-hidden w-full font-sans pb-[70px] lg:pb-0`}>
            <div className="w-full h-full flex flex-col relative" ref={containerRef}>
                <div className="flex-1 w-full h-full flex items-center justify-center">
                    <div 
                        style={{
                            width: dims.w,
                            height: dims.h,
                            transform: dims.isPortrait ? 'rotate(90deg)' : 'none',
                            transformOrigin: 'center center',
                            position: dims.isPortrait ? 'absolute' : 'relative',
                        }}
                    >
                        <iframe
                            src="/calculator/Calculator.html"
                            title="Scientific Calculator"
                            className="w-full h-full border-none bg-white"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
