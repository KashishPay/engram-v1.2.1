
import React, { useState, useRef, useEffect } from 'react';
import { Send, ArrowLeft, Sparkles, StopCircle, Copy, Check, RotateCw, ChevronDown, Hash } from 'lucide-react';
import { Topic } from '../types';
import { chatWithNotesStream } from '../services/gemini';
import { ensureTopicContent, getChatFromIDB, saveChatToIDB } from '../services/storage';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

interface ChatViewProps {
    topic: Topic | null;
    userId: string;
    navigateTo: (view: string, data?: any) => void;
    themeColor: string;
}

interface Message {
    id: string;
    role: 'user' | 'model';
    text: string;
    timestamp?: number;
    isStreaming?: boolean;
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

export const ChatView: React.FC<ChatViewProps> = ({ topic, userId, navigateTo, themeColor }) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
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
                const cleanMessages = messages.map(({isStreaming, ...msg}) => msg);
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

    const handleSend = async () => {
        if (!input.trim() || !topic || isTyping) return;

        const userMsg: Message = { id: Date.now().toString(), role: 'user', text: input.trim(), timestamp: Date.now() };
        const botMsgId = (Date.now() + 1).toString();
        const initialBotMsg: Message = { id: botMsgId, role: 'model', text: '', timestamp: Date.now(), isStreaming: true };
        
        setMessages(prev => [...prev, userMsg, initialBotMsg]);
        setInput('');
        setIsTyping(true);

        const history = messages.map(m => ({ role: m.role, text: m.text }));

        try {
            let accumulatedText = "";
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
                }
            );
            setMessages(prev => prev.map(msg => 
                msg.id === botMsgId ? { ...msg, isStreaming: false } : msg
            ));
        } catch (error) {
            console.error(error);
            setMessages(prev => prev.map(msg => 
                msg.id === botMsgId 
                    ? { ...msg, text: msg.text + "\n\n*[Connection error. Please try again.]*", isStreaming: false } 
                    : msg
            ));
        } finally {
            setIsTyping(false);
        }
    };

    if (!topic) return <div>Error: No topic selected</div>;

    // Use flex-1 to fill the parent container completely
    return (
        <div className="flex flex-col flex-1 h-full w-full bg-white dark:bg-gray-900 overflow-hidden relative">
            {/* Header */}
            <div className="flex items-center space-x-3 p-3 border-b border-gray-100 dark:border-gray-800 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md shrink-0 z-30 relative">
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
                                <div 
                                    id={`msg-${msg.id}`}
                                    key={msg.id || idx} 
                                    className={`w-full py-3 px-4 border-b border-gray-50 dark:border-gray-800/50 transition-colors duration-1000 ${isUser ? 'bg-gray-50/50 dark:bg-gray-800/20' : 'bg-white dark:bg-gray-900'}`}
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
                                            <ReactMarkdown 
                                                remarkPlugins={[remarkGfm, remarkMath]}
                                                rehypePlugins={[rehypeKatex]}
                                                components={{
                                                    table: ({node, ...props}) => <div className="overflow-x-auto my-3 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm"><table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900" {...props} /></div>,
                                                    th: ({node, ...props}) => <th className="px-3 py-2 bg-gray-50 dark:bg-gray-800 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700" {...props} />,
                                                    td: ({node, ...props}) => <td className="px-3 py-2 text-sm border-b border-gray-100 dark:border-gray-800 last:border-0 text-gray-700 dark:text-gray-300" {...props} />,
                                                    code: ({node, className, children, ...props}: any) => {
                                                        const match = /language-(\w+)/.exec(className || '')
                                                        return match ? (
                                                            <div className="rounded-lg bg-gray-900 text-gray-100 overflow-hidden my-3 shadow-sm border border-gray-800 text-xs">
                                                                <div className="px-3 py-1 bg-gray-800 text-[9px] uppercase font-bold text-gray-400 border-b border-gray-700">
                                                                    {match[1]}
                                                                </div>
                                                                <div className="p-3 overflow-x-auto">
                                                                    <code className={className} {...props}>{children}</code>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <code className="px-1 py-0.5 rounded font-mono text-xs bg-gray-100 dark:bg-gray-800 text-red-600 dark:text-red-400 border border-gray-200 dark:border-gray-700" {...props}>{children}</code>
                                                        )
                                                    },
                                                    p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                                                    ul: ({node, ...props}) => <ul className="list-disc list-outside ml-4 mb-2 space-y-1" {...props} />,
                                                    ol: ({node, ...props}) => <ol className="list-decimal list-outside ml-4 mb-2 space-y-1" {...props} />,
                                                    li: ({node, ...props}) => <li className="pl-1" {...props} />,
                                                    a: ({node, ...props}) => <a className={`underline text-${themeColor}-600 dark:text-${themeColor}-400 hover:text-${themeColor}-700`} {...props} />,
                                                    blockquote: ({node, ...props}) => <blockquote className="border-l-2 border-gray-300 dark:border-gray-600 pl-3 italic my-2 text-gray-500 dark:text-gray-400" {...props} />,
                                                    hr: ({node, ...props}) => <hr className="my-4 border-gray-200 dark:border-gray-800" {...props} />,
                                                }}
                                            >
                                                {msg.text || (msg.isStreaming ? "▋" : "")}
                                            </ReactMarkdown>
                                            {msg.isStreaming && <span className="inline-block w-2 h-4 ml-1 bg-current animate-pulse align-middle opacity-50"/>}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </>
                )}
                <div className="h-2" />
            </div>

            {/* Input Area */}
            <div className="shrink-0 p-3 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 z-20 safe-area-bottom">
                <div className="max-w-3xl mx-auto relative">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !isTyping && handleSend()}
                        placeholder={!fullNotes ? "Loading notes..." : "Ask a question..."}
                        className="w-full bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl py-3 pl-4 pr-12 outline-none focus:ring-2 focus:ring-blue-500/50 transition shadow-sm border border-transparent focus:border-blue-500/50 placeholder-gray-400 text-sm"
                        disabled={isTyping || !fullNotes}
                        autoFocus
                    />
                    <button 
                        onClick={handleSend}
                        disabled={!input.trim() || isTyping || !fullNotes}
                        className={`absolute right-1.5 top-1/2 -translate-y-1/2 p-2 rounded-lg transition ${
                            !input.trim() || isTyping
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
