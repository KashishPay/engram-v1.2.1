
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Send, ArrowLeft, Sparkles, StopCircle, Copy, Check, RotateCw, ChevronDown, Hash, Download, Camera, Image as ImageIcon, X, FileText } from 'lucide-react';
import { Topic } from '../types';
import { chatWithNotesStream } from '../services/gemini';
import { ensureTopicContent, getChatFromIDB, saveChatToIDB } from '../services/storage';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { PlotComponent } from '../components/PlotComponent';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { downloadPDF, downloadFileFromBase64 } from '../utils/download';

interface ChatViewProps {
    topic: Topic | null;
    userId: string;
    navigateTo: (view: string, data?: unknown) => void;
    themeColor: string;
}

interface Message {
    id: string;
    role: 'user' | 'model' | 'ad';
    text: string;
    timestamp?: number;
    isStreaming?: boolean;
    images?: { base64: string, mimeType: string, name?: string }[];
    adContent?: {
        imageUrl?: string;
        title?: string;
        description?: string;
        link?: string;
    };
}

const CopyButton = ({ text }: { text: string }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <button 
            onClick={handleCopy} 
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition ml-2"
            title="Copy"
        >
            {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
        </button>
    );
};

const MarkdownContent = ({ text }: { text: string }) => {
    const plotMatch = text.match(/```json\s*(\{[\s\S]*?"type":\s*"plot"[\s\S]*?\})\s*```/);
    if (plotMatch) {
        try {
            const plotData = JSON.parse(plotMatch[1]);
            const markdownText = text.replace(plotMatch[0], '');
            return (
                <>
                    <ReactMarkdown 
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                        components={{
                            table: ({node, ...props}: React.ComponentPropsWithoutRef<'table'> & {node?: unknown}) => { void node; return <div className="overflow-x-auto my-3 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm touch-pan-x touch-pan-y"><table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900" {...props} /></div> },
                            th: ({node, ...props}: React.ComponentPropsWithoutRef<'th'> & {node?: unknown}) => { void node; return <th className="px-3 py-2 bg-gray-50 dark:bg-gray-800 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700" {...props} /> },
                            td: ({node, ...props}: React.ComponentPropsWithoutRef<'td'> & {node?: unknown}) => { void node; return <td className="px-3 py-2 text-sm border-b border-gray-100 dark:border-gray-800 last:border-0 text-gray-700 dark:text-gray-300" {...props} /> },
                            code: ({node, className, children, ...props}: React.ComponentPropsWithoutRef<'code'> & {node?: unknown}) => {
                                void node;
                                const match = /language-(\w+)/.exec(className || '')
                                return match ? (
                                    <div className="rounded-lg bg-gray-900 text-gray-100 overflow-hidden my-3 shadow-sm border border-gray-800 text-xs">
                                        <div className="px-3 py-1.5 bg-gray-800 flex justify-between items-center">
                                            <span className="text-[10px] font-bold text-gray-400 uppercase">{match[1]}</span>
                                        </div>
                                        <pre className="p-3 overflow-x-auto"><code>{children}</code></pre>
                                    </div>
                                ) : (
                                    <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-xs font-mono" {...props}>{children}</code>
                                );
                            }
                        }}
                    >{markdownText}</ReactMarkdown>
                    <PlotComponent data={plotData.data} title={plotData.title} xAxisLabel={plotData.xAxisLabel} yAxisLabel={plotData.yAxisLabel} />
                </>
            );
        } catch (e) {
            console.error("Failed to parse plot data", e);
        }
    }
    return (
        <ReactMarkdown 
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={{
                table: ({node, ...props}: React.ComponentPropsWithoutRef<'table'> & {node?: unknown}) => { void node; return <div className="overflow-x-auto my-3 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm touch-pan-x touch-pan-y"><table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900" {...props} /></div> },
                th: ({node, ...props}: React.ComponentPropsWithoutRef<'th'> & {node?: unknown}) => { void node; return <th className="px-3 py-2 bg-gray-50 dark:bg-gray-800 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700" {...props} /> },
                td: ({node, ...props}: React.ComponentPropsWithoutRef<'td'> & {node?: unknown}) => { void node; return <td className="px-3 py-2 text-sm border-b border-gray-100 dark:border-gray-800 last:border-0 text-gray-700 dark:text-gray-300" {...props} /> },
                code: ({node, className, children, ...props}: React.ComponentPropsWithoutRef<'code'> & {node?: unknown}) => {
                    void node;
                    const match = /language-(\w+)/.exec(className || '')
                    return match ? (
                        <div className="rounded-lg bg-gray-900 text-gray-100 overflow-hidden my-3 shadow-sm border border-gray-800 text-xs">
                            <div className="px-3 py-1.5 bg-gray-800 flex justify-between items-center">
                                <span className="text-[10px] font-bold text-gray-400 uppercase">{match[1]}</span>
                            </div>
                            <pre className="p-3 overflow-x-auto"><code>{children}</code></pre>
                        </div>
                    ) : (
                        <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-xs font-mono" {...props}>{children}</code>
                    );
                }
            }}
        >{text}</ReactMarkdown>
    );
};

const ChatInputArea: React.FC<{
    onSend: (text: string, images?: { base64: string, mimeType: string, name?: string }[]) => void;
    isTyping: boolean;
    isReady: boolean;
    themeColor: string;
}> = ({ onSend, isTyping, isReady, themeColor }) => {
    const [input, setInput] = useState('');
    const [selectedFiles, setSelectedFiles] = useState<{ base64: string, mimeType: string, name: string }[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);

    const handleSend = () => {
        if ((!input.trim() && selectedFiles.length === 0) || isTyping || !isReady) return;
        onSend(input, selectedFiles.length > 0 ? selectedFiles : undefined);
        setInput('');
        setSelectedFiles([]);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (event) => {
                if (event.target?.result && typeof event.target.result === 'string') {
                    const base64Content = event.target.result.split(',')[1];
                    setSelectedFiles(prev => [...prev, { base64: base64Content, mimeType: file.type, name: file.name }]);
                }
            };
            reader.readAsDataURL(file);
        });
        e.target.value = ''; // Reset
    };

    const removeFile = (index: number) => {
        setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    };

    return (
        <div className="shrink-0 p-3 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 z-20 safe-area-bottom">
            <div className="max-w-3xl mx-auto relative">
                {selectedFiles.length > 0 && (
                    <div className="mb-3 flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                        {selectedFiles.map((file, idx) => (
                            <div key={idx} className="relative inline-block shrink-0">
                                {file.mimeType.startsWith('image/') ? (
                                    <img 
                                        src={`data:${file.mimeType};base64,${file.base64}`} 
                                        alt="Selected" 
                                        className="h-20 w-auto rounded-lg border border-gray-200 shadow-sm object-cover" 
                                    />
                                ) : (
                                    <div className="h-20 w-20 rounded-lg border border-gray-200 shadow-sm flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-800 text-gray-500">
                                        <FileText size={24} className="mb-1" />
                                        <span className="text-[10px] w-full px-1 truncate text-center font-medium" title={file.name}>{file.name}</span>
                                    </div>
                                )}
                                <button 
                                    onClick={() => removeFile(idx)}
                                    className="absolute -top-2 -right-2 bg-gray-800 text-white rounded-full p-1 hover:bg-gray-700 transition z-10"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
                
                <input
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleFileChange}
                />
                
                <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    ref={cameraInputRef}
                    className="hidden"
                    onChange={handleFileChange}
                />

                <div className="relative flex items-center">
                    <div className="absolute left-1.5 flex gap-1">
                        <button
                            onClick={() => cameraInputRef.current?.click()}
                            disabled={isTyping || !isReady}
                            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition"
                            title="Take Photo"
                        >
                            <Camera size={18} />
                        </button>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isTyping || !isReady}
                            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition"
                            title="Upload File"
                        >
                            <ImageIcon size={18} />
                        </button>
                    </div>
                    
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !isTyping && handleSend()}
                        placeholder={!isReady ? "Loading notes..." : "Ask a question..."}
                        className="w-full bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl py-3 pl-[5.5rem] pr-12 outline-none focus:ring-2 focus:ring-blue-500/50 transition shadow-sm border border-transparent focus:border-blue-500/50 placeholder-gray-400 text-sm"
                        disabled={isTyping || !isReady}
                        autoFocus
                    />
                    
                    <button 
                        onClick={handleSend}
                        disabled={(!input.trim() && selectedFiles.length === 0) || isTyping || !isReady}
                        className={`absolute right-1.5 top-1/2 -translate-y-1/2 p-2 rounded-lg transition ${
                            (!input.trim() && selectedFiles.length === 0) || isTyping
                                ? 'text-gray-400 dark:text-gray-600' 
                                : `bg-${themeColor}-500 text-white shadow-md hover:bg-${themeColor}-600`
                        }`}
                    >
                        {isTyping ? <StopCircle size={16} className="animate-pulse" /> : <Send size={16} />}
                    </button>
                </div>
            </div>
        </div>
    );
};

export const ChatView: React.FC<ChatViewProps> = ({ topic, userId, navigateTo, themeColor }) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [isTyping, setIsTyping] = useState(false);
    const [isLoadingHistory, setIsLoadingHistory] = useState(true);
    const [showNavigator, setShowNavigator] = useState(false);
    
    const [fullNotes, setFullNotes] = useState<string>('');
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        if (scrollContainerRef.current) {
            const { scrollHeight, clientHeight } = scrollContainerRef.current;
            scrollContainerRef.current.scrollTop = scrollHeight - clientHeight;
        }
    };

    const userQuestions = messages.filter(m => m.role === 'user');

    const scrollToMessage = (id: string) => {
        setShowNavigator(false);
        const el = document.getElementById(`msg-${id}`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            // Temporary highlight effect
            el.classList.add('bg-yellow-50', 'dark:bg-yellow-900/30');
            setTimeout(() => {
                el.classList.remove('bg-yellow-50', 'dark:bg-yellow-900/30');
            }, 2000);
        }
    };

    const [isExporting, setIsExporting] = useState(false);
    const pdfExportRef = useRef<HTMLDivElement>(null);

    const validMessages = useMemo(() => {
        const valid: Message[] = [];
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            if (msg.role === 'user') {
                const nextMsg = messages[i+1];
                if (nextMsg && nextMsg.role === 'model' && nextMsg.text.includes('Connection error')) {
                    i++; // skip next message
                    continue;
                }
            } else if (msg.role === 'model' && msg.text.includes('Connection error')) {
                continue;
            }
            if (msg.role !== 'ad') {
                valid.push(msg);
            }
        }
        return valid;
    }, [messages]);

    const handleDownloadPdf = async () => {
        if (!topic || !pdfExportRef.current) return;
        setIsExporting(true);
        try {
            // Provide a tiny delay to allow React to render the hidden container if it needs to
            await new Promise(res => setTimeout(res, 100));
            
            const element = pdfExportRef.current;
            const canvas = await html2canvas(element, { 
                scale: 2, 
                useCORS: true, 
                logging: false,
                backgroundColor: '#ffffff' 
            });
            
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = 210;
            const pdfHeight = 297;
            const margin = 10;
            const footerHeight = 15;
            const usableWidth = pdfWidth - margin * 2;
            const usableHeight = pdfHeight - margin - footerHeight - 5; // 5mm extra gap
            
            // Calculate HTML chunk height based on usable aspect ratio
            const htmlWidth = canvas.width;
            const htmlChunkHeight = Math.floor(htmlWidth * (usableHeight / usableWidth));
            
            let currentY = 0;
            let pageNum = 1;
            
            // Load logo
            const logoImg = new Image();
            logoImg.src = '/brand/engram_logo/engram_logo_128.png';
            await new Promise(res => {
                logoImg.onload = res;
                logoImg.onerror = res;
            });

            while (currentY < canvas.height) {
                if (pageNum > 1) {
                    pdf.addPage();
                }
                
                // Create a temporary canvas for the slice
                const sliceCanvas = document.createElement('canvas');
                sliceCanvas.width = htmlWidth;
                const remainingHeight = canvas.height - currentY;
                const sliceHeight = Math.min(htmlChunkHeight, remainingHeight);
                sliceCanvas.height = sliceHeight;
                
                const ctx = sliceCanvas.getContext('2d');
                if (ctx) {
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
                    ctx.drawImage(
                        canvas,
                        0, currentY, htmlWidth, sliceHeight,
                        0, 0, htmlWidth, sliceHeight
                    );
                }
                
                const sliceDataUrl = sliceCanvas.toDataURL('image/jpeg', 0.95);
                const printHeight = usableHeight * (sliceHeight / htmlChunkHeight);
                
                pdf.addImage(sliceDataUrl, 'JPEG', margin, margin, usableWidth, printHeight);
                
                // Add Footer
                pdf.setDrawColor(230, 230, 230);
                pdf.line(margin, pdfHeight - footerHeight, pdfWidth - margin, pdfHeight - footerHeight);
                
                let logoOffset = 0;
                if (logoImg.width > 0) {
                    pdf.addImage(logoImg, 'PNG', margin, pdfHeight - footerHeight + 4, 6, 6);
                    logoOffset = 8;
                }
                
                pdf.setFontSize(9);
                pdf.setTextColor(120, 120, 120);
                const footerText = "Engram: A self-help AI company that organizes your workflow.";
                pdf.text(footerText, margin + logoOffset, pdfHeight - footerHeight + 8.5);
                
                // Add hyperlink covering logo and text
                const textWidthLink = (pdf.getStringUnitWidth(footerText) * 9) / pdf.internal.scaleFactor;
                pdf.link(margin, pdfHeight - footerHeight + 2, logoOffset + textWidthLink, 12, { url: 'https://engram-space.vercel.app/' });
                
                const pageText = `Page ${pageNum}`;
                const textWidth = pdf.getStringUnitWidth(pageText) * 9 / pdf.internal.scaleFactor;
                pdf.text(pageText, pdfWidth - margin - textWidth, pdfHeight - footerHeight + 8.5);
                
                currentY += htmlChunkHeight;
                pageNum++;
            }
            
            const dateStr = new Date().toISOString().split('T')[0];
            const safeSubject = topic.subject.replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || 'General';
            const filename = `Chat_${topic.topicName.replace(/[^a-z0-9]/gi, '_')}_${dateStr}.pdf`;

            await downloadPDF(pdf, filename, {
                folderPath: `Engram/${safeSubject}`
            });
        } catch (e) {
            console.error("PDF generation failed:", e);
        } finally {
            setIsExporting(false);
        }
    };

    useEffect(() => {
        if (!topic) return;
        const init = async () => {
            setIsLoadingHistory(true);
            try {
                const history = await getChatFromIDB(userId, topic.id);
                if (history && history.length > 0) {
                    setMessages(history);
                } else {
                    setMessages([{ 
                        id: 'welcome', 
                        role: 'model', 
                        text: `Hi! I've analyzed your notes on "**${topic.topicName}**".\n\nI'm ready to help you understand key concepts, solve problems, or explain formulas. What would you like to focus on?`,
                        timestamp: Date.now() 
                    }]);
                }
                const hydrated = await ensureTopicContent(userId, topic);
                setFullNotes(hydrated.shortNotes || "");
            } catch (e) {
                console.warn("Chat initialization failed", e);
            } finally {
                setIsLoadingHistory(false);
            }
        };
        init();
    }, [topic, userId]);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (messages.length > 0 && topic && !isTyping) {
                const cleanMessages = messages.map((m) => {
                    const { isStreaming: _, ...msg } = m;
                    void _;
                    return msg;
                });
                saveChatToIDB(userId, topic.id, cleanMessages).catch(err => 
                    console.warn("Failed to persist chat", err)
                );
            }
        }, 1000);
        return () => clearTimeout(timer);
    }, [messages, topic, userId, isTyping]);

    useEffect(() => {
        // Only auto-scroll if we are NOT using the navigator (navigator implies manual seek)
        if (!showNavigator) {
            scrollToBottom();
        }
    }, [messages.length, isTyping]);

    useEffect(() => {
        return () => {
        };
    }, []);

    const handleSend = async (textToSend: string, images?: { base64: string, mimeType: string }[]) => {
        if ((!textToSend.trim() && !images) || !topic || isTyping) return;

        const userMsg: Message = { id: Date.now().toString(), role: 'user', text: textToSend.trim(), timestamp: Date.now(), images };
        
        const botMsgId = (Date.now() + 1).toString();
        const initialBotMsg: Message = { id: botMsgId, role: 'model', text: '', timestamp: Date.now(), isStreaming: true };
        
        setMessages(prev => [...prev, userMsg, initialBotMsg]);
        setIsTyping(true);

        const history = messages.filter(m => m.role !== 'ad').map(m => ({ role: m.role, text: m.text, images: m.images }));

        let attempts = 0;
        const maxAttempts = 3;
        let success = false;

        while (attempts < maxAttempts && !success) {
            attempts++;
            try {
                let accumulatedText = "";
                // Fallback to lighter model on retries
                let fallbackModel: string | undefined = undefined;
                if (attempts > 1) {
                    fallbackModel = 'gemini-3.5-flash';
                }

                await chatWithNotesStream(
                    history,
                    userMsg.text,
                    fullNotes,
                    topic.subject,
                    'chat',
                    (chunk) => {
                        accumulatedText += chunk;
                        setMessages(prev => prev.map(msg => 
                            msg.id === botMsgId 
                                ? { ...msg, text: accumulatedText } 
                                : msg
                        ));
                        if (scrollContainerRef.current) {
                            const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
                            if (scrollHeight - scrollTop - clientHeight < 100) {
                                scrollContainerRef.current.scrollTop = scrollHeight;
                            }
                        }
                    },
                    fallbackModel,
                    images
                );
                success = true;
                setMessages(prev => prev.map(msg => 
                    msg.id === botMsgId ? { ...msg, isStreaming: false } : msg
                ));
            } catch (error) {
                console.error(`Attempt ${attempts} failed:`, error);
                if (attempts === maxAttempts) {
                    setMessages(prev => prev.map(msg => 
                        msg.id === botMsgId 
                            ? { ...msg, text: msg.text + "\n\n*[Connection error. Please try again.]*", isStreaming: false } 
                            : msg
                    ));
                } else {
                    // Exponential backoff
                    const delay = Math.pow(2, attempts) * 1000 + Math.random() * 1000;
                    setMessages(prev => prev.map(msg => 
                        msg.id === botMsgId 
                            ? { ...msg, text: msg.text + `\n\n*[Connection error. Retrying... (${attempts}/${maxAttempts})]*\n\n` } // Show retry
                            : msg
                    ));
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        
        setIsTyping(false);
    };

    if (!topic) return <div>Error: No topic selected</div>;

    // Use flex-1 to fill the parent container completely
    return (
        <div className="flex flex-col flex-1 h-full w-full bg-white dark:bg-gray-900 overflow-hidden relative">
            {/* Header */}
            <div 
                className="flex items-center space-x-3 px-3 pb-3 border-b border-gray-100 dark:border-gray-800 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md shrink-0 z-30 relative"
                style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))' }}
            >
                <button onClick={() => navigateTo('topicDetail', topic)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition">
                    <ArrowLeft size={20} />
                </button>
                <div className="flex-1 min-w-0">
                    <h2 className={`text-base font-bold text-gray-900 dark:text-white flex items-center`}>
                        <Sparkles size={14} className={`text-${themeColor}-500 mr-2`} />
                        AI Tutor
                    </h2>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                        {topic.topicName}
                    </p>
                </div>
                
                <button 
                    onClick={handleDownloadPdf}
                    disabled={isExporting}
                    className={`flex items-center justify-center p-2 rounded-lg ${isExporting ? 'bg-gray-200 dark:bg-gray-700 opacity-50' : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'} text-gray-700 dark:text-gray-300 transition shrink-0 mr-1`}
                    title="Download Chat PDF"
                >
                    {isExporting ? <RotateCw size={16} className="animate-spin" /> : <Download size={16} />}
                </button>

                {/* Navigator Dropdown - shrink-0 ensures it's never hidden */}
                <div className="relative shrink-0">
                    <button 
                        onClick={() => setShowNavigator(!showNavigator)}
                        className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs font-bold hover:bg-gray-200 dark:hover:bg-gray-700 transition`}
                        title="Jump to Question"
                    >
                        <Hash size={14} className="opacity-70" />
                        <span>{userQuestions.length}</span>
                        <ChevronDown size={14} className={`opacity-70 transition-transform duration-200 ${showNavigator ? 'rotate-180' : ''}`}/>
                    </button>

                    {showNavigator && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setShowNavigator(false)} />
                            <div className="absolute right-0 top-full mt-2 w-64 max-h-[60vh] overflow-y-auto bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 z-50 py-2 custom-scrollbar animate-in fade-in slide-in-from-top-2">
                                <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700 mb-1 flex justify-between items-center">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Navigator</p>
                                    <span className="text-[10px] text-gray-400">{userQuestions.length} Qs</span>
                                </div>
                                {userQuestions.length === 0 ? (
                                    <p className="px-4 py-3 text-xs text-gray-400 italic">No questions asked yet.</p>
                                ) : (
                                    userQuestions.map((q, i) => (
                                        <button 
                                            key={q.id}
                                            onClick={() => scrollToMessage(q.id)}
                                            className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-start space-x-3 transition group border-b border-gray-50 dark:border-gray-800 last:border-0"
                                        >
                                            <span className={`shrink-0 text-[10px] font-bold bg-${themeColor}-100 text-${themeColor}-700 dark:bg-${themeColor}-900/50 dark:text-${themeColor}-300 px-1.5 py-0.5 rounded mt-0.5 group-hover:scale-105 transition`}>Q{i+1}</span>
                                            <span className="text-xs text-gray-700 dark:text-gray-200 truncate leading-relaxed line-clamp-2">{q.text}</span>
                                        </button>
                                    ))
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Scrollable Messages Area - Compact Linear Layout */}
            <div 
                ref={scrollContainerRef}
                className="flex-1 overflow-y-auto min-h-0 bg-white dark:bg-gray-900 scroll-smooth no-scrollbar relative z-0"
            >
                {isLoadingHistory ? (
                    <div className="flex items-center justify-center h-40">
                        <RotateCw className={`animate-spin text-${themeColor}-600`} />
                    </div>
                ) : (
                    <>
                        {messages.map((msg, idx) => {
                            const isUser = msg.role === 'user';
                            
                            // Determine Question Number
                            const qIndex = isUser ? userQuestions.findIndex(q => q.id === msg.id) + 1 : null;

                            return (
                                <React.Fragment key={msg.id || idx}>
                                    <div 
                                        id={`msg-${msg.id}`}
                                        className={`w-full py-3 px-4 border-b border-gray-50 dark:border-gray-800/50 transition-colors duration-1000 ${
                                            isUser ? 'bg-gray-50/50 dark:bg-gray-800/20' : 'bg-white dark:bg-gray-900'
                                        }`}
                                    >
                                        <div className="max-w-4xl mx-auto">
                                            {/* Inline Header Row */}
                                            <div className="flex items-center mb-1 opacity-90">
                                                <span className={`text-xs font-bold uppercase tracking-wide flex items-center ${
                                                    isUser 
                                                    ? `text-${themeColor}-600 dark:text-${themeColor}-400`
                                                    : 'text-indigo-600 dark:text-indigo-400'
                                                }`}>
                                                    {isUser ? 'You' : 'AI Tutor'}
                                                    {isUser && qIndex && (
                                                        <span className={`ml-2 text-[9px] bg-${themeColor}-100 text-${themeColor}-700 dark:bg-${themeColor}-900 dark:text-${themeColor}-300 px-1.5 py-0.5 rounded-md font-mono`}>
                                                            #{qIndex}
                                                        </span>
                                                    )}
                                                </span>
                                                {!isUser && !msg.isStreaming && <CopyButton text={msg.text} />}
                                            </div>

                                            {/* Full Width Content */}
                                            <div className="markdown-body text-gray-800 dark:text-gray-200 text-sm leading-relaxed break-words pl-0">
                                                {msg.images && msg.images.length > 0 && (
                                                    <div className="flex flex-wrap gap-2 mb-3">
                                                        {msg.images.map((img, i) => (
                                                            img.mimeType.startsWith('image/') ? (
                                                                <button 
                                                                    key={i}
                                                                    onClick={() => {
                                                                        try {
                                                                            downloadFileFromBase64(
                                                                                img.base64,
                                                                                img.name || `image_${i}.jpg`,
                                                                                img.mimeType
                                                                            );
                                                                        } catch (e) {
                                                                            console.error("Failed to open image", e);
                                                                        }
                                                                    }}
                                                                    className="text-left focus:outline-none"
                                                                >
                                                                    <img 
                                                                        src={`data:${img.mimeType};base64,${img.base64}`} 
                                                                        alt="Attached" 
                                                                        className="max-h-48 w-auto rounded-lg border border-gray-200 shadow-sm transition hover:opacity-90"
                                                                    />
                                                                </button>
                                                            ) : (
                                                                <button 
                                                                    key={i} 
                                                                    onClick={() => {
                                                                        try {
                                                                            downloadFileFromBase64(
                                                                                img.base64,
                                                                                img.name || 'document.pdf',
                                                                                img.mimeType || 'application/pdf'
                                                                            );
                                                                        } catch (e) {
                                                                            console.error("Failed to download document", e);
                                                                        }
                                                                    }}
                                                                    className="flex flex-row items-center space-x-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition text-left"
                                                                >
                                                                    <FileText size={18} className="shrink-0 text-gray-500" />
                                                                    <span className="text-xs font-medium max-w-[200px] truncate" title={img.name || 'Document'}>
                                                                        {img.name || 'Document'}
                                                                    </span>
                                                                </button>
                                                            )
                                                        ))}
                                                    </div>
                                                )}
                                                <MarkdownContent text={msg.text} />
                                                {msg.isStreaming && <span className="inline-block w-2 h-4 ml-1 bg-current animate-pulse align-middle opacity-50"/>}
                                            </div>
                                        </div>
                                    </div>
                                </React.Fragment>
                            );
                        })}
                    </>
                )}
                <div className="h-2" />
            </div>

            {/* Input Area */}
            <ChatInputArea 
                onSend={handleSend}
                isTyping={isTyping}
                isReady={Boolean(fullNotes)}
                themeColor={themeColor}
            />

            {/* Hidden Export Container */}
            <div className="absolute -left-[9999px] top-0 pointer-events-none">
                <div ref={pdfExportRef} className="w-[800px] bg-white p-8 font-sans text-black" style={{ minHeight: '1000px' }}>
                    <h1 className="text-3xl font-bold mb-6 text-gray-900 border-b-2 border-gray-200 pb-4">Topic: {topic.topicName}</h1>
                    {validMessages.map((msg, i) => (
                         <div key={msg.id || i} className="mb-6 bg-gray-50 p-6 rounded-xl border border-gray-100">
                             <strong className="block text-gray-900 text-lg mb-2">{msg.role === 'user' ? 'You:' : 'AI Tutor:'}</strong>
                             <div className="prose prose-base max-w-none text-gray-800">
                                  {msg.images && msg.images.length > 0 && (
                                      <div className="flex flex-wrap gap-2 mb-4">
                                          {msg.images.map((img, imgIdx) => (
                                              <img 
                                                  key={imgIdx}
                                                  src={`data:${img.mimeType};base64,${img.base64}`} 
                                                  alt="Attached" 
                                                  className="max-h-64 w-auto rounded-lg border border-gray-200 shadow-sm"
                                              />
                                          ))}
                                      </div>
                                  )}
                                  <ReactMarkdown 
                                      remarkPlugins={[remarkGfm, remarkMath]}
                                      rehypePlugins={[rehypeKatex]}
                                      components={{
                                          table: ({node, ...props}: React.ComponentPropsWithoutRef<'table'> & {node?: unknown}) => { void node; return <div className="overflow-x-auto my-3"><table className="min-w-full divide-y divide-gray-300 bg-white border border-gray-300" {...props} /></div> },
                                          th: ({node, ...props}: React.ComponentPropsWithoutRef<'th'> & {node?: unknown}) => { void node; return <th className="px-3 py-2 bg-gray-100 text-left font-bold text-gray-800 border-b border-gray-300" {...props} /> },
                                          td: ({node, ...props}: React.ComponentPropsWithoutRef<'td'> & {node?: unknown}) => { void node; return <td className="px-3 py-2 border-b border-gray-200 text-gray-800" {...props} /> },
                                      }}
                                  >
                                      {msg.text}
                                  </ReactMarkdown>
                             </div>
                         </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
