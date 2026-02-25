
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, PenTool, Star, Save, Calendar as CalendarIcon, X, Plus, Camera, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Card } from '../components/Card';
import { DailyObservation } from '../types';
import { ObservationsService } from '../services/observations';
import { saveImageToIDB, getImageFromIDB } from '../services/storage';
import { compressImage } from '../utils/media';
import { ErrorCard } from '../components/ErrorCard';
import { ImageViewer } from '../components/ImageViewer';

interface ObservationsViewProps {
    userId: string;
    themeColor: string;
    navigateTo: (view: string) => void;
}

// Helper component to render a single thumbnail from IDB
const ImageThumbnail: React.FC<{ 
    imageId: string, 
    onDelete?: () => void, 
    onClick: (src: string) => void 
}> = ({ imageId, onDelete, onClick }) => {
    const [src, setSrc] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        getImageFromIDB(imageId).then(base64 => {
            if (active && base64) setSrc(`data:image/jpeg;base64,${base64}`);
        });
        return () => { active = false; };
    }, [imageId]);

    if (!src) return <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />;

    return (
        <div className="relative group w-16 h-16 flex-shrink-0">
            <img 
                src={src} 
                className="w-full h-full object-cover rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer"
                onClick={() => onClick(src)}
            />
            {onDelete && (
                <button 
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 shadow-sm transform scale-0 group-hover:scale-100 transition-transform"
                >
                    <X size={12} />
                </button>
            )}
        </div>
    );
};

export const ObservationsView: React.FC<ObservationsViewProps> = ({ userId, themeColor }) => {
    const today = new Date();
    const todayISO = today.toISOString().split('T')[0];

    const [currentMonth, setCurrentMonth] = useState(today);
    const [selectedDate, setSelectedDate] = useState(todayISO);
    const [observations, setObservations] = useState<DailyObservation[]>([]);
    const [isEditing, setIsEditing] = useState(false);
    const [obsError, setObsError] = useState<Error | null>(null);
    
    // Image Handling
    const [uploading, setUploading] = useState(false);
    const [activeViewerImage, setActiveViewerImage] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);
    
    // Editor State
    const [draft, setDraft] = useState<DailyObservation>({
        id: '',
        dateISO: todayISO,
        lack: [],
        learn: [],
        remember: [],
        notes: '',
        images: [],
        mood: 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
    });

    useEffect(() => {
        setObservations(ObservationsService.getAll(userId));
    }, [userId, isEditing]);

    const activeObservation = useMemo(() => 
        observations.find(obs => obs.dateISO === selectedDate), 
    [observations, selectedDate]);

    const daysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const firstDayOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();

    const changeMonth = (offset: number) => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1));
    };

    const handleDateClick = (day: number) => {
        const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
        // Standardize to local YYYY-MM-DD
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const iso = `${y}-${m}-${d}`;
        
        setSelectedDate(iso);
        setIsEditing(false);
    };

    const startEditing = () => {
        if (activeObservation) {
            setDraft({ ...activeObservation, images: activeObservation.images || [] });
        } else {
            setDraft({
                id: `${selectedDate}-${Date.now()}`,
                dateISO: selectedDate,
                lack: [''],
                learn: [''],
                remember: [''],
                notes: '',
                images: [],
                mood: 0,
                createdAt: Date.now(),
                updatedAt: Date.now()
            });
        }
        setIsEditing(true);
    };

    const saveDraft = () => {
        try {
            // Clean empty bullets
            const cleanDraft = {
                ...draft,
                lack: draft.lack.filter(s => s.trim()),
                learn: draft.learn.filter(s => s.trim()),
                remember: draft.remember.filter(s => s.trim()),
            };
            ObservationsService.save(userId, cleanDraft);
            setIsEditing(false);
        } catch (e) {
            console.error("Failed to save observation", e);
            setObsError(e instanceof Error ? e : new Error(String(e)));
        }
    };

    const updateBullet = (field: 'lack' | 'learn' | 'remember', index: number, val: string) => {
        const list = [...draft[field]];
        list[index] = val;
        setDraft({ ...draft, [field]: list });
    };

    const addBullet = (field: 'lack' | 'learn' | 'remember') => {
        setDraft({ ...draft, [field]: [...draft[field], ''] });
    };

    const removeBullet = (field: 'lack' | 'learn' | 'remember', index: number) => {
        const list = [...draft[field]];
        list.splice(index, 1);
        setDraft({ ...draft, [field]: list });
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setUploading(true);
        try {
            const file = files[0];
            const { base64 } = await compressImage(file);
            const imageId = `obs_img_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            
            await saveImageToIDB(imageId, base64);
            
            setDraft(prev => ({
                ...prev,
                images: [...(prev.images || []), imageId]
            }));
        } catch (err) {
            console.error("Image upload failed", err);
            alert("Failed to upload image.");
        } finally {
            setUploading(false);
            if (e.target) e.target.value = ''; // Reset input
        }
    };

    const removeImage = (index: number) => {
        const newImages = [...(draft.images || [])];
        newImages.splice(index, 1);
        setDraft({ ...draft, images: newImages });
        // Note: We don't delete from IDB immediately to allow "Cancel" to work non-destructively.
        // Unused images can be cleaned up by a periodic job or when saving if implementing robust GC.
    };

    const renderCalendar = () => {
        const days = [];
        const totalDays = daysInMonth(currentMonth);
        const startOffset = firstDayOfMonth(currentMonth);
        
        // Headers
        const weekDays = ['S','M','T','W','T','F','S'];

        // Blanks
        for (let i = 0; i < startOffset; i++) {
            days.push(<div key={`empty-${i}`} />);
        }

        // Days
        for (let i = 1; i <= totalDays; i++) {
            const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i);
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            const iso = `${y}-${m}-${d}`;
            
            const hasEntry = observations.some(o => o.dateISO === iso);
            const isSelected = selectedDate === iso;
            const isToday = iso === todayISO;

            days.push(
                <button
                    key={iso}
                    onClick={() => handleDateClick(i)}
                    className={`h-9 w-9 md:h-10 md:w-10 rounded-full flex items-center justify-center text-sm font-medium transition-all relative
                        ${isSelected 
                            ? `bg-${themeColor}-600 text-white shadow-md transform scale-105` 
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                        }
                        ${isToday && !isSelected ? `border border-${themeColor}-400 text-${themeColor}-600 font-bold` : ''}
                    `}
                >
                    {i}
                    {hasEntry && !isSelected && (
                        <div className={`absolute bottom-1 w-1 h-1 rounded-full bg-${themeColor}-500`}></div>
                    )}
                </button>
            );
        }

        return (
            <div className="mb-6">
                <div className="flex justify-between items-center mb-4">
                    <button onClick={() => changeMonth(-1)} className="p-1 text-gray-400 hover:text-gray-600"><ChevronLeft/></button>
                    <span className="font-bold text-lg text-gray-800 dark:text-white">
                        {currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                    </span>
                    <button onClick={() => changeMonth(1)} className="p-1 text-gray-400 hover:text-gray-600"><ChevronRight/></button>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center mb-2">
                    {weekDays.map(d => <span key={d} className="text-xs font-bold text-gray-400">{d}</span>)}
                </div>
                <div className="grid grid-cols-7 gap-1 justify-items-center">
                    {days}
                </div>
            </div>
        );
    };

    if (obsError) {
        return (
            <ErrorCard 
                error={obsError} 
                resetErrorBoundary={() => setObsError(null)} 
            />
        );
    }

    return (
        <div className="px-1.5 space-y-4 pb-20">
            {activeViewerImage && <ImageViewer src={activeViewerImage} onClose={() => setActiveViewerImage(null)} />}
            
            <h1 className={`px-2.5 text-3xl font-bold text-${themeColor}-800 dark:text-${themeColor}-200 flex items-center`}>
                <PenTool className="mr-2" /> Observations
            </h1>

            <div className="px-1.5">
                <div className="px-4">
                <Card className="p-4 bg-white dark:bg-gray-800">
                {renderCalendar()}
                
                <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-gray-700 dark:text-gray-200">
                            {new Date(selectedDate).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                        </h3>
                        {!isEditing && (
                            <button 
                                onClick={startEditing}
                                className={`px-4 py-2 bg-${themeColor}-100 dark:bg-${themeColor}-900/30 text-${themeColor}-700 dark:text-${themeColor}-300 rounded-xl text-xs font-bold hover:opacity-80 transition`}
                            >
                                {activeObservation ? 'Edit Entry' : 'Log Entry'}
                            </button>
                        )}
                    </div>

                    {!isEditing ? (
                        activeObservation ? (
                            <div className="space-y-4 animate-in fade-in">
                                {activeObservation.mood > 0 && (
                                    <div className="flex gap-1 mb-2">
                                        {[1,2,3,4,5].map(v => (
                                            <Star key={v} size={16} className={v <= activeObservation.mood! ? "fill-orange-400 text-orange-400" : "text-gray-200 dark:text-gray-700"} />
                                        ))}
                                    </div>
                                )}
                                
                                {activeObservation.lack.length > 0 && (
                                    <div className="bg-red-50 dark:bg-red-900/10 p-3 rounded-xl border border-red-100 dark:border-red-900/30">
                                        <p className="text-xs font-bold text-red-500 uppercase tracking-wider mb-2">Lacking</p>
                                        <ul className="list-disc list-inside text-sm text-gray-700 dark:text-gray-300 space-y-1">
                                            {activeObservation.lack.map((item, i) => <li key={i}>{item}</li>)}
                                        </ul>
                                    </div>
                                )}
                                
                                {activeObservation.learn.length > 0 && (
                                    <div className="bg-blue-50 dark:bg-blue-900/10 p-3 rounded-xl border border-blue-100 dark:border-blue-900/30">
                                        <p className="text-xs font-bold text-blue-500 uppercase tracking-wider mb-2">To Learn</p>
                                        <ul className="list-disc list-inside text-sm text-gray-700 dark:text-gray-300 space-y-1">
                                            {activeObservation.learn.map((item, i) => <li key={i}>{item}</li>)}
                                        </ul>
                                    </div>
                                )}

                                {activeObservation.remember.length > 0 && (
                                    <div className="bg-green-50 dark:bg-green-900/10 p-3 rounded-xl border border-green-100 dark:border-green-900/30">
                                        <p className="text-xs font-bold text-green-500 uppercase tracking-wider mb-2">To Remember</p>
                                        <ul className="list-disc list-inside text-sm text-gray-700 dark:text-gray-300 space-y-1">
                                            {activeObservation.remember.map((item, i) => <li key={i}>{item}</li>)}
                                        </ul>
                                    </div>
                                )}

                                {activeObservation.notes && (
                                    <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
                                        <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{activeObservation.notes}</p>
                                    </div>
                                )}

                                {activeObservation.images && activeObservation.images.length > 0 && (
                                    <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar mt-2">
                                        {activeObservation.images.map((imgId, i) => (
                                            <ImageThumbnail 
                                                key={i} 
                                                imageId={imgId} 
                                                onClick={setActiveViewerImage}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-center py-8 text-gray-400">
                                <CalendarIcon size={32} className="mx-auto mb-2 opacity-50"/>
                                <p className="text-sm">No observations recorded for this day.</p>
                            </div>
                        )
                    ) : (
                        <div className="space-y-4 animate-in slide-in-from-bottom-2">
                            {/* Mood Selector */}
                            <div className="flex justify-center gap-2 py-2">
                                {[1,2,3,4,5].map(v => (
                                    <button key={v} onClick={() => setDraft({...draft, mood: v})} className="focus:outline-none transform active:scale-90 transition">
                                        <Star size={24} className={v <= (draft.mood || 0) ? "fill-orange-400 text-orange-400" : "text-gray-300 dark:text-gray-600"} />
                                    </button>
                                ))}
                            </div>

                            {/* Section: Lack */}
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-red-500 uppercase tracking-wider block">What I Lack</label>
                                {draft.lack.map((val, i) => (
                                    <div key={i} className="flex gap-2">
                                        <input 
                                            value={val} 
                                            onChange={(e) => updateBullet('lack', i, e.target.value)}
                                            className="flex-1 p-2 text-sm bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-lg focus:ring-1 focus:ring-red-400 outline-none dark:text-white"
                                            placeholder="e.g. Focus during lectures..."
                                        />
                                        <button onClick={() => removeBullet('lack', i)} className="text-red-300 hover:text-red-500"><X size={16}/></button>
                                    </div>
                                ))}
                                <button onClick={() => addBullet('lack')} className="text-xs font-bold text-red-400 flex items-center hover:text-red-600"><Plus size={12} className="mr-1"/> Add Item</button>
                            </div>

                            {/* Section: Learn */}
                            <div className="space-y-2 pt-2">
                                <label className="text-xs font-bold text-blue-500 uppercase tracking-wider block">What I Need to Learn</label>
                                {draft.learn.map((val, i) => (
                                    <div key={i} className="flex gap-2">
                                        <input 
                                            value={val} 
                                            onChange={(e) => updateBullet('learn', i, e.target.value)}
                                            className="flex-1 p-2 text-sm bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-lg focus:ring-1 focus:ring-blue-400 outline-none dark:text-white"
                                            placeholder="e.g. Fourier Transform basics..."
                                        />
                                        <button onClick={() => removeBullet('learn', i)} className="text-blue-300 hover:text-blue-500"><X size={16}/></button>
                                    </div>
                                ))}
                                <button onClick={() => addBullet('learn')} className="text-xs font-bold text-blue-400 flex items-center hover:text-blue-600"><Plus size={12} className="mr-1"/> Add Item</button>
                            </div>

                            {/* Section: Remember */}
                            <div className="space-y-2 pt-2">
                                <label className="text-xs font-bold text-green-500 uppercase tracking-wider block">What I Need to Remember</label>
                                {draft.remember.map((val, i) => (
                                    <div key={i} className="flex gap-2">
                                        <input 
                                            value={val} 
                                            onChange={(e) => updateBullet('remember', i, e.target.value)}
                                            className="flex-1 p-2 text-sm bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/30 rounded-lg focus:ring-1 focus:ring-green-400 outline-none dark:text-white"
                                            placeholder="e.g. Exam is on the 15th..."
                                        />
                                        <button onClick={() => removeBullet('remember', i)} className="text-green-300 hover:text-green-500"><X size={16}/></button>
                                    </div>
                                ))}
                                <button onClick={() => addBullet('remember')} className="text-xs font-bold text-green-400 flex items-center hover:text-green-600"><Plus size={12} className="mr-1"/> Add Item</button>
                            </div>

                            {/* Notes */}
                            <div className="pt-2">
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Additional Notes</label>
                                <textarea 
                                    value={draft.notes}
                                    onChange={(e) => setDraft({...draft, notes: e.target.value})}
                                    className="w-full p-3 bg-gray-50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-gray-400 outline-none dark:text-white resize-none"
                                    rows={3}
                                    placeholder="Any other thoughts for the day..."
                                />
                            </div>

                            {/* Image Attachment Section */}
                            <div className="pt-2">
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">Attachments</label>
                                
                                <input 
                                    type="file" 
                                    accept="image/*" 
                                    ref={fileInputRef} 
                                    onChange={handleImageUpload} 
                                    className="hidden" 
                                />
                                <input 
                                    type="file" 
                                    accept="image/*" 
                                    capture="environment"
                                    ref={cameraInputRef} 
                                    onChange={handleImageUpload} 
                                    className="hidden" 
                                />

                                <div className="flex items-center gap-3 overflow-x-auto pb-2 no-scrollbar">
                                    <button 
                                        onClick={() => cameraInputRef.current?.click()}
                                        disabled={uploading}
                                        className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition flex-shrink-0"
                                    >
                                        <Camera size={20} />
                                        <span className="text-[9px] mt-1 font-bold">Snap</span>
                                    </button>
                                    <button 
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={uploading}
                                        className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition flex-shrink-0"
                                    >
                                        {uploading ? <Loader2 size={20} className="animate-spin"/> : <ImageIcon size={20} />}
                                        <span className="text-[9px] mt-1 font-bold">{uploading ? '...' : 'Upload'}</span>
                                    </button>

                                    {draft.images && draft.images.map((imgId, i) => (
                                        <ImageThumbnail 
                                            key={i} 
                                            imageId={imgId} 
                                            onClick={setActiveViewerImage}
                                            onDelete={() => removeImage(i)}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3 pt-2">
                                <button onClick={() => setIsEditing(false)} className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold rounded-xl text-sm">Cancel</button>
                                <button onClick={saveDraft} className={`flex-1 py-3 bg-${themeColor}-600 text-white font-bold rounded-xl text-sm shadow-md flex items-center justify-center`}>
                                    <Save size={16} className="mr-2"/> Save Observation
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </Card>
        </div>
    </div>
</div>
);
};
