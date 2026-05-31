import React, { useState, useRef, useEffect } from 'react';
import { Book, Plus, Trash2, ChevronRight, ChevronLeft, ChevronDown, X, Paintbrush, FileText, Download, Check, Eraser, Hand, ZoomIn, ZoomOut, Undo, Redo, GripVertical, Edit2, List, ImageIcon, Lock, Unlock } from 'lucide-react';
import { Stage, Layer, Line, Circle, Image as KonvaImage, Transformer } from 'react-konva';
import { Html } from 'react-konva-utils';
import useImage from 'use-image';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { VisualMarkdownEditor, VisualMarkdownEditorRef } from '../components/VisualMarkdownEditor';
import { NotesRenderer } from '../components/NotesRenderer';
import { downloadPDF } from '../utils/download';
import { saveImageToIDB, getImageFromIDB } from '../services/storage';

interface LineState {
    id: string;
    points: number[];
    color: string;
    width: number;
    tool: 'pen' | 'eraser';
}

interface CanvasImageState {
    id: string;
    imageId: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
    isLocked?: boolean;
}

interface DiaryPage {
    id: string;
    title: string;
    createdAt: number;
    content: string;
    drawings: LineState[];
    canvasImages?: CanvasImageState[];
}

interface DiarySubject {
    id: string;
    name: string;
    color: string;
    pages: DiaryPage[];
}

const CanvasImageRenderer: React.FC<{ 
    imageState: CanvasImageState; 
    isSelected: boolean;
    onSelect: () => void;
    onChange: (newAttrs: Partial<CanvasImageState>) => void;
    onDelete: () => void;
}> = ({ imageState, isSelected, onSelect, onChange, onDelete }) => {
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const shapeRef = useRef<any>(null);
    const trRef = useRef<any>(null);

    useEffect(() => {
        let isMounted = true;
        getImageFromIDB(imageState.imageId).then(base64 => {
            if (isMounted && base64) {
                setImageSrc(`data:image/jpeg;base64,${base64}`);
            }
        });
        return () => { isMounted = false; };
    }, [imageState.imageId]);

    useEffect(() => {
        if (isSelected && trRef.current && shapeRef.current && !imageState.isLocked) {
            trRef.current.nodes([shapeRef.current]);
            trRef.current.getLayer().batchDraw();
        }
    }, [isSelected, imageState.isLocked]);

    const [image] = useImage(imageSrc || '');

    const [isHovered, setIsHovered] = useState(false);

    return (
        <React.Fragment>
            <KonvaImage
                onClick={onSelect}
                onTap={onSelect}
                ref={shapeRef}
                image={image}
                x={imageState.x}
                y={imageState.y}
                width={imageState.width}
                height={imageState.height}
                rotation={imageState.rotation || 0}
                draggable={isSelected && !imageState.isLocked}
                onDragStart={(e) => {
                    e.cancelBubble = true;
                }}
                onDragEnd={(e) => {
                    e.cancelBubble = true;
                    onChange({
                        x: e.target.x(),
                        y: e.target.y()
                    });
                }}
                onTransformEnd={() => {
                    const node = shapeRef.current;
                    const scaleX = node.scaleX();
                    const scaleY = node.scaleY();

                    node.scaleX(1);
                    node.scaleY(1);

                    onChange({
                        x: node.x(),
                        y: node.y(),
                        rotation: node.rotation(),
                        width: Math.max(5, node.width() * scaleX),
                        height: Math.max(5, node.height() * scaleY),
                    });
                }}
                onMouseEnter={() => {
                    document.body.style.cursor = imageState.isLocked ? 'default' : 'pointer';
                    setIsHovered(true);
                }}
                onMouseLeave={() => {
                    document.body.style.cursor = 'default';
                    setIsHovered(false);
                }}
            />
            {!imageState.isLocked && isSelected && (
                <Transformer
                    ref={trRef}
                    boundBoxFunc={(oldBox, newBox) => {
                        if (newBox.width < 10 || newBox.height < 10) {
                            return oldBox;
                        }
                        return newBox;
                    }}
                />
            )}
            {(isHovered || isSelected) && (
                <Html
                    groupProps={{
                        x: imageState.x + imageState.width,
                        y: imageState.y,
                    }}
                    divProps={{
                        style: {
                            pointerEvents: 'auto',
                        },
                    }}
                >
                    <div 
                        style={{ transform: 'translate(-100%, -100%)' }}
                        className="flex bg-white dark:bg-gray-800 shadow-md rounded-md p-1 border border-gray-200 dark:border-gray-700"
                    >
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onChange({ isLocked: !imageState.isLocked });
                            }}
                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-700 dark:text-gray-300 transition-colors"
                            title={imageState.isLocked ? "Unlock" : "Lock"}
                        >
                            {imageState.isLocked ? <Lock size={14} /> : <Unlock size={14} />}
                        </button>
                        {isSelected && !imageState.isLocked && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete();
                                }}
                                className="p-1 hover:bg-red-100 dark:hover:bg-red-900 rounded text-red-600 dark:text-red-400 transition-colors"
                                title="Delete Image"
                            >
                                <Trash2 size={14} />
                            </button>
                        )}
                    </div>
                </Html>
            )}
        </React.Fragment>
    );
};

export const DiaryView: React.FC<{
    userId: string;
    themeColor: string;
}> = ({ userId, themeColor }) => {
    const [subjects, setSubjects] = useState<DiarySubject[]>(() => {
        try {
            const raw = localStorage.getItem(`engram_diary_${userId}`);
            if (raw) return JSON.parse(raw);
        } catch (e) {
            console.error('Failed to parse diary storage', e);
        }
        return [];
    });

    const [activeSubjectId, setActiveSubjectId] = useState<string | null>(subjects[0]?.id || null);
    const [activePageId, setActivePageId] = useState<string | null>(subjects[0]?.pages[0]?.id || null);
    
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [viewMode, setViewMode] = useState<'notes' | 'draw'>('notes');
    const [noteMode, setNoteMode] = useState<'edit' | 'preview'>('edit');
    const [drawColor, setDrawColor] = useState('#ef4444');
    const [drawWidth, setDrawWidth] = useState(2);
    const [drawTool, setDrawTool] = useState<'pen'|'eraser'|'pan'>('pen');
    const [redoStack, setRedoStack] = useState<LineState[]>([]);
    const [toolbarPos, setToolbarPos] = useState({ x: 0, y: 0 });
    const isDraggingToolbar = useRef(false);
    const lastToolbarPos = useRef({ x: 0, y: 0 });
    
    // Canvas Zoom & Pan
    const [stageScale, setStageScale] = useState(1);
    const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
    const [isExporting, setIsExporting] = useState(false);
    const [eraserPos, setEraserPos] = useState<{ x: number, y: number } | null>(null);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    
    const [isAddingSubject, setIsAddingSubject] = useState(false);
    const [newSubjectName, setNewSubjectName] = useState('');
    const [confirmDelete, setConfirmDelete] = useState<{
        type: 'subject' | 'page';
        subjectId: string;
        pageId?: string;
        title: string;
    } | null>(null);

    // Edit states
    const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
    const [editingSubjectName, setEditingSubjectName] = useState('');
    const [editingPageId, setEditingPageId] = useState<string | null>(null);
    const [editingPageTitle, setEditingPageTitle] = useState('');

    const startEditingSubject = (id: string, name: string) => {
        setEditingSubjectId(id);
        setEditingSubjectName(name);
        setEditingPageId(null);
    };

    const saveSubjectName = (id: string) => {
        if (editingSubjectName.trim()) {
            updateSubject(id, { name: editingSubjectName.trim() });
        }
        setEditingSubjectId(null);
    };

    const startEditingPage = (id: string, title: string) => {
        setEditingPageId(id);
        setEditingPageTitle(title);
        setEditingSubjectId(null);
    };

    const savePageTitle = (subId: string, pageId: string) => {
        if (editingPageTitle.trim()) {
            setSubjects(prev => prev.map(s => {
                if (s.id !== subId) return s;
                return {
                    ...s,
                    pages: s.pages.map(p => p.id === pageId ? { ...p, title: editingPageTitle.trim() } : p)
                };
            }));
        }
        setEditingPageId(null);
    };
    
    // Canvas dimensions relative
    const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight - 200 });
    const containerRef = useRef<HTMLDivElement>(null);

    const editorRef = useRef<VisualMarkdownEditorRef>(null);

    const insertMarkdown = (prefix: string, suffix: string) => {
        if (editorRef.current) {
            editorRef.current.insertMarkdown(prefix, suffix);
        }
    };

    useEffect(() => {
        const updateDims = () => {
            if (containerRef.current) {
                setDimensions({
                    width: containerRef.current.offsetWidth,
                    height: containerRef.current.offsetHeight
                });
            }
        };
        
        updateDims();
        
        const observer = new ResizeObserver(() => {
            updateDims();
        });
        
        if (containerRef.current) {
            observer.observe(containerRef.current);
        }
        
        window.addEventListener('resize', updateDims);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', updateDims);
        }
    }, [activePageId, viewMode, isSidebarOpen]);

    // Save to LocalStorage
    useEffect(() => {
        localStorage.setItem(`engram_diary_${userId}`, JSON.stringify(subjects));
    }, [subjects, userId]);

    // Helpers
    const updateSubject = (id: string, updates: Partial<DiarySubject>) => {
        setSubjects(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    };

    const confirmAddSubject = () => {
        if (!newSubjectName.trim()) {
            setIsAddingSubject(false);
            return;
        }
        const newSub: DiarySubject = {
            id: Date.now().toString(),
            name: newSubjectName.trim(),
            color: 'bg-blue-500',
            pages: [{
                id: Date.now().toString() + 'p',
                title: 'New Page',
                createdAt: Date.now(),
                content: '',
                drawings: []
            }]
        };
        setSubjects([...subjects, newSub]);
        setActiveSubjectId(newSub.id);
        setActivePageId(newSub.pages[0].id);
        setIsAddingSubject(false);
        setNewSubjectName('');
    };

    const addPage = (subId: string) => {
        setSubjects(prev => prev.map(s => {
            if (s.id !== subId) return s;
            const newPage: DiaryPage = {
                id: Date.now().toString() + 'p',
                title: 'Untitled Page',
                createdAt: Date.now(),
                content: '',
                drawings: []
            };
            setActivePageId(newPage.id);
            return { ...s, pages: [...s.pages, newPage] };
        }));
    };

    const getActivePage = () => {
        if (!activeSubjectId || !activePageId) return null;
        const s = subjects.find(s => s.id === activeSubjectId);
        if (!s) return null;
        return s.pages.find(p => p.id === activePageId) || null;
    };

    const updateActivePage = (updates: Partial<DiaryPage>) => {
        if (!activeSubjectId || !activePageId) return;
        setSubjects(prev => prev.map(s => {
            if (s.id !== activeSubjectId) return s;
            return {
                ...s,
                pages: s.pages.map(p => p.id === activePageId ? { ...p, ...updates } : p)
            };
        }));
    };

    const updateCanvasImage = (id: string, newProps: Partial<CanvasImageState>) => {
        const activePage = subjects.find(s => s.id === activeSubjectId)?.pages.find(p => p.id === activePageId);
        if (!activePage) return;
        const currentImages = activePage.canvasImages || [];
        const updatedImages = currentImages.map(img => img.id === id ? { ...img, ...newProps } : img);
        updateActivePage({ canvasImages: updatedImages });
    };

    const isDrawing = useRef(false);

    // Removed window pointer listeners for toolbar drag; handled directly on the drag handle

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleWheel = (e: any) => {
        e.evt.preventDefault();
        if (viewMode !== 'draw') return;

        const scaleBy = 1.1;
        const stage = e.target.getStage();
        const oldScale = stage.scaleX();
        const pointer = stage.getPointerPosition();

        if (!pointer) return;

        const mousePointTo = {
            x: (pointer.x - stage.x()) / oldScale,
            y: (pointer.y - stage.y()) / oldScale,
        };

        const zoomIn = e.evt.deltaY < 0;
        const newScale = zoomIn ? oldScale * scaleBy : oldScale / scaleBy;
        const clampedScale = Math.max(0.1, Math.min(newScale, 5.0));

        setStageScale(clampedScale);
        setStagePos({
            x: pointer.x - mousePointTo.x * clampedScale,
            y: pointer.y - mousePointTo.y * clampedScale,
        });
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleMouseDown = (e: any) => {
        const clickedOnEmpty = e.target === e.target.getStage();
        if (clickedOnEmpty) {
            setSelectedNodeId(null);
        }

        const isImage = e.target.className === 'Image' || e.target.findAncestor?.('Transformer');
        if (viewMode !== 'draw' || drawTool === 'pan' || isImage) return;

        isDrawing.current = true;
        const stage = e.target.getStage();
        const point = stage.getPointerPosition();
        if (!point) return;
        
        const transform = stage.getAbsoluteTransform().copy();
        transform.invert();
        const relativePoint = transform.point(point);
        
        const activePage = getActivePage();
        if (!activePage) return;

        const newLine: LineState = { 
            id: Date.now().toString(),
            tool: drawTool, 
            color: drawColor, 
            width: drawWidth, 
            points: [relativePoint.x, relativePoint.y] 
        };
        setRedoStack([]);
        updateActivePage({ drawings: [...activePage.drawings, newLine] });
    };

    const handleUndo = () => {
        const activePage = getActivePage();
        if (!activePage || activePage.drawings.length === 0) return;
        const newDrawings = [...activePage.drawings];
        const lastLine = newDrawings.pop();
        if (lastLine) {
            setRedoStack([...redoStack, lastLine]);
            updateActivePage({ drawings: newDrawings });
        }
    };

    const handleRedo = () => {
        const activePage = getActivePage();
        if (!activePage || redoStack.length === 0) return;
        const newRedoStack = [...redoStack];
        const lineToRedo = newRedoStack.pop();
        if (lineToRedo) {
            setRedoStack(newRedoStack);
            updateActivePage({ drawings: [...activePage.drawings, lineToRedo] });
        }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleMouseMove = (e: any) => {
        // Track eraser position whenever eraser tool is active
        if (viewMode === 'draw' && drawTool === 'eraser') {
            const stage = e.target.getStage();
            if (stage) {
                const point = stage.getPointerPosition();
                if (point) {
                    const transform = stage.getAbsoluteTransform().copy();
                    transform.invert();
                    const relativePoint = transform.point(point);
                    setEraserPos({ x: relativePoint.x, y: relativePoint.y });
                } else {
                    setEraserPos(null);
                }
            }
        } else if (eraserPos !== null) {
            setEraserPos(null);
        }

        if (!isDrawing.current || viewMode !== 'draw' || drawTool === 'pan') return;

        const stage = e.target.getStage();
        const point = stage.getPointerPosition();
        if (!point) return;

        const transform = stage.getAbsoluteTransform().copy();
        transform.invert();
        const relativePoint = transform.point(point);
        
        const activePage = getActivePage();
        if (!activePage || activePage.drawings.length === 0) return;

        const lastLine = activePage.drawings[activePage.drawings.length - 1];
        lastLine.points = lastLine.points.concat([relativePoint.x, relativePoint.y]);
        
        const newDrawings = [...activePage.drawings];
        newDrawings.splice(activePage.drawings.length - 1, 1, lastLine);

        updateActivePage({ drawings: newDrawings });
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleMouseUp = (e?: any) => {
        isDrawing.current = false;
        // On touch-ended, clear eraser position to avoid stale indicator
        if (e && e.evt && (e.evt.touches || e.evt.changedTouches)) {
            setEraserPos(null);
        }
    };

    const lastCenter = useRef<{x: number, y: number} | null>(null);
    const lastDist = useRef<number | null>(null);

    const getDistance = (p1: any, p2: any) => {
        return Math.sqrt(Math.pow(p2.clientX - p1.clientX, 2) + Math.pow(p2.clientY - p1.clientY, 2));
    };

    const getCenter = (p1: any, p2: any) => {
        return {
            x: (p1.clientX + p2.clientX) / 2,
            y: (p1.clientY + p2.clientY) / 2,
        };
    };

    const handleTouchStart = (e: any) => {
        if (e.evt.touches.length === 1) {
            handleMouseDown(e);
        } else if (e.evt.touches.length === 2) {
            e.evt.preventDefault();
            const touch1 = e.evt.touches[0];
            const touch2 = e.evt.touches[1];
            lastDist.current = getDistance(touch1, touch2);
            lastCenter.current = getCenter(touch1, touch2);
        }
    };

    const handleTouchMove = (e: any) => {
        if (e.evt.touches.length === 1) {
            handleMouseMove(e);
        } else if (e.evt.touches.length === 2) {
            e.evt.preventDefault();
            const touch1 = e.evt.touches[0];
            const touch2 = e.evt.touches[1];
            const dist = getDistance(touch1, touch2);

            if (!lastDist.current) {
                lastDist.current = dist;
            }

            const stage = e.target.getStage();
            const oldScale = stage.scaleX();

            const scaleBy = dist / (lastDist.current || dist);
            const newScale = Math.max(0.1, Math.min(oldScale * scaleBy, 5.0));

            const center = getCenter(touch1, touch2);

            if (lastCenter.current) {
                const pointerPosition = {
                  x: center.x,
                  y: center.y
                };

                const mousePointTo = {
                  x: (pointerPosition.x - stage.x()) / oldScale,
                  y: (pointerPosition.y - stage.y()) / oldScale,
                };

                const newPos = {
                  x: pointerPosition.x - mousePointTo.x * newScale,
                  y: pointerPosition.y - mousePointTo.y * newScale,
                };

                setStageScale(newScale);
                setStagePos(newPos);
            }

            lastDist.current = dist;
            lastCenter.current = center;
        }
    };

    const handleTouchEnd = (e: any) => {
        lastDist.current = null;
        lastCenter.current = null;
        if (e.evt.touches.length === 0 || e.evt.changedTouches.length > 0) {
            handleMouseUp(e);
        }
    };

    const handleDownloadPdf = async () => {
        const activeSubject = subjects.find(s => s.id === activeSubjectId);
        if (!activeSubject || !containerRef.current) return;
        
        setIsExporting(true);
        const originalPageId = activePageId;
        const originalNoteMode = noteMode;
        
        try {
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeightMax = pdf.internal.pageSize.getHeight();
            
            for (let i = 0; i < activeSubject.pages.length; i++) {
                const page = activeSubject.pages[i];
                setActivePageId(page.id);
                setNoteMode('preview');
                
                // Wait longer for React to render the new page, handle images, and switch modes
                await new Promise(resolve => setTimeout(resolve, 800));
                
                if (containerRef.current) {
                    const container = containerRef.current;
                    const originalContainerOverflow = container.style.overflow;
                    const originalContainerHeight = container.style.height;
                    
                    const parentElement = container.parentElement;
                    let origParentOverflow = '';
                    let origParentHeight = '';
                    
                    if (parentElement) {
                        origParentOverflow = parentElement.style.overflow;
                        origParentHeight = parentElement.style.height;
                        parentElement.style.overflow = 'visible';
                        parentElement.style.height = 'max-content';
                    }
                    
                    container.style.overflow = 'visible';
                    container.style.height = 'max-content';
                    
                    const intermediates = Array.from(container.querySelectorAll('.pdf-intermediate, .pdf-content-scrollable')) as HTMLElement[];
                    const origIntermediates: {el: HTMLElement, overflow: string, height: string, position: string}[] = [];
                    intermediates.forEach(el => {
                        origIntermediates.push({ el, overflow: el.style.overflow, height: el.style.height, position: el.style.position });
                        el.style.overflow = 'visible';
                        el.style.height = 'max-content';
                        if (el.classList.contains('absolute')) {
                            el.style.position = 'relative'; // Need to be relative so it pushes container height
                        }
                    });

                    const targetHeight = container.scrollHeight;
                    
                    const canvas = await html2canvas(container, { 
                        backgroundColor: document.documentElement.classList.contains('dark') ? '#111827' : '#ffffff', 
                        scale: 2,
                        useCORS: true,
                        windowHeight: targetHeight + 100,
                        height: targetHeight,
                        y: 0,
                    });
                    
                    // Restore styles
                    if (parentElement) {
                        parentElement.style.overflow = origParentOverflow;
                        parentElement.style.height = origParentHeight;
                    }
                    container.style.overflow = originalContainerOverflow;
                    container.style.height = originalContainerHeight;
                    
                    origIntermediates.forEach(({ el, overflow, height, position }) => {
                        el.style.overflow = overflow;
                        el.style.height = height;
                        el.style.position = position;
                    });

                    const imgData = canvas.toDataURL('image/jpeg', 0.95);
                    const imgHeight = (canvas.height * pdfWidth) / canvas.width;
                    
                    pdf.setFontSize(16);
                    pdf.text(page.title || `Page ${i + 1}`, 10, 10);
                    
                    let heightLeft = imgHeight;
                    let position = 20;

                    pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, imgHeight);
                    heightLeft -= (pdfHeightMax - 20);

                    // Add new pages if content overflows the first page
                    while (heightLeft > 0) {
                        position = position - pdfHeightMax; // shift image up
                        pdf.addPage();
                        pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, imgHeight); 
                        heightLeft -= pdfHeightMax;
                    }
                    
                    if (i < activeSubject.pages.length - 1) {
                        pdf.addPage();
                    }
                }
            }
            
            const dateStr = new Date().toISOString().split('T')[0];
            const safeSubjectName = (activeSubject.name || 'Diary').trim();
            const filename = `Diary_${safeSubjectName.replace(/\s+/g, '_')}_${dateStr}.pdf`;
            
            await downloadPDF(pdf, filename, {
                folderPath: `Engram/${safeSubjectName}`
            });
        } catch (e) {
            console.error("PDF generation failed:", e);
        } finally {
            setActivePageId(originalPageId);
            setNoteMode(originalNoteMode);
            setIsExporting(false);
        }
    };

    const activePage = getActivePage();
    const activeSubject = subjects.find(s => s.id === activeSubjectId);
    
    const currentPageIndex = activeSubject ? activeSubject.pages.findIndex(p => p.id === activePageId) : -1;
    const isFirstPage = currentPageIndex <= 0;
    const isLastPage = activeSubject ? currentPageIndex >= activeSubject.pages.length - 1 : true;
    
    const handlePrevPage = () => {
        if (activeSubject && !isFirstPage) setActivePageId(activeSubject.pages[currentPageIndex - 1].id);
    };
    
    const handleNextPage = () => {
        if (activeSubject && !isLastPage) setActivePageId(activeSubject.pages[currentPageIndex + 1].id);
    };

    return (
        <div className="flex h-full bg-white dark:bg-gray-950 overflow-hidden w-full font-sans lg:pb-0">
            {/* Sidebar */}
            <div className={`flex flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transition-all duration-300 ${isSidebarOpen ? 'w-64' : 'w-0 overflow-hidden'}`}>
                <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center whitespace-nowrap">
                    <h2 className="font-bold text-gray-800 dark:text-gray-100 flex items-center">
                        <Book size={18} className={`mr-2 text-${themeColor}-500`} /> 
                        My Diary
                    </h2>
                    <button onClick={() => setIsAddingSubject(true)} className={`p-1.5 rounded bg-${themeColor}-100 dark:bg-${themeColor}-900/30 text-${themeColor}-600 dark:text-${themeColor}-400 hover:bg-${themeColor}-200`}><Plus size={16} /></button>
                </div>
                <div className="flex-1 overflow-y-auto w-64 pt-2 pb-20">
                    {isAddingSubject && (
                        <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 flex">
                            <input 
                                autoFocus
                                type="text" 
                                placeholder="Subject name..." 
                                className="flex-1 bg-transparent text-sm border-none outline-none text-gray-800 dark:text-gray-200"
                                value={newSubjectName}
                                onChange={(e) => setNewSubjectName(e.target.value)}
                                onKeyDown={(e) => {
                                    if(e.key === 'Enter') confirmAddSubject();
                                    if(e.key === 'Escape') setIsAddingSubject(false);
                                }}
                            />
                            <button onClick={confirmAddSubject} className="ml-2 text-green-500"><Check size={16} /></button>
                        </div>
                    )}
                    {subjects.length === 0 && !isAddingSubject && (
                        <div className="p-4 text-sm text-gray-500 italic text-center">Add a subject to start</div>
                    )}
                    {subjects.map(sub => (
                        <div key={sub.id} className="mb-2">
                            {editingSubjectId === sub.id ? (
                                <div 
                                    className="mx-3 my-1 px-2 py-1 flex items-center bg-gray-50 dark:bg-gray-800/85 border border-gray-200 dark:border-gray-750 rounded-lg shadow-inner"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <input 
                                        autoFocus
                                        type="text"
                                        value={editingSubjectName}
                                        onChange={(e) => setEditingSubjectName(e.target.value)}
                                        onBlur={() => saveSubjectName(sub.id)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') saveSubjectName(sub.id);
                                            if (e.key === 'Escape') setEditingSubjectId(null);
                                        }}
                                        className="flex-1 bg-transparent text-sm font-semibold border-none outline-none text-gray-800 dark:text-gray-200 min-w-0"
                                    />
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); saveSubjectName(sub.id); }} 
                                        className="text-green-500 hover:text-green-650 ml-1.5 focus:outline-none"
                                    >
                                        <Check size={16} />
                                    </button>
                                </div>
                            ) : (
                                <div 
                                    className={`px-4 py-2 flex items-center justify-between cursor-pointer group ${activeSubjectId === sub.id ? `bg-${themeColor}-50/60 dark:bg-${themeColor}-900/15 border-l-2 border-${themeColor}-500` : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                                    onClick={() => setActiveSubjectId(sub.id)}
                                    onDoubleClick={() => startEditingSubject(sub.id, sub.name)}
                                >
                                    <span 
                                        className={`font-semibold text-sm truncate pr-2 flex-1 ${activeSubjectId === sub.id ? `text-${themeColor}-700 dark:text-${themeColor}-400` : 'text-gray-700 dark:text-gray-300'}`}
                                        title="Double click to rename"
                                    >
                                        {sub.name}
                                    </span>
                                    <div className="flex items-center space-x-1 shrink-0">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); startEditingSubject(sub.id, sub.name); }} 
                                            className="text-gray-400 hover:text-blue-500 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition md:opacity-0 group-hover:opacity-100 focus:opacity-100"
                                            title="Rename Subject"
                                        >
                                            <Edit2 size={13} />
                                        </button>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); addPage(sub.id); }} 
                                            className="text-gray-400 hover:text-green-500 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition md:opacity-75 md:hover:opacity-100"
                                            title="Add Page"
                                        >
                                            <Plus size={16} />
                                        </button>
                                        <button 
                                            onClick={(e) => { 
                                                e.stopPropagation(); 
                                                setConfirmDelete({
                                                    type: 'subject',
                                                    subjectId: sub.id,
                                                    title: sub.name
                                                });
                                            }} 
                                            className="text-gray-400 hover:text-red-500 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition md:opacity-75 md:hover:opacity-100"
                                            title="Delete Subject"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            )}
                            
                            {/* Pages */}
                            {activeSubjectId === sub.id && (
                                <div className="pl-6 pr-2 py-1 space-y-1">
                                    {sub.pages.map(page => (
                                        editingPageId === page.id ? (
                                            <div 
                                                key={page.id}
                                                className="px-2 py-1 flex items-center bg-gray-50 dark:bg-gray-800/60 rounded-md border border-gray-200 dark:border-gray-700 shadow-sm"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <input 
                                                    autoFocus
                                                    type="text"
                                                    value={editingPageTitle}
                                                    onChange={(e) => setEditingPageTitle(e.target.value)}
                                                    onBlur={() => savePageTitle(sub.id, page.id)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') savePageTitle(sub.id, page.id);
                                                        if (e.key === 'Escape') setEditingPageId(null);
                                                    }}
                                                    className="flex-1 bg-transparent text-xs border-none outline-none text-gray-800 dark:text-gray-200 min-w-0"
                                                />
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); savePageTitle(sub.id, page.id); }} 
                                                    className="text-green-500 hover:text-green-650 ml-1 focus:outline-none"
                                                >
                                                    <Check size={14} />
                                                </button>
                                            </div>
                                        ) : (
                                            <div 
                                                key={page.id}
                                                onClick={() => setActivePageId(page.id)}
                                                onDoubleClick={() => startEditingPage(page.id, page.title || 'Untitled')}
                                                className={`px-3 py-1.5 text-sm rounded-md cursor-pointer flex justify-between items-center group ${activePageId === page.id ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-medium' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                                            >
                                                <span 
                                                    className="truncate pr-1 flex-1 text-xs"
                                                    title="Double click to rename"
                                                >
                                                    {page.title || 'Untitled'}
                                                </span>
                                                <div className="flex items-center space-x-0.5 shrink-0 md:opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition duration-150">
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); startEditingPage(page.id, page.title || 'Untitled'); }} 
                                                        className="text-gray-400 hover:text-blue-500 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                                                        title="Rename Page"
                                                    >
                                                        <Edit2 size={12} />
                                                    </button>
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setConfirmDelete({
                                                                type: 'page',
                                                                subjectId: sub.id,
                                                                pageId: page.id,
                                                                title: page.title || 'Untitled'
                                                            });
                                                        }}
                                                        className="text-gray-400 hover:text-red-500 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition ml-0.5"
                                                        title="Delete Page"
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                </div>
                                            </div>
                                        )
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-gray-950 relative">
                <button 
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    className="absolute left-0 top-4 w-6 h-10 bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 flex items-center justify-center rounded-r-md z-10"
                    style={{ left: isSidebarOpen ? -1 : 0 }}
                >
                    <ChevronRight size={16} className={`text-gray-500 transform transition ${isSidebarOpen ? 'rotate-180' : ''}`} />
                </button>

                {activePage ? (
                    <>
                        <div className="px-3.5 md:px-6 py-3 border-b border-gray-200 dark:border-gray-800 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
                            <div className="flex items-center w-full lg:w-auto flex-1 min-w-0 space-x-3">
                                <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 border border-gray-200/50 dark:border-gray-700/50 shrink-0">
                                    <div className="relative select-none">
                                        <div className="py-1 px-2 md:px-2.5 text-xs font-semibold text-gray-700 dark:text-gray-200 flex items-center space-x-1 hover:bg-white dark:hover:bg-gray-700 rounded-md transition cursor-pointer">
                                            <span>P.{currentPageIndex + 1}</span>
                                            <ChevronDown size={12} className="opacity-60 shrink-0" />
                                        </div>
                                        <select 
                                            value={activePageId || ''} 
                                            onChange={(e) => setActivePageId(e.target.value)}
                                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                            title="Jump to page"
                                        >
                                            {activeSubject?.pages.map((p, idx) => (
                                                <option key={p.id} value={p.id}>{p.title || `Page ${idx + 1}`}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="h-4 w-[1px] bg-gray-300 dark:bg-gray-600/60 mx-1"></div>
                                    <button
                                        onClick={() => activeSubject && addPage(activeSubject.id)}
                                        className="p-1 hover:bg-white dark:hover:bg-gray-700 rounded-md text-gray-600 dark:text-gray-300 transition flex items-center justify-center shrink-0"
                                        title="Add New Page"
                                    >
                                        <Plus size={14} className={`text-${themeColor}-600 dark:text-${themeColor}-400`} />
                                    </button>
                                </div>
                                <input 
                                    type="text"
                                    value={activePage.title}
                                    onChange={(e) => updateActivePage({ title: e.target.value })}
                                    className="flex-1 min-w-0 text-base md:text-xl font-bold bg-transparent border-none outline-none text-gray-800 dark:text-gray-100 placeholder-gray-400 py-1"
                                    placeholder="Page Title"
                                />
                            </div>

                            <div className="flex items-center justify-between lg:justify-end space-x-2 w-full lg:w-auto">
                                <div className="flex items-center space-x-1 shrink-0 bg-gray-100 dark:bg-gray-800 p-0.5 lg:p-1 rounded-lg">
                                    <button
                                        onClick={() => setViewMode('notes')}
                                        className={`px-2 lg:px-3 py-1 flex items-center rounded-md text-xs lg:text-sm font-medium transition ${viewMode === 'notes' ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                                    >
                                        <FileText size={14} className="mr-1 lg:mr-1.5 shrink-0" />
                                        <span>Notes<span className="hidden lg:inline"> & Math</span></span>
                                    </button>
                                    <button
                                        onClick={() => setViewMode('draw')}
                                        className={`px-2 lg:px-3 py-1 flex items-center rounded-md text-xs lg:text-sm font-medium transition ${viewMode === 'draw' ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                                    >
                                        <Paintbrush size={14} className="mr-1 lg:mr-1.5 shrink-0" />
                                        <span>Draw</span>
                                    </button>
                                </div>
                                <div className="flex items-center space-x-1 shrink-0">
                                    <button
                                        onClick={() => {
                                            const input = document.createElement('input');
                                            input.type = 'file';
                                            input.accept = 'image/*';
                                            input.onchange = async (e: Event) => {
                                                const target = e.target as HTMLInputElement;
                                                const file = target.files?.[0];
                                                if (!file) return;
                                                const reader = new FileReader();
                                                reader.onload = async (event) => {
                                                    const base64 = (event.target?.result as string).split(',')[1];
                                                    const tempId = `img_${Date.now()}_${Math.random().toString(36).substring(7)}`;
                                                    await saveImageToIDB(tempId, base64);
                                                    
                                                    if (viewMode === 'notes') {
                                                        const imgTag = `\n[FIG_CAPTURE: ${tempId} | Inserted image]\n`;
                                                        if (activePage) {
                                                            const newContent = (activePage.content || '') + imgTag;
                                                            updateActivePage({ content: newContent });
                                                        }
                                                    } else if (viewMode === 'draw') {
                                                        if (activePage) {
                                                            // We try to get image dimensions
                                                            const img = new Image();
                                                            img.onload = () => {
                                                                const MAX_WIDTH = 300;
                                                                let w = img.width;
                                                                let h = img.height;
                                                                if (w > MAX_WIDTH) {
                                                                    h = (h * MAX_WIDTH) / w;
                                                                    w = MAX_WIDTH;
                                                                }
                                                                const newImage: CanvasImageState = {
                                                                    id: `canvas_img_${Date.now()}`,
                                                                    imageId: tempId,
                                                                    x: 50,
                                                                    y: 50,
                                                                    width: w,
                                                                    height: h
                                                                };
                                                                const currentImages = activePage.canvasImages || [];
                                                                updateActivePage({ canvasImages: [...currentImages, newImage] });
                                                            };
                                                            img.src = `data:image/jpeg;base64,${base64}`;
                                                        }
                                                    }
                                                };
                                                reader.readAsDataURL(file);
                                            };
                                            input.click();
                                        }}
                                        className="p-1.5 md:p-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition flex items-center shrink-0"
                                        title="Attach Image"
                                    >
                                        <ImageIcon size={16} className="text-gray-700 dark:text-gray-300" />
                                    </button>
                                    <button
                                        onClick={handleDownloadPdf}
                                        className="p-1.5 md:p-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition flex items-center shrink-0"
                                        title="Download PDF"
                                    >
                                        <Download size={16} className="text-gray-700 dark:text-gray-300" />
                                    </button>
                                    <button
                                        onClick={handlePrevPage}
                                        disabled={isFirstPage}
                                        className={`p-1.5 md:p-2 rounded-lg bg-gray-100 dark:bg-gray-800 transition flex items-center shrink-0 ${isFirstPage ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                                        title="Previous Page"
                                    >
                                        <ChevronLeft size={16} className="text-gray-700 dark:text-gray-300" />
                                    </button>
                                    <button
                                        onClick={handleNextPage}
                                        disabled={isLastPage}
                                        className={`p-1.5 md:p-2 rounded-lg bg-gray-100 dark:bg-gray-800 transition flex items-center shrink-0 ${isLastPage ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                                        title="Next Page"
                                    >
                                        <ChevronRight size={16} className="text-gray-700 dark:text-gray-300" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 overflow-hidden relative bg-blue-50/10 dark:bg-black/20" ref={containerRef}>
                            {/* Dot Grid Background */}
                            <div className="absolute inset-0 pointer-events-none opacity-20 dark:opacity-10" style={{ backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
                            
                            {viewMode === 'notes' && (
                                <div className="pdf-intermediate absolute inset-0 flex flex-col overflow-hidden bg-white/50 dark:bg-gray-900/50">
                                    {!isExporting && (
                                        <div className="flex items-center p-1.5 md:p-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/80 overflow-x-auto scrollbar-none">
                                            <div className="flex bg-gray-200 dark:bg-gray-700 p-0.5 rounded-lg space-x-0.5 md:space-x-1 shrink-0">
                                                <button 
                                                    onClick={() => setNoteMode('edit')} 
                                                    className={`px-3 py-1 md:px-4 md:py-1.5 rounded-md text-xs md:text-sm font-medium transition shrink-0 ${noteMode === 'edit' ? 'bg-white dark:bg-gray-600 shadow-sm text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}
                                                >Write</button>
                                                <button 
                                                    onClick={() => setNoteMode('preview')} 
                                                    className={`px-3 py-1 md:px-4 md:py-1.5 rounded-md text-xs md:text-sm font-medium transition shrink-0 ${noteMode === 'preview' ? 'bg-white dark:bg-gray-600 shadow-sm text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}
                                                >Preview</button>
                                            </div>
                                            {noteMode === 'edit' && (
                                                <div className="flex items-center space-x-0.5 md:space-x-1 ml-2 md:ml-4 pl-2 md:pl-4 border-l border-gray-300 dark:border-gray-600 shrink-0">
                                                    <button onClick={() => insertMarkdown('# ', '')} className="p-1 px-1.5 md:p-1.5 md:px-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-xs md:text-sm font-bold text-gray-700 dark:text-gray-300 transition shrink-0" title="Heading 1">H1</button>
                                                    <button onClick={() => insertMarkdown('## ', '')} className="p-1 px-1.5 md:p-1.5 md:px-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-xs md:text-sm font-bold text-gray-700 dark:text-gray-300 transition shrink-0" title="Heading 2">H2</button>
                                                    <button onClick={() => insertMarkdown('### ', '')} className="p-1 px-1.5 md:p-1.5 md:px-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-xs md:text-sm font-bold text-gray-700 dark:text-gray-300 transition shrink-0" title="Heading 3">H3</button>
                                                    <button onClick={() => insertMarkdown('**', '**')} className="p-1 px-1.5 md:p-1.5 md:px-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-xs md:text-sm font-bold text-gray-700 dark:text-gray-300 transition shrink-0" title="Bold">B</button>
                                                    <button onClick={() => insertMarkdown('*', '*')} className="p-1 px-1.5 md:p-1.5 md:px-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-xs md:text-sm italic font-serif text-gray-700 dark:text-gray-300 transition shrink-0" title="Italic">I</button>
                                                    <button onClick={() => insertMarkdown('- ', '')} className="p-1 px-1.5 md:p-1.5 md:px-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-xs md:text-sm font-bold text-gray-700 dark:text-gray-300 transition shrink-0 flex items-center justify-center" title="Bullet List"><List size={16} /></button>
                                                    <button onClick={() => {
                                                        const input = document.createElement('input');
                                                        input.type = 'file';
                                                        input.accept = 'image/*';
                                                        input.onchange = async (e: Event) => {
                                                            const target = e.target as HTMLInputElement;
                                                            const file = target.files?.[0];
                                                            if (!file) return;
                                                            const reader = new FileReader();
                                                            reader.onload = async (event) => {
                                                                const base64 = (event.target?.result as string).split(',')[1];
                                                                const tempId = `img_${Date.now()}_${Math.random().toString(36).substring(7)}`;
                                                                await saveImageToIDB(tempId, base64);
                                                                insertMarkdown(`\n[FIG_CAPTURE: ${tempId} | Inserted image]\n`, '');
                                                            };
                                                            reader.readAsDataURL(file);
                                                        };
                                                        input.click();
                                                    }} className="p-1 px-1.5 md:p-1.5 md:px-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-xs md:text-sm font-bold text-gray-700 dark:text-gray-300 transition shrink-0 flex items-center justify-center" title="Attach Image"><ImageIcon size={16} /></button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    <div className="pdf-intermediate flex-1 overflow-hidden relative">
                                        {noteMode === 'edit' ? (
                                            <VisualMarkdownEditor
                                                ref={editorRef}
                                                value={activePage.content}
                                                onChange={(newContent) => updateActivePage({ content: newContent })}
                                                placeholder="Start typing your notes here. Supports Markdown and $$ LaTeX $$ formulas..."
                                            />
                                        ) : (
                                            <div className="pdf-content-scrollable w-full h-full p-6 overflow-y-auto overflow-x-hidden pt-8">
                                                <NotesRenderer content={activePage.content || '*Preview will appear here...*'} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {viewMode === 'draw' && (
                                <>
                                    {!isExporting && (
                                        <div 
                                            className="fixed bottom-24 lg:bottom-12 left-1/2 z-[100] flex items-center space-x-2 bg-white dark:bg-gray-800 shadow-xl border border-gray-100 dark:border-gray-700 rounded-full px-2 py-2 overflow-x-auto max-w-[95vw] md:max-w-none"
                                            style={{ transform: `translate(calc(-50% + ${toolbarPos.x}px), ${toolbarPos.y}px)` }}
                                        >
                                            <div 
                                                className="cursor-move p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 border-r border-gray-200 dark:border-gray-700 shrink-0"
                                                style={{ touchAction: 'none' }}
                                                onPointerDown={(e) => {
                                                    isDraggingToolbar.current = true;
                                                    lastToolbarPos.current = { x: e.clientX, y: e.clientY };
                                                    e.currentTarget.setPointerCapture(e.pointerId);
                                                }}
                                                onPointerMove={(e) => {
                                                    if (isDraggingToolbar.current) {
                                                        const dx = e.clientX - lastToolbarPos.current.x;
                                                        const dy = e.clientY - lastToolbarPos.current.y;
                                                        setToolbarPos(prev => ({ x: prev.x + dx, y: prev.y + dy }));
                                                        lastToolbarPos.current = { x: e.clientX, y: e.clientY };
                                                    }
                                                }}
                                                onPointerUp={(e) => {
                                                    if (isDraggingToolbar.current) {
                                                        isDraggingToolbar.current = false;
                                                        e.currentTarget.releasePointerCapture(e.pointerId);
                                                    }
                                                }}
                                                onPointerCancel={(e) => {
                                                    if (isDraggingToolbar.current) {
                                                        isDraggingToolbar.current = false;
                                                        e.currentTarget.releasePointerCapture(e.pointerId);
                                                    }
                                                }}
                                            >
                                                <GripVertical size={20} />
                                            </div>
                                            <div className="flex space-x-1 border-r border-gray-200 dark:border-gray-700 pr-2 pl-2">
                                                {['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#000000', '#ffffff'].map(c => (
                                                    <button
                                                        key={c}
                                                        onClick={() => { setDrawTool('pen'); setDrawColor(c); }}
                                                        className={`w-6 h-6 rounded-full border-2 ${drawColor === c && drawTool === 'pen' ? 'border-gray-400 scale-110' : 'border-transparent'}`}
                                                        style={{ backgroundColor: c }}
                                                    />
                                                ))}
                                            </div>
                                            <div className="flex items-center space-x-2 pl-2 border-r border-gray-200 dark:border-gray-700 pr-2 shrink-0">
                                                <input type="range" min="1" max="20" value={drawWidth} onChange={(e) => setDrawWidth(parseInt(e.target.value))} className="w-16 md:w-24" />
                                            </div>
                                            <div className="pl-2 flex items-center space-x-2 shrink-0 border-r border-gray-200 dark:border-gray-700 pr-2">
                                                <button 
                                                    onClick={() => setDrawTool('eraser')}
                                                    className={`p-1.5 rounded transition ${drawTool === 'eraser' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400' : 'hover:bg-gray-100 text-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'}`}
                                                    title="Eraser"
                                                >
                                                    <Eraser size={18} />
                                                </button>
                                                <button 
                                                    onClick={() => setDrawTool('pan')}
                                                    className={`p-1.5 rounded transition ${drawTool === 'pan' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400' : 'hover:bg-gray-100 text-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'}`}
                                                    title="Pan"
                                                >
                                                    <Hand size={18} />
                                                </button>
                                            </div>
                                            <div className="pl-2 flex items-center space-x-1 shrink-0 border-r border-gray-200 dark:border-gray-700 pr-2">
                                                <button 
                                                    onClick={handleUndo}
                                                    disabled={!activePage || activePage.drawings.length === 0}
                                                    className="p-1.5 rounded text-gray-500 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed dark:text-gray-400 dark:hover:text-gray-100"
                                                    title="Undo"
                                                >
                                                    <Undo size={18} />
                                                </button>
                                                <button 
                                                    onClick={handleRedo}
                                                    disabled={redoStack.length === 0}
                                                    className="p-1.5 rounded text-gray-500 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed dark:text-gray-400 dark:hover:text-gray-100"
                                                    title="Redo"
                                                >
                                                    <Redo size={18} />
                                                </button>
                                            </div>
                                            <div className="pl-2 flex items-center space-x-1 bg-gray-100 dark:bg-gray-700 rounded px-1 group relative">
                                                <button onClick={() => setStageScale(Math.max(0.1, stageScale - 0.1))} className="p-1 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"><ZoomOut size={16}/></button>
                                                <span className="text-xs font-mono w-10 text-center">{Math.round(stageScale * 100)}%</span>
                                                <button onClick={() => setStageScale(Math.min(5.0, stageScale + 0.1))} className="p-1 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"><ZoomIn size={16}/></button>
                                            </div>
                                        </div>
                                    )}
                                    <Stage
                                        width={dimensions.width}
                                        height={dimensions.height}
                                        onWheel={handleWheel}
                                        scaleX={stageScale}
                                        scaleY={stageScale}
                                        x={stagePos.x}
                                        y={stagePos.y}
                                        draggable={drawTool === 'pan'}
                                        onDragEnd={(e) => {
                                            setStagePos({ x: e.target.x(), y: e.target.y() });
                                        }}
                                        onMouseDown={handleMouseDown}
                                        onMouseMove={handleMouseMove}
                                        onMouseUp={handleMouseUp}
                                        onTouchStart={handleTouchStart}
                                        onTouchMove={handleTouchMove}
                                        onTouchEnd={handleTouchEnd}
                                        onMouseLeave={() => setEraserPos(null)}
                                        className={drawTool === 'pan' ? 'cursor-grab active:cursor-grabbing' : (drawTool === 'eraser' ? 'cursor-crosshair' : 'cursor-default')}
                                    >
                                        <Layer>
                                            {(activePage.canvasImages || []).map(img => (
                                                <CanvasImageRenderer 
                                                    key={img.id}
                                                    imageState={img}
                                                    isSelected={img.id === selectedNodeId}
                                                    onSelect={() => setSelectedNodeId(img.id)}
                                                    onChange={(newAttrs) => updateCanvasImage(img.id, newAttrs)}
                                                    onDelete={() => {
                                                        const newImages = activePage.canvasImages?.filter(i => i.id !== img.id) || [];
                                                        updateActivePage({ canvasImages: newImages });
                                                        setSelectedNodeId(null);
                                                    }}
                                                />
                                            ))}
                                            {activePage.drawings.map((line) => (
                                                <Line
                                                    key={line.id}
                                                    points={line.points}
                                                    stroke={line.tool === 'eraser' ? (document.documentElement.classList.contains('dark') ? '#000' : '#fff') : line.color}
                                                    strokeWidth={line.width}
                                                    tension={0.5}
                                                    lineCap="round"
                                                    lineJoin="round"
                                                    globalCompositeOperation={
                                                        line.tool === 'eraser' ? 'destination-out' : 'source-over'
                                                    }
                                                />
                                            ))}
                                            {drawTool === 'eraser' && eraserPos && (
                                                <Circle
                                                    x={eraserPos.x}
                                                    y={eraserPos.y}
                                                    radius={drawWidth / 2}
                                                    stroke={document.documentElement.classList.contains('dark') ? '#f3f4f6' : '#1f2937'}
                                                    strokeWidth={1.5 / stageScale}
                                                    fill="rgba(156, 163, 175, 0.35)"
                                                    listening={false}
                                                />
                                            )}
                                        </Layer>
                                    </Stage>
                                </>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
                        <Book size={48} className="mb-4 opacity-20" />
                        <h3 className="text-xl font-medium mb-2">No Page Selected</h3>
                        <p>Create a subject and add a page to start noting or drawing.</p>
                    </div>
                )}
            </div>

            {/* Custom Safe Deletion Confirmation Overlay Modal */}
            {confirmDelete && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-gray-100 dark:border-gray-800 transform scale-100 transition-all">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                            Delete {confirmDelete.type === 'subject' ? 'Subject' : 'Page'}?
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
                            Are you sure you want to delete <span className="font-semibold text-gray-700 dark:text-gray-300">"{confirmDelete.title}"</span>? This action cannot be undone.
                        </p>
                        <div className="flex justify-end space-x-3">
                            <button
                                onClick={() => setConfirmDelete(null)}
                                className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    if (confirmDelete.type === 'subject') {
                                        setSubjects(prev => prev.filter(s => s.id !== confirmDelete.subjectId));
                                        if (activeSubjectId === confirmDelete.subjectId) {
                                            const remaining = subjects.filter(s => s.id !== confirmDelete.subjectId);
                                            setActiveSubjectId(remaining[0]?.id || null);
                                            setActivePageId(remaining[0]?.pages[0]?.id || null);
                                        }
                                    } else {
                                        const sub = subjects.find(s => s.id === confirmDelete.subjectId);
                                        if (sub) {
                                            const newPages = sub.pages.filter(p => p.id !== confirmDelete.pageId);
                                            updateSubject(confirmDelete.subjectId, { pages: newPages });
                                            if (activePageId === confirmDelete.pageId) {
                                                setActivePageId(newPages[0]?.id || null);
                                            }
                                        }
                                    }
                                    setConfirmDelete(null);
                                }}
                                className="px-4 py-2 text-sm font-medium text-white bg-red-650 hover:bg-red-750 bg-red-600 hover:bg-red-700 rounded-lg transition"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
