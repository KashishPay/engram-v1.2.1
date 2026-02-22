import React, { useState, useRef, useEffect } from 'react';
import { RefreshCw, Settings, AlertTriangle, ChevronDown, ChevronRight, Copy, Database, ArrowLeft, ImageOff } from 'lucide-react';
import { pickEventImageIndex, getImageByIndex, getFallbackImage } from '../utils/errorImages';

interface ErrorCardProps {
  error: Error | null;
  resetErrorBoundary: () => void;
}

export const ErrorCard: React.FC<ErrorCardProps> = ({ error, resetErrorBoundary }) => {
  const errorString = error?.toString() || 'Unknown Error';
  const isVersionError = error?.name === 'VersionError' || error?.message?.includes('less than');
  
  // Guard Rail State: 'initial' -> 'fallback' -> 'failed' (SVG mode)
  const [imageState, setImageState] = useState<'initial' | 'fallback' | 'failed'>('initial');
  // Hold the initial random index so it doesn't change on re-renders
  const [initialIndex] = useState(() => pickEventImageIndex());

  const [showDetails, setShowDetails] = useState(false);
  const detailsRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to details when opened to ensure visibility
  useEffect(() => {
    if (showDetails && detailsRef.current) {
      setTimeout(() => {
        detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [showDetails]);

  const handleGoToSettings = () => {
    window.location.hash = '#/settings';
    resetErrorBoundary();
  };

  const handleBack = () => {
    window.history.back();
    // Fallback if history.back() doesn't trigger a route change (e.g. single entry history)
    setTimeout(resetErrorBoundary, 100);
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const src = e.currentTarget.src;
    console.warn(`[ErrorCard] Image failed to load: ${src}`);
    
    if (imageState === 'initial') {
        console.warn("[ErrorCard] Switching to fallback.png");
        setImageState('fallback');
    } else if (imageState === 'fallback') {
        console.warn("[ErrorCard] Fallback failed. Switching to SVG safe mode.");
        setImageState('failed');
    }
  };

  const copyError = () => {
    if (error) {
        const text = error.toString() + "\n" + (error.stack || '');
        navigator.clipboard.writeText(text);
        alert("Error copied to clipboard");
    }
  };

  const handleResetDB = async () => {
    if (confirm("This will clear your local database cache to fix the version mismatch. Your Cloud data (if synced) will remain safe. Continue?")) {
        if (window.indexedDB) {
            try {
                await window.indexedDB.deleteDatabase('EngramDB');
                window.location.reload();
            } catch (e) {
                alert("Failed to reset automatically. Please clear browser site data manually.");
            }
        }
    }
  };

  // Determine current source based on state
  // We append a timestamp query param to bypass potential stale 404 cache in browser
  const currentSrc = imageState === 'initial' 
    ? `${getImageByIndex(initialIndex)}?t=1` 
    : `${getFallbackImage()}?t=1`;

  return (
    <div 
      className="min-h-screen w-full flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 p-4 overflow-y-auto safe-area-padding"
      role="alert"
    >
      <div className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-3xl shadow-xl overflow-hidden border border-gray-100 dark:border-gray-700 my-auto animate-in zoom-in-95 duration-300">
        
        {/* 1. Image Section with Guard Rails */}
        <div className="bg-amber-50 dark:bg-amber-900/20 p-8 flex items-center justify-center min-h-[200px] relative">
          <button 
            onClick={handleBack}
            className="absolute top-4 left-4 p-2 bg-white/50 dark:bg-black/20 hover:bg-white dark:hover:bg-black/40 rounded-full transition text-gray-600 dark:text-gray-300 z-10"
            title="Go Back"
          >
            <ArrowLeft size={20} />
          </button>
          
          {imageState === 'failed' ? (
             // Layer 3: Code-based SVG Fallback (Cannot break)
             <div className="flex flex-col items-center justify-center text-amber-300 dark:text-amber-700 opacity-80">
                <ImageOff size={64} strokeWidth={1.5} />
                <span className="text-xs font-bold mt-2 uppercase tracking-wider opacity-60">Image Missing</span>
             </div>
          ) : (
             // Layer 1 & 2: File-based Images
             <img 
                key={imageState} // Force re-mount on state change
                src={currentSrc} 
                onError={handleImageError}
                alt="Error illustration" 
                className="w-40 h-40 object-contain drop-shadow-md transition-opacity duration-300 animate-in fade-in"
                loading="eager"
             />
          )}
        </div>

        {/* 2. Content Section */}
        <div className="p-6 text-center">
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-white mb-3">
            Ouch! Something broke.
          </h2>
          
          <div className="bg-red-50 dark:bg-red-900/10 p-3 rounded-xl border border-red-100 dark:border-red-900/30 mb-6">
            <p className="text-[10px] font-bold text-red-600 dark:text-red-400 mb-1 flex items-center justify-center gap-1 uppercase tracking-wider">
              <AlertTriangle size={10}/> {isVersionError ? "Version Mismatch" : "Action Required"}
            </p>
            <p className="text-sm text-gray-700 dark:text-gray-300 font-medium leading-relaxed select-text">
              {isVersionError 
                ? "The app version is older than your saved data. Please reset the database to continue."
                : "Please copy the technical details from below and send it to us through Support in Settings."
              }
            </p>
          </div>

          {/* 3. Action Buttons */}
          <div className="space-y-3">
            {isVersionError ? (
                <button
                  onClick={handleResetDB}
                  className="w-full py-3.5 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-bold shadow-md transition flex items-center justify-center active:scale-95"
                >
                  <Database size={18} className="mr-2" />
                  Reset Database & Reload
                </button>
            ) : (
                <button
                  onClick={resetErrorBoundary}
                  className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-bold shadow-md transition flex items-center justify-center active:scale-95"
                >
                  <RefreshCw size={18} className="mr-2" />
                  Try Again
                </button>
            )}
            
            <button
              onClick={handleGoToSettings}
              className="w-full py-3.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-2xl font-bold transition flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-600 active:scale-95"
            >
              <Settings size={18} className="mr-2" />
              Go to Support
            </button>
          </div>

          {/* 4. Technical Details (Collapsible) */}
          <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-700" ref={detailsRef}>
            <button 
                onClick={() => setShowDetails(!showDetails)}
                className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center justify-center w-full transition py-2"
            >
                {showDetails ? <ChevronDown size={12} className="mr-1"/> : <ChevronRight size={12} className="mr-1"/>}
                Technical Details
            </button>
            
            {showDetails && (
                <div className="mt-2 relative group animate-in slide-in-from-top-2 fade-in duration-200">
                    <div className="p-3 bg-gray-100 dark:bg-gray-900 rounded-lg text-[10px] font-mono text-gray-500 break-all text-left max-h-32 overflow-y-auto border border-gray-200 dark:border-gray-700 select-text custom-scrollbar">
                        {errorString}
                        {error?.stack && <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 opacity-75">{error.stack.slice(0, 300)}...</div>}
                    </div>
                    <button 
                        onClick={copyError}
                        className="absolute top-2 right-2 p-1 bg-white dark:bg-gray-800 rounded shadow-sm text-gray-400 hover:text-blue-500 transition"
                        title="Copy to clipboard"
                    >
                        <Copy size={12} />
                    </button>
                </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
