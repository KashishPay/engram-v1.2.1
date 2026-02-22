
import React, { useState, useEffect } from 'react';
import { Shield, XCircle, MessageSquarePlus, X, Loader, Download, Maximize2 } from 'lucide-react';
import { getImageFromIDB } from '../services/storage';
import { jsPDF } from 'jspdf';
import { ImageViewer } from './ImageViewer';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { triggerHaptic } from '../utils/haptics';
import { showLocalNotification, requestNotificationPermission } from '../utils/notifications';

interface PermissionModalProps {
    onAllow: () => void;
}

export const PermissionModal: React.FC<PermissionModalProps> = ({ onAllow }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 max-w-sm w-full shadow-2xl text-center">
            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600 dark:text-blue-400">
                <Shield size={32} />
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Enable Permissions</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
                To provide the best experience, Engram needs permission to access your device storage for saving notes and camera for profile photos.
            </p>
            <button 
                onClick={() => { triggerHaptic.impact('Medium'); onAllow(); }}
                className="w-full py-3.5 bg-blue-600 text-white rounded-2xl font-bold shadow-lg hover:bg-blue-700 transition transform active:scale-95 mb-3"
            >
                Allow Access
            </button>
            <p className="text-[10px] text-gray-400">
                We respect your privacy. Data stays on your device.
            </p>
        </div>
    </div>
);

interface FeedbackModalProps {
    isOpen: boolean;
    onClose: () => void;
    themeColor: string;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose, themeColor }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 max-w-sm w-full shadow-2xl relative">
                <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-gray-100 dark:bg-gray-800 rounded-full text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition">
                    <XCircle size={20} />
                </button>
                <div className="text-center mb-6">
                    <div className={`w-14 h-14 bg-${themeColor}-100 dark:bg-${themeColor}-900/30 rounded-full flex items-center justify-center mx-auto mb-3 text-${themeColor}-600 dark:text-${themeColor}-400`}>
                        <MessageSquarePlus size={28} />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">Send Feedback</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Help us improve Engram.</p>
                </div>
                
                <textarea 
                    className="w-full h-32 p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 mb-4"
                    placeholder="Describe your issue or suggestion..."
                ></textarea>

                <div className="flex space-x-3">
                    <button onClick={onClose} className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl font-bold text-sm">Cancel</button>
                    <button onClick={() => { triggerHaptic.notification('Success'); alert("Feedback sent! Thank you."); onClose(); }} className={`flex-1 py-3 bg-${themeColor}-600 text-white rounded-xl font-bold text-sm shadow-md`}>Send</button>
                </div>
            </div>
        </div>
    );
};

interface SourceViewerModalProps {
    topicId: string;
    topicName: string;
    subjectName: string;
    pageCount: number;
    onClose: () => void;
}

export const SourceViewerModal: React.FC<SourceViewerModalProps> = ({ topicId, topicName, subjectName, pageCount, onClose }) => {
    const [images, setImages] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [generatingPdf, setGeneratingPdf] = useState(false);
    const [activeViewerImage, setActiveViewerImage] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        const fetchImages = async () => {
            const loaded = [];
            // Assuming contiguous indices 0..N-1 based on appended logic
            for (let i = 0; i < pageCount; i++) {
                const base64 = await getImageFromIDB(`source_${topicId}_${i}`);
                if (base64) loaded.push(`data:image/jpeg;base64,${base64}`);
            }
            if (active) {
                setImages(loaded);
                setLoading(false);
            }
        };
        fetchImages();
        return () => { active = false; };
    }, [topicId, pageCount]);

    const handleDownloadPdf = async () => {
        triggerHaptic.impact('Light');
        setGeneratingPdf(true);
        
        // Ensure permissions are granted before starting
        await requestNotificationPermission();
        
        // Use a fixed timestamp ID for this operation to allow updating
        const notifId = Math.floor(Date.now() / 1000);

        try {
            const safeSubject = subjectName.replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || 'Uncategorized';
            const safeTopic = topicName.replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || 'Untitled';
            const folderPath = `Engram/${safeSubject}/${safeTopic}`;
            const filename = `${safeTopic}.pdf`;

            // 1. Show "Ongoing" Notification
            await showLocalNotification("Generating PDF...", {
                body: `Creating ${filename}...`,
                tag: 'download',
                id: notifId,
                ongoing: true // Sticky
            });

            const doc = new jsPDF();
            
            for (let i = 0; i < pageCount; i++) {
                if (i > 0) doc.addPage();
                
                const base64 = await getImageFromIDB(`source_${topicId}_${i}`);
                
                if (base64) {
                    const imgData = `data:image/jpeg;base64,${base64}`;
                    const imgProps = doc.getImageProperties(imgData);
                    
                    const pdfWidth = doc.internal.pageSize.getWidth();
                    const pdfHeight = doc.internal.pageSize.getHeight();
                    
                    const imgRatio = imgProps.width / imgProps.height;
                    const pdfRatio = pdfWidth / pdfHeight;
                    
                    let w, h;
                    
                    if (imgRatio > pdfRatio) {
                        w = pdfWidth;
                        h = w / imgRatio;
                    } else {
                        h = pdfHeight;
                        w = h * imgRatio;
                    }
                    
                    const x = (pdfWidth - w) / 2;
                    const y = (pdfHeight - h) / 2;
                    
                    doc.addImage(imgData, 'JPEG', x, y, w, h);
                }
            }
            
            if (Capacitor.isNativePlatform()) {
                // Native: Save to Documents/Engram/{Subject}/{Topic}/{Topic}.pdf
                const fullPath = `${folderPath}/${filename}`;

                // Create Directory Structure
                try {
                    await Filesystem.mkdir({
                        path: folderPath,
                        directory: Directory.Documents,
                        recursive: true,
                    });
                } catch (e) {
                    // Directory might exist, proceed
                }

                // Write File
                const pdfBase64 = doc.output('datauristring').split(',')[1];
                
                await Filesystem.writeFile({
                    path: fullPath,
                    data: pdfBase64,
                    directory: Directory.Documents,
                });

                triggerHaptic.notification('Success');
                
                // 2. Update Notification to Success (Removes ongoing)
                await showLocalNotification("PDF Downloaded", {
                    body: `${filename} saved to Documents/${folderPath}`,
                    tag: 'download',
                    id: notifId,
                    ongoing: false
                });
            } else {
                // Web: Classic Download
                doc.save(filename);
                triggerHaptic.notification('Success');
            }
            
        } catch (e) {
            console.error("PDF Generation failed", e);
            triggerHaptic.notification('Error');
            
            // 3. Update Notification to Error (Removes ongoing)
            await showLocalNotification("Download Failed", {
                body: "Failed to generate PDF.",
                tag: 'download',
                id: notifId,
                ongoing: false
            });
            
            alert("Failed to save PDF. Please check storage permissions.");
        } finally {
            setGeneratingPdf(false);
        }
    };

    return (
        <>
            {activeViewerImage && (
                <ImageViewer 
                    src={activeViewerImage} 
                    onClose={() => setActiveViewerImage(null)} 
                />
            )}
            
            <div className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-xl animate-in fade-in duration-200" onClick={onClose}>
                <div className="flex justify-between items-center p-4 shrink-0 bg-black/50 z-10" onClick={(e) => e.stopPropagation()}>
                    <span className="text-white/80 text-sm font-bold">View Original ({pageCount})</span>
                    
                    <div className="flex items-center gap-3">
                        {pageCount > 0 && !loading && (
                            <button
                                onClick={handleDownloadPdf}
                                disabled={generatingPdf}
                                className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition flex items-center justify-center disabled:opacity-50"
                                title="Save to Documents"
                            >
                                {generatingPdf ? <Loader size={20} className="animate-spin" /> : <Download size={20} />}
                            </button>
                        )}
                        <button 
                            onClick={onClose} 
                            className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition"
                        >
                            <X size={24} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4" onClick={(e) => e.stopPropagation()}>
                    {loading ? (
                        <div className="flex items-center justify-center h-full text-white/50">
                            <Loader size={32} className="animate-spin mr-2"/> Loading originals...
                        </div>
                    ) : images.length > 0 ? (
                        images.map((src, i) => (
                            <div 
                                key={i} 
                                className="relative group cursor-zoom-in"
                                onClick={() => { triggerHaptic.selection(); setActiveViewerImage(src); }}
                            >
                                <img 
                                    src={src} 
                                    alt={`Page ${i + 1}`} 
                                    className="w-full h-auto rounded-lg shadow-2xl border border-white/10"
                                />
                                <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] font-bold px-2 py-1 rounded">
                                    Page {i + 1}
                                </div>
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 rounded-lg">
                                    <div className="bg-black/50 p-3 rounded-full text-white backdrop-blur-sm">
                                        <Maximize2 size={24} />
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="flex items-center justify-center h-full text-white/50 text-sm">
                            No original images found.
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};
