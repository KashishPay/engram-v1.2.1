import React, { useRef, useEffect, useState } from 'react';

// Regex to extract image blocks: ![widthxheight](data:image/...) or ![...](data:image/...)
const IMAGE_REGEX = /(!\[.*?\]\(data:image\/.*?\))/g;

interface Props {
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
}

export interface VisualMarkdownEditorRef {
    insertMarkdown: (prefix: string, suffix: string) => void;
}

export const VisualMarkdownEditor = React.forwardRef<VisualMarkdownEditorRef, Props>(({ value, onChange, placeholder }, ref) => {
    // Keep track of the last focused text block
    const [lastFocusedIndex, setLastFocusedIndex] = useState<number>(0);
    // Keep track of refs to all textareas
    const textareaRefs = useRef<(HTMLTextAreaElement | null)[]>([]);

    React.useImperativeHandle(ref, () => ({
        insertMarkdown: (prefix: string, suffix: string) => {
            const index = lastFocusedIndex;
            const textarea = textareaRefs.current[index];
            if (!textarea || typeof index !== 'number') return;
            
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const currentText = parts[index] || "";
            const before = currentText.substring(0, start);
            const selection = currentText.substring(start, end);
            const after = currentText.substring(end);
            
            const newText = before + prefix + selection + suffix + after;
            
            const newParts = [...parts];
            newParts[index] = newText;
            onChange(newParts.join(''));
            
            setTimeout(() => {
                textarea.focus();
                textarea.setSelectionRange(start + prefix.length, end + prefix.length);
            }, 10);
        }
    }));

    // Split the content into blocks
    // split with capturing group includes the matches in the resulting array
    const parts = value.split(IMAGE_REGEX);

    // If it's completely empty, we still want one text block
    if (parts.length === 0 || (parts.length === 1 && parts[0] === '')) {
        parts[0] = '';
    }

    const handleBlockChange = (index: number, newVal: string) => {
        const newParts = [...parts];
        newParts[index] = newVal;
        onChange(newParts.join(''));
    };

    const handlePaste = (e: React.ClipboardEvent, blockIndex: number) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const blob = items[i].getAsFile();
                if (blob) {
                    e.preventDefault();
                    
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        const base64 = event.target?.result as string;
                        // Insert ![300xauto](base64) at cursor position in this text block
                        
                        // We need the textarea's current cursor position
                        const cursorIndex = (e.target as HTMLTextAreaElement).selectionStart || 0;
                        
                        const currentText = parts[blockIndex];
                        const before = currentText.slice(0, cursorIndex);
                        const after = currentText.slice(cursorIndex);
                        
                        // Default size 300px wide
                        const imageMarkdown = `\n![300px](` + base64 + `)\n`;
                        
                        handleBlockChange(blockIndex, before + imageMarkdown + after);
                    };
                    reader.readAsDataURL(blob);
                    return;
                }
            }
        }
    };

    return (
        <div className="w-full h-full pb-32 flex flex-col items-stretch overflow-y-auto overflow-x-hidden p-6 gap-2">
            {parts.map((part, index) => {
                const isImage = part.startsWith('![') && part.includes('](data:image/');
                
                if (isImage) {
                    return (
                        <ImageBlock 
                            key={index} 
                            markdown={part} 
                            onChange={(newMd) => {
                                // If they deleted the image completely, newMd will be empty, which merges text blocks!
                                handleBlockChange(index, newMd);
                            }}
                        />
                    );
                } else {
                    return (
                        <TextBlock
                            key={index}
                            text={part}
                            onChange={(newTxt) => handleBlockChange(index, newTxt)}
                            onPaste={(e) => handlePaste(e, index)}
                            onFocus={() => setLastFocusedIndex(index)}
                            innerRef={(el) => textareaRefs.current[index] = el}
                            placeholder={index === 0 ? placeholder : undefined}
                        />
                    );
                }
            })}
        </div>
    );
});

const TextBlock: React.FC<{
    text: string;
    onChange: (val: string) => void;
    onPaste: (e: React.ClipboardEvent) => void;
    onFocus: () => void;
    innerRef: (el: HTMLTextAreaElement | null) => void;
    placeholder?: string;
}> = ({ text, onChange, onPaste, onFocus, innerRef, placeholder }) => {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
        }
    }, [text]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter') {
            const textarea = e.currentTarget;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            
            const currentLineStart = textarea.value.lastIndexOf('\n', start - 1) + 1;
            const currentLine = textarea.value.substring(currentLineStart, start);
            
            // Match unordered lists
            const bulletMatchEmpty = currentLine.match(/^(\s*)([-*+])\s*$/);
            const bulletMatchContent = currentLine.match(/^(\s*)([-*+]\s+)/);
            
            // If the line is JUST a bullet point and user pressed enter, remove the bullet
            if (bulletMatchEmpty && currentLine.trim() === bulletMatchEmpty[2]) {
                e.preventDefault();
                const beforeLine = textarea.value.substring(0, currentLineStart);
                const afterCursor = textarea.value.substring(end);
                onChange(beforeLine + afterCursor);
                setTimeout(() => {
                    if (textareaRef.current) textareaRef.current.setSelectionRange(currentLineStart, currentLineStart);
                }, 10);
                return;
            } else if (bulletMatchContent) {
                e.preventDefault();
                const prefix = '\n' + bulletMatchContent[1] + bulletMatchContent[2];
                const beforeCursor = textarea.value.substring(0, start);
                const afterCursor = textarea.value.substring(end);
                onChange(beforeCursor + prefix + afterCursor);
                setTimeout(() => {
                    if (textareaRef.current) textareaRef.current.setSelectionRange(start + prefix.length, start + prefix.length);
                }, 10);
                return;
            }

            // Match ordered lists
            const numberMatchEmpty = currentLine.match(/^(\s*)(\d+)\.\s*$/);
            const numberMatchContent = currentLine.match(/^(\s*)(\d+)(\.\s+)/);

            if (numberMatchEmpty && currentLine.trim() === numberMatchEmpty[2] + '.') {
                e.preventDefault();
                const beforeLine = textarea.value.substring(0, currentLineStart);
                const afterCursor = textarea.value.substring(end);
                onChange(beforeLine + afterCursor);
                setTimeout(() => {
                    if (textareaRef.current) textareaRef.current.setSelectionRange(currentLineStart, currentLineStart);
                }, 10);
                return;
            } else if (numberMatchContent) {
                e.preventDefault();
                const nextNumber = parseInt(numberMatchContent[2], 10) + 1;
                const prefix = '\n' + numberMatchContent[1] + nextNumber + numberMatchContent[3];
                const beforeCursor = textarea.value.substring(0, start);
                const afterCursor = textarea.value.substring(end);
                onChange(beforeCursor + prefix + afterCursor);
                setTimeout(() => {
                    if (textareaRef.current) textareaRef.current.setSelectionRange(start + prefix.length, start + prefix.length);
                }, 10);
                return;
            }
        }
    };

    return (
        <textarea
            ref={(el) => {
                textareaRef.current = el;
                innerRef(el);
            }}
            value={text}
            onChange={(e) => {
                const val = e.target.value;
                const nativeEvent = e.nativeEvent as InputEvent;
                
                if (nativeEvent.inputType === 'insertLineBreak' || nativeEvent.inputType === 'insertParagraph' || (nativeEvent.inputType === 'insertText' && nativeEvent.data === '\n')) {
                    const start = e.target.selectionStart;
                    const previousLineStart = val.lastIndexOf('\n', start - 2) + 1;
                    const previousLine = val.substring(previousLineStart, start - 1);
                    
                    const bulletMatchEmpty = previousLine.match(/^(\s*)([-*+])\s*$/);
                    const bulletMatchContent = previousLine.match(/^(\s*)([-*+]\s+)/);
                    const numberMatchEmpty = previousLine.match(/^(\s*)(\d+)\.\s*$/);
                    const numberMatchContent = previousLine.match(/^(\s*)(\d+)(\.\s+)/);
                    
                    if (bulletMatchEmpty && previousLine.trim() === bulletMatchEmpty[2]) {
                        const newBefore = val.substring(0, previousLineStart);
                        const newAfter = val.substring(start);
                        onChange(newBefore + newAfter);
                        setTimeout(() => {
                            if (textareaRef.current) textareaRef.current.setSelectionRange(previousLineStart, previousLineStart);
                        }, 10);
                        return;
                    } else if (bulletMatchContent) {
                        const prefix = bulletMatchContent[1] + bulletMatchContent[2];
                        const newBefore = val.substring(0, start);
                        const newAfter = val.substring(start);
                        onChange(newBefore + prefix + newAfter);
                        setTimeout(() => {
                            if (textareaRef.current) textareaRef.current.setSelectionRange(start + prefix.length, start + prefix.length);
                        }, 10);
                        return;
                    } else if (numberMatchEmpty && previousLine.trim() === numberMatchEmpty[2] + '.') {
                        const newBefore = val.substring(0, previousLineStart);
                        const newAfter = val.substring(start);
                        onChange(newBefore + newAfter);
                        setTimeout(() => {
                            if (textareaRef.current) textareaRef.current.setSelectionRange(previousLineStart, previousLineStart);
                        }, 10);
                        return;
                    } else if (numberMatchContent) {
                        const nextNumber = parseInt(numberMatchContent[2], 10) + 1;
                        const prefix = numberMatchContent[1] + nextNumber + numberMatchContent[3];
                        const newBefore = val.substring(0, start);
                        const newAfter = val.substring(start);
                        onChange(newBefore + prefix + newAfter);
                        setTimeout(() => {
                            if (textareaRef.current) textareaRef.current.setSelectionRange(start + prefix.length, start + prefix.length);
                        }, 10);
                        return;
                    }
                }
                
                onChange(val);
            }}
            onPaste={onPaste}
            onFocus={onFocus}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full bg-transparent resize-none outline-none text-gray-700 dark:text-gray-300 font-mono text-sm leading-relaxed overflow-hidden min-h-[1.5em]"
        />
    );
};

const ImageBlock: React.FC<{
    markdown: string;
    onChange: (val: string) => void;
}> = ({ markdown, onChange }) => {
    // Parse ![width] or ![widthxheight]
    const match = markdown.match(/!\[(.*?)\]\((data:image\/.*?)\)/);
    const sizeData = match ? match[1] : '';
    const src = match ? match[2] : '';
    
    // Default size logic
    let w = '300px';
    if (sizeData && sizeData !== 'image') {
        const parts = sizeData.split('x');
        if (parts[0]) w = parts[0].endsWith('px') || parts[0].endsWith('%') ? parts[0] : parts[0] + 'px';
    }

    const [width, setWidth] = useState(w);
    
    const containerRef = useRef<HTMLDivElement>(null);
    const observerRef = useRef<ResizeObserver | null>(null);

    useEffect(() => {
        if (containerRef.current) {
            observerRef.current = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    const newW = entry.contentRect.width;
                    if (newW > 0) {
                        setWidth(newW + 'px');
                    }
                }
            });
            observerRef.current.observe(containerRef.current);
        }
        return () => {
            if (observerRef.current) observerRef.current.disconnect();
        };
    }, []);

    // Provide a debounce or just save on mouse up (we can save on blur / unhover for simplicity)
    const handleSaveResize = () => {
        onChange(`![${width}xauto](${src})`);
    };

    return (
        <div 
            className="relative group py-2"
            onMouseLeave={() => { handleSaveResize(); }}
        >
            <div 
                ref={containerRef}
                style={{ width, minWidth: '100px', maxWidth: '100%', resize: 'horizontal', overflow: 'hidden' }}
                className="relative inline-block border border-transparent hover:border-blue-400 dark:hover:border-blue-600 rounded p-1 transition-colors"
                title="Drag the bottom right corner to resize"
            >
                <img src={src} alt="pasted" className="w-full h-auto block rounded user-select-none pointer-events-none" />
                
                {/* Delete button overlying the image */}
                <button 
                    onClick={() => onChange('')}
                    className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                </button>
            </div>
        </div>
    );
};
