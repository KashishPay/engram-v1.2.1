import React, { useState, useEffect, useRef } from 'react';
import { Image as ImageIcon, Loader, Layers, Plus, Trash2, RotateCw } from 'lucide-react';
import { getImageFromIDB, saveImageToIDB } from '../services/storage';
import { ImageViewer } from './ImageViewer';
import katex from 'katex';
import DOMPurify from 'dompurify';
import { jsonrepair } from 'jsonrepair';
import { getAiClient } from '../services/gemini';

interface NotesRendererProps {
  content: string;
  onRenderError?: () => void;
  // Optional style override to prevent [STYLE] tag stripping if handled externally
  className?: string; 
  adCount?: number;
}

// --- Helper Components ---

const InlineImage: React.FC<{ imageId: string, description: string }> = ({ imageId, description }) => {
    const [src, setSrc] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [isViewerOpen, setIsViewerOpen] = useState(false);

    useEffect(() => {
        let active = true;
        getImageFromIDB(imageId).then(base64 => {
            if (active && base64) {
                setSrc(`data:image/jpeg;base64,${base64}`);
            }
            if (active) setLoading(false);
        });
        return () => { active = false; };
    }, [imageId]);

    const handleRotate = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!src) return;
        
        const img = new window.Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.height;
            canvas.height = img.width;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate(Math.PI / 2);
            ctx.drawImage(img, -img.width / 2, -img.height / 2);
            
            const newSrc = canvas.toDataURL('image/jpeg');
            setSrc(newSrc);
            
            const base64 = newSrc.split(',')[1];
            saveImageToIDB(imageId, base64);
        };
        img.src = src;
    };

    if (loading) return <div className="h-48 w-full bg-gray-50 dark:bg-gray-800 rounded-xl animate-pulse flex items-center justify-center border border-gray-100 dark:border-gray-700 my-4"><Loader size={20} className="animate-spin text-gray-300"/></div>;
    
    if (!src) return (
        <div className="my-6 p-5 bg-gray-50 dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-700 rounded-xl flex items-center gap-4">
            <div className="p-3 bg-white dark:bg-gray-700 rounded-full text-gray-400 shadow-sm">
                <ImageIcon size={24} />
            </div>
            <div>
                <p className="text-sm font-bold text-gray-700 dark:text-gray-300">Figure identified</p>
                <p className="text-xs text-gray-500 italic mt-0.5">{description}</p>
            </div>
        </div>
    );

    return (
        <>
            <div 
                className="my-8 group relative rounded-2xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 cursor-zoom-in hover:shadow-md transition-all duration-300"
                onClick={(e) => { e.stopPropagation(); setIsViewerOpen(true); }}
            >
                <div className="absolute top-3 left-3 z-10 flex space-x-2">
                    <span className="bg-black/70 backdrop-blur-md text-white text-[10px] font-bold px-2.5 py-1.5 rounded-lg border border-white/10 flex items-center shadow-lg">
                        <Layers size={12} className="mr-1.5"/> AI Crop
                    </span>
                </div>
                <div className="absolute top-3 right-3 z-10 flex space-x-2">
                    <button
                        onClick={handleRotate}
                        className="bg-black/70 hover:bg-black backdrop-blur-md text-white px-2.5 py-1.5 rounded-lg border border-white/10 flex items-center shadow-lg transition-colors cursor-pointer"
                        title="Rotate Image"
                    >
                        <RotateCw size={14} className="mr-1"/> Rotate
                    </button>
                </div>
                
                <div className="relative bg-white dark:bg-black/20 p-2">
                    <img src={src} alt={description} className="w-full h-auto max-h-[400px] object-contain mx-auto rounded-lg" />
                </div>

                <div className="p-4 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700">
                    <p className="text-sm text-gray-600 dark:text-gray-300 font-medium italic text-center leading-relaxed">
                        {description}
                    </p>
                </div>
            </div>

            {isViewerOpen && (
                <ImageViewer 
                    src={src} 
                    alt={description}
                    onClose={() => setIsViewerOpen(false)}
                />
            )}
        </>
    );
};

// --- Rendering Logic ---

const sanitizeConfig = {
    ADD_TAGS: ['math', 'annotation', 'semantics', 'mtext', 'mn', 'mo', 'mi', 'msup', 'msub', 'mfrac', 'span', 'div'],
    ADD_ATTR: ['xmlns', 'display', 'mathvariant', 'class']
};

function decodeMathEntities(src: string): string {
  let out = src;
  for (let i = 0; i < 2; i++) {
    const prev = out;
    out = out
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&(nbsp|#160|#xA0);/gi, ' ');
    if (out === prev) break;
  }
  return out;
}

function harmonizeBodyTokens(src: string): string {
  const texts: string[] = [];
  let protectedSrc = src.replace(/\\text\{([\s\S]*?)\}/g, (_m, inner) => {
    const i = texts.push(inner) - 1;
    return `__TEXT_SEG_${i}__`;
  });

  protectedSrc = protectedSrc
    .replace(/(^|[^\\])\b(quad|qquad)\b/g, (_m, pre, token) => `${pre}\\${token}`)
    .replace(/(^|[^\\])\btimes\b/g, (_m, pre) => `${pre}\\times`)
    .replace(/(^|[^\\])\bhline\b/g, (_m, pre) => `${pre}\\hline`);

  const restored = protectedSrc.replace(/__TEXT_SEG_(\d+)__/g, (_m, idx) => `\\text{${texts[+idx]}}`);
  return restored;
}

function repairArrayColspec(block: string): string {
  const m = block.match(/\\begin\s*\{\s*array\s*\}\s*\{((?:[^{}]|(?:@|!)\{[^}]*\})*)\}/);
  if (!m) return block;
  const colspec = m[1];
  if (/(@|!)\{[^}]*\{/.test(colspec)) return block;

  const headerRe = /\\begin\s*\{\s*array\s*\}\s*\{(?:[^{}]|(?:@|!)\{[^}]*\})*\}/;
  const body = block.replace(headerRe, '').trim();
  const firstRow = (body.split(/\\\\|\\hline/)[0] ?? '');
  const colCount = ((firstRow.match(/&/g)?.length) ?? 0) + 1;

  const tokens: string[] = [];
  const tokRe = /(@\{[^}]*\}|!\{[^}]*\}|[lcr]|\|)/g;
  let t: RegExpExecArray | null;
  while ((t = tokRe.exec(colspec)) !== null) {
    const tok = t[0];
    if (tok.startsWith('@{') || tok.startsWith('!{')) {
      const opener = tok.slice(0, 2);
      const inner = tok.slice(2, -1).trim();
      const dec = decodeMathEntities(inner)
        .replace(/\\\(|\\\)/g, '')
        .replace(/(^|[^\\])\b(quad|qquad)\b/g, (_m, pre, w) => `${pre}\\${w}`)
        .replace(/,/g, '\\,')
        .replace(/;/g, '\\;')
        .replace(/:/g, '\\:');
      tokens.push(`${opener}${dec}}`);
    } else {
      tokens.push(tok); 
    }
  }

  const isAlign = (x: string) => x === 'l' || x === 'c' || x === 'r';
  const alignCount = tokens.filter(isAlign).length;

  if (alignCount < colCount) {
    const pad = colCount - alignCount;
    for (let i = 0; i < pad; i++) tokens.push('r'); 
  } else if (alignCount > colCount) {
    let toTrim = alignCount - colCount;
    for (let i = tokens.length - 1; i >= 0 && toTrim > 0; i--) {
      if (isAlign(tokens[i])) {
        tokens.splice(i, 1);
        toTrim--;
      }
    }
  }

  const newSpec = tokens.join('');
  return block.replace(/\\begin\s*\{\s*array\s*\}\s*\{((?:[^{}]|(?:@|!)\{[^}]*\})*)\}/, `\\begin{array}{${newSpec}}`);
}

function normalizeArrayPreambleSafe(latex: string): string {
    const match = latex.match(/(\\begin\s*\{\s*array\s*\})/);
    if (!match) return latex;

    const header = match[1];
    const headerIndex = match.index!;
    const contentStartIndex = headerIndex + header.length;
    
    const afterHeader = latex.slice(contentStartIndex);
    const trimmedStart = afterHeader.trimStart();

    if (trimmedStart.startsWith('{')) return latex;

    let colspecEndIndex = 0;
    let depth = 0;

    for (let i = 0; i < afterHeader.length; i++) {
        const char = afterHeader[i];
        if (i + 1 >= afterHeader.length && depth === 0) {
            colspecEndIndex = i + 1;
            break;
        }
        const nextChar = afterHeader[i+1];
        if (depth === 0) {
            if (char === '\\' && nextChar === '\\') { colspecEndIndex = i; break; }
            if (char === '&') { colspecEndIndex = i; break; } 
            if (char === '\n') { colspecEndIndex = i; break; }
            if (char === '\\' && afterHeader.slice(i).startsWith('\\hline')) { colspecEndIndex = i; break; }
        }
        if (char === '{') depth++;
        if (char === '}') depth = Math.max(0, depth - 1);
        colspecEndIndex = i + 1;
    }

    const rawColspec = afterHeader.slice(0, colspecEndIndex);
    const remainder = afterHeader.slice(colspecEndIndex);
    if (!rawColspec.trim()) return latex;

    return latex.slice(0, contentStartIndex) + '{' + rawColspec + '}' + remainder;
}

function processBlockMath(latex: string, styleClass: string): string {
  let rawLatex = decodeMathEntities(latex);
  rawLatex = harmonizeBodyTokens(rawLatex);
  rawLatex = rawLatex.replace(/\\\\(\\|\\hline|\\times|\\quad|\\text|\\phantom|\\overline|\\bar)/g, "\\\\ $1");
  const normalized = normalizeArrayPreambleSafe(rawLatex);
  const isArray = /\\begin\s*\{\s*array\s*\}/.test(normalized);
  const safeLatex = isArray ? repairArrayColspec(normalized) : normalized;

  try {
    const html = katex.renderToString(safeLatex, {
      displayMode: true,
      throwOnError: false,
      strict: 'warn',
    });
    const sanitized = DOMPurify.sanitize(html, sanitizeConfig);
    return `<div class="overflow-x-auto w-full pb-2 mb-2 touch-pan-x touch-pan-y ${styleClass}">${sanitized}</div>`;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return `<div class="p-2 border border-red-200 bg-red-50 text-red-600 text-xs font-mono rounded overflow-x-auto" data-render-error="true"><div class="font-bold flex items-center mb-1"><span style="font-size:1.2em; margin-right:4px;">⚠️</span> LaTeX Error</div>${message}</div>`;
  }
}

function stripCodeFences(content: string): string {
  let out = content.replace(/```latex\s*([\s\S]*?)```/gi, (_, inner) => inner.trim());
  out = out.replace(/```\s*([\s\S]*?)```/g, (_, inner) => inner.trim());
  return out;
}

export const NotesRenderer: React.FC<NotesRendererProps> = React.memo(({ content, onRenderError, className }) => {
    if (!content) return null;

    useEffect(() => {
        if (onRenderError && (content.includes('data-render-error="true"') || content.includes('LaTeX Error'))) {
            onRenderError();
        }
    }, [content, onRenderError]);

    // Apply global style extraction only if needed
    let styleClass = className || '';
    let cleanContent = content;
    
    if (!className) {
        const styleMatch = content.match(/^\[STYLE: math=([a-z-]+)\]/);
        if (styleMatch) {
            styleClass = `theme-math-${styleMatch[1]}`;
            cleanContent = content.replace(/^\[STYLE: math=[a-z-]+\]\s*/, '');
        }
    }

    const captureRegex = /\[FIG_CAPTURE: (.*?) \| (.*?)\]/g; 
    const blockMathStorage: string[] = [];
    let protectedContent = stripCodeFences(cleanContent);

    protectedContent = protectedContent.replace(
        /`[^`]*?(\\begin\s*\{\s*array\s*\}[\s\S]*?\\end\s*\{\s*array\s*\})[^`]*?`/g,
        (_, inner) => inner
    );

    protectedContent = protectedContent.replace(/\\\[\s*([\s\S]*?)\s*\\\]|\$\$([\s\S]*?)\$\$/g, (match, p1, p2) => {
        const innerFormula = p1 || p2;
        const html = processBlockMath(innerFormula, styleClass);
        blockMathStorage.push(html);
        return `__BLOCK_MATH_REF_${blockMathStorage.length - 1}__`;
    });

    protectedContent = protectedContent.replace(/(\\begin\s*\{\s*array\s*\}\s*(?:\{[\s\S]*?\})?\s*(?:[\s\S]*?)\\end\s*\{\s*array\s*\})/g, (match, fullBlock) => {
        const html = processBlockMath(fullBlock, styleClass);
        blockMathStorage.push(html);
        return `__BLOCK_MATH_REF_${blockMathStorage.length - 1}__`;
    });

    const lines = protectedContent.split('\n');
    const elements: React.ReactNode[] = [];

    const renderLine = (text: string) => {
        let processedText = text.replace(/__BLOCK_MATH_REF_(\d+)__/g, (match, index) => {
            return blockMathStorage[parseInt(index)] || match;
        });

        if (/\\begin\s*\{\s*array\s*\}/.test(processedText)) {
            processedText = processedText.replace(
                /`[^`]*?(\\begin\s*\{\s*array\s*\}[\s\S]*?\\end\s*\{\s*array\s*\})[^`]*?`/g,
                (_, inner) => inner
            );
            processedText = processedText.replace(
                /(\\begin\s*\{\s*array\s*\}[\s\S]*?\\end\s*\{\s*array\s*\})/g,
                (_, fullBlock) => processBlockMath(fullBlock, styleClass)
            );
        }

        const inlineMathRegex = /\\\((.*?)\\\)|\$([\s\S]*?)\$/gs;
        processedText = processedText.replace(inlineMathRegex, (match, p1, p2) => {
            const formula = p1 || p2;
            try {
                const decodedFormula = decodeMathEntities(formula);
                const html = katex.renderToString(decodedFormula, { 
                    displayMode: false, 
                    throwOnError: false,
                    strict: 'warn'
                });
                const wrapper = styleClass ? `<span class="${styleClass}">` : '';
                const endWrapper = styleClass ? `</span>` : '';
                return `${wrapper}${html}${endWrapper}`;
            } catch (e: unknown) {
                const message = e instanceof Error ? e.message : String(e);
                return `<span class="text-red-500 font-mono text-[10px] border-b border-red-300" title="${message}" data-render-error="true">[Math Error]</span>`;
            }
        });

        processedText = processedText
            .replace(/\*\*(.*?)\*\*/g, '<strong class="text-gray-900 dark:text-white font-bold">$1</strong>')
            .replace(/_(.*?)_/g, '<em class="text-blue-600 dark:text-blue-400 not-italic">$1</em>')
            .replace(/`([^`]+)`/g, (match, inner) => {
                if (
                    /__BLOCK_MATH_REF_\d+__/.test(inner) ||
                    /<[^>]+>/.test(inner) ||
                    /\\begin\s*\{\s*array\s*\}/.test(inner) ||
                    /katex-error|katex/.test(inner)
                ) {
                    return inner;
                }
                return `<code class="bg-gray-100 dark:bg-gray-700 px-1 rounded text-red-600 dark:text-red-400 font-mono text-xs">${inner}</code>`;
            });

        return processedText;
    };

    let listBuffer: string[] = [];
    let listType: 'ul' | 'ol' | null = null;

    const flushList = () => {
        if (listBuffer.length > 0 && listType) {
            const ListTag = listType;
            elements.push(
                <ListTag key={`list-${elements.length}`} className={`mb-4 ml-4 pl-4 ${listType === 'ol' ? 'list-decimal' : 'list-disc'} marker:text-gray-400 dark:marker:text-gray-500 space-y-1`}>
                    {listBuffer.map((item, i) => (
                        <li key={i} className="pl-1 text-base leading-relaxed text-gray-700 dark:text-gray-300" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderLine(item), sanitizeConfig) }}></li>
                    ))}
                </ListTag>
            );
            listBuffer = [];
            listType = null;
        }
    };

    lines.forEach((line, index) => {
        const currentLine = line;
        const trimmed = currentLine.trim();

        const listMatch = currentLine.match(/^\s*([-*]|\d+\.)\s+(.*)/);
        if (listMatch) {
            const marker = listMatch[1];
            const content = listMatch[2];
            const type = /^\d+\./.test(marker) ? 'ol' : 'ul';

            if (listType && listType !== type) {
                flushList();
            }
            listType = type;
            listBuffer.push(content);
            return;
        } else {
            flushList();
        }

        const captureMatch = [...currentLine.matchAll(captureRegex)];
        if (captureMatch.length > 0) {
            captureMatch.forEach((match) => {
                elements.push(<InlineImage key={`img-${index}-${match[1]}`} imageId={match[1]} description={match[2]} />);
            });
            return; 
        }

        if (currentLine.startsWith('### ')) {
             elements.push(<h4 key={index} className="text-lg font-bold text-gray-800 dark:text-gray-100 mt-6 mb-3">{renderLine(currentLine.replace(/^###\s+/, ''))}</h4>);
             return;
        }
        if (currentLine.startsWith('## ')) {
             elements.push(<h3 key={index} className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-4 pb-2 border-b border-gray-100 dark:border-gray-800">{renderLine(currentLine.replace(/^##\s+/, ''))}</h3>);
             return;
        }
        if (currentLine.startsWith('# ')) {
             elements.push(<h2 key={index} className="text-2xl font-extrabold text-gray-900 dark:text-white mt-8 mb-6">{renderLine(currentLine.replace(/^#\s+/, ''))}</h2>);
             return;
        }

        if (!trimmed) {
             elements.push(<div key={index} className="h-2" />);
             return;
        }

        const parts = currentLine.split(/(__BLOCK_MATH_REF_\d+__)/g);
        parts.forEach((part, partIdx) => {
            const partTrimmed = part.trim();
            if (!partTrimmed) return;

            if (/^__BLOCK_MATH_REF_\d+__$/.test(partTrimmed)) {
                elements.push(
                    <div key={`${index}-${partIdx}`} className="my-2" dangerouslySetInnerHTML={{ __html: renderLine(partTrimmed) }}></div>
                );
            } else {
                elements.push(
                    <p key={`${index}-${partIdx}`} className="mb-4 text-base leading-relaxed text-gray-800 dark:text-gray-200" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderLine(part), sanitizeConfig) }}></p>
                );
            }
        });
    });

    flushList();

    return <div className="font-sans antialiased">{elements}</div>;
});

// --- Interactive Block Editor ---

interface InteractiveNoteEditorProps {
    content: string;
    onChange: (newContent: string) => void;
}

// Split content robustly preserving atomic math/code blocks
function splitRawContent(text: string): string[] {
    const atomPattern = /```[\s\S]*?```|\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\begin\{([a-zA-Z0-9*]+)\}[\s\S]*?\\end\{\1\}/g;
    const atoms: string[] = [];
    const protectedText = text.replace(atomPattern, (match) => {
        atoms.push(match);
        return `__ATOM_${atoms.length - 1}__`;
    });
    
    // Split by single newlines to allow granular paragraph editing
    // NotesRenderer typically treats blank lines as spacers, so preserving empty strings is fine.
    const lines = protectedText.split('\n');
    
    return lines.map(line => {
        return line.replace(/__ATOM_(\d+)__/g, (_, idx) => atoms[parseInt(idx)]);
    });
}

// Autosizing Textarea Component
const AutoTextArea: React.FC<{
    value: string,
    onChange: (val: string) => void,
    onBlur: () => void,
    onDelete?: () => void
}> = ({ value, onChange, onBlur, onDelete }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [feedback, setFeedback] = useState<string | null>(null);
    const isInitialized = useRef(false);

    useEffect(() => {
        if (ref.current && !isInitialized.current) {
            ref.current.innerText = value;
            isInitialized.current = true;
            
            // Auto focus and set cursor at end
            setTimeout(() => {
                if (ref.current) {
                    ref.current.focus();
                    try {
                        const selection = window.getSelection();
                        const range = document.createRange();
                        range.selectNodeContents(ref.current);
                        range.collapse(false);
                        selection?.removeAllRanges();
                        selection?.addRange(range);
                    } catch {
                        // ignore
                    }
                }
            }, 0);
        } else if (ref.current) {
            // Apply external changes (e.g. from handleJsonRepair)
            const currentText = ref.current.innerText.replace(/\n$/, '');
            const targetText = value.replace(/\n$/, '');
            if (currentText !== targetText) {
                 ref.current.innerText = value;
            }
        }
    }, [value]);

    const handleInput = () => {
        if (ref.current) {
            // innerText usually handles newlines well, but in some browsers it leaves a trailing newline
            let text = ref.current.innerText || '';
            // If the element is completely emptied, Chrome sometimes leaves a <br>
            if (text === '\n') text = '';
            onChange(text);
        }
    };

    const handlePaste = async (e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const blob = items[i].getAsFile();
                if (blob) {
                    e.preventDefault();
                    setFeedback('Uploading limit...');
                    const reader = new FileReader();
                    reader.onload = async (event) => {
                        const base64 = (event.target?.result as string).split(',')[1];
                        const tempId = `img_${Date.now()}_${Math.random().toString(36).substring(7)}`;
                        
                        await saveImageToIDB(tempId, base64);
                        
                        // Insert tag into text
                        const figCaptureTag = `\n[FIG_CAPTURE: ${tempId} | Pasted image]\n`;
                        
                        if (window.getSelection) {
                            const sel = window.getSelection();
                            if (sel && sel.getRangeAt && sel.rangeCount) {
                                const range = sel.getRangeAt(0);
                                range.deleteContents();
                                const textNode = document.createTextNode(figCaptureTag);
                                range.insertNode(textNode);
                                
                                range.setStartAfter(textNode);
                                range.setEndAfter(textNode);
                                sel.removeAllRanges();
                                sel.addRange(range);
                                
                                handleInput();
                                setFeedback(null);
                                return;
                            }
                        }
                        
                        // Fallback
                        onChange(value + figCaptureTag);
                        setFeedback(null);
                    };
                    reader.readAsDataURL(blob);
                    return; // exit loop after handling image
                }
            }
        }
        
        // Let standard text paste proceed but force it to be plain text
        e.preventDefault();
        const text = e.clipboardData?.getData('text/plain');
        if (text) {
            if (window.getSelection) {
                const sel = window.getSelection();
                if (sel && sel.getRangeAt && sel.rangeCount) {
                    const range = sel.getRangeAt(0);
                    range.deleteContents();
                    const textNode = document.createTextNode(text);
                    range.insertNode(textNode);
                    
                    range.setStartAfter(textNode);
                    range.setEndAfter(textNode);
                    sel.removeAllRanges();
                    sel.addRange(range);
                    
                    handleInput();
                }
            } else {
                onChange(value + text);
            }
        }
    };

    const handleJsonRepair = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        
        setFeedback('Checking...');
        let fixed = value;

        try {
            if (fixed.trim().startsWith('{') || fixed.trim().startsWith('[')) {
                fixed = jsonrepair(fixed);
            }
        } catch {
            // Error ignored
        }

        try {
            const { client } = getAiClient();
            const response = await client.models.generateContent({
                model: 'gemini-3.5-flash',
                contents: `The following text contains malformed KaTeX/LaTeX, Markdown formatting, or raw HTML exports of KaTeX that need to be reverted. I am using it in a React app with a custom KaTeX renderer that expects RAW markdown and LaTeX.
Your job is to fix any broken syntax, unclosed braces, AI hallucination artifacts, or raw HTML and convert it back to clean readable markdown.

CRITICAL RULES:
1. Maintain the raw Markdown and LaTeX notation (using \\[ ... \\], \\( ... \\)).
2. If you see raw HTML tags like <span class="katex">, <math>, or similar, you MUST convert all of that back into clean, raw LaTeX math notation (e.g. \\[ 99 \\times 999 \\]). DO NOT output HTML.
3. Remove random hallucinated characters like /.{{...}\\quad or random extra braces.
4. STRIP OUT ANY unwanted markdown symbols like excessive # markers (e.g. ###, ##), invalid punctuation, or garbage characters that corrupt the math or text content. The custom notes renderer breaks if there are unneeded # markers.
5. Do NOT wrap in markdown \`\`\` code blocks unless the original explicitly started with them.
6. ONLY return the corrected raw text. Include no conversational fluff.

Input:
${fixed}`,
            });
            let reply = response.text || fixed;
            if (!fixed.trim().startsWith('```') && reply.trim().startsWith('```')) {
                 reply = reply.replace(/^```[a-zA-Z]*\n?/g, '').replace(/```$/g, '').trim();
            }
            fixed = reply;
        } catch (error) {
            console.error("AI Repair failed, using heuristics", error);
            const openBraces = (fixed.match(/\{/g) || []).length;
            const closeBraces = (fixed.match(/\}/g) || []).length;
            if (openBraces > closeBraces) fixed += '}'.repeat(openBraces - closeBraces);

            const openBlock = (fixed.match(/\\\[/g) || []).length;
            const closeBlock = (fixed.match(/\\\]/g) || []).length;
            if (openBlock > closeBlock) fixed += '\n\\]';

            const beginMatches = [...fixed.matchAll(/\\begin\{([a-zA-Z0-9*]+)\}/g)].map(m => m[1]);
            const endMatches = [...fixed.matchAll(/\\end\{([a-zA-Z0-9*]+)\}/g)].map(m => m[1]);
            const openBlocks = [...beginMatches];
            for (const end of endMatches) {
                const idx = openBlocks.lastIndexOf(end);
                if (idx !== -1) openBlocks.splice(idx, 1);
            }
            for (let i = openBlocks.length - 1; i >= 0; i--) {
                fixed += `\n\\end{${openBlocks[i]}}`;
            }
            
            fixed = fixed.replace(/([^\\])\\(\s+)?$/gm, '$1\\\\');
        }

        if (fixed !== value && fixed) {
            onChange(fixed);
            setFeedback('Fixed!');
        } else {
            setFeedback('Looks good!');
        }
        setTimeout(() => setFeedback(null), 2000);
    };

    return (
        <div className="relative group">
            <div
                ref={ref}
                contentEditable={true}
                suppressContentEditableWarning
                onInput={handleInput}
                onPaste={handlePaste}
                onBlur={onBlur}
                className="w-full bg-transparent outline-none font-mono text-sm p-3 pb-8 rounded-lg border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/10 focus:ring-2 focus:ring-blue-500 whitespace-pre-wrap break-words min-h-[40px] appearance-none"
            />
            <button 
                onMouseDown={handleJsonRepair} 
                disabled={feedback === 'Checking...' || feedback === 'Uploading limit...'}
                className={`absolute top-2 right-2 px-2 py-1 bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 text-gray-700 dark:text-gray-200 text-[10px] font-bold rounded shadow-sm flex items-center transition-all active:scale-95 z-10 opacity-70 hover:opacity-100 backdrop-blur-sm ${feedback === 'Checking...' || feedback === 'Uploading limit...' ? 'cursor-wait opacity-100' : ''}`}
                title="Attempt to automatically repair formatting errors"
            >
                {feedback === 'Checking...' || feedback === 'Uploading limit...' ? (
                    <><svg className="animate-spin -ml-1 mr-2 h-3 w-3 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> {feedback === 'Uploading limit...' ? 'Uploading...' : 'Checking...'}</>
                ) : feedback ? feedback : <><span className="mr-1">✨</span> Refresh</>}
            </button>
            {onDelete && (
                <button
                    onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onDelete();
                    }}
                    className="absolute bottom-2 right-2 p-1.5 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-800/50 text-red-600 dark:text-red-400 rounded transition-colors"
                    title="Delete this section"
                >
                    <Trash2 size={14} />
                </button>
            )}
            <div className="absolute bottom-2 right-10 flex">
                <button 
                    onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'image/*';
                        input.onchange = async (e: Event) => {
                            const target = e.target as HTMLInputElement;
                            const file = target.files?.[0];
                            if (!file) return;

                            setFeedback('Uploading limit...');
                            const reader = new FileReader();
                            reader.onload = async (event) => {
                                const base64 = (event.target?.result as string).split(',')[1];
                                const tempId = `img_${Date.now()}_${Math.random().toString(36).substring(7)}`;
                                
                                await saveImageToIDB(tempId, base64);
                                
                                const figCaptureTag = `\n[FIG_CAPTURE: ${tempId} | Inserted image]\n`;
                                
                                onChange(value + figCaptureTag);
                                setFeedback(null);
                            };
                            reader.readAsDataURL(file);
                        };
                        input.click();
                    }}
                    className="p-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-900/30 dark:hover:bg-gray-800/50 text-gray-600 dark:text-gray-400 rounded transition-colors inline-flex items-center justify-center"
                    title="Select Photo"
                >
                    <ImageIcon size={14} />
                </button>

            </div>
        </div>
    );
};

export const InteractiveNoteEditor: React.FC<InteractiveNoteEditorProps> = ({ content, onChange }) => {
    // Helper to parse content synchronously
    const parseContent = (text: string) => {
        let clean = text;
        const styleMatch = text.match(/^\[STYLE: math=([a-z-]+)\]/);
        let extractedStyle = '';
        let extractedHeader = '';
        
        if (styleMatch) {
            extractedStyle = `theme-math-${styleMatch[1]}`;
            extractedHeader = styleMatch[0] + '\n\n';
            clean = text.replace(/^\[STYLE: math=[a-z-]+\]\s*/, '');
        }
        return {
            blocks: splitRawContent(clean),
            styleClass: extractedStyle,
            header: extractedHeader
        };
    };

    // Initialize state lazily but synchronously on first render
    const [state, setState] = useState(() => parseContent(content));
    
    // Destructure for easier usage, but keep them in sync
    const { blocks, styleClass } = state;

    const [editIndex, setEditIndex] = useState<number | null>(null);

    // Sync with external content changes (e.g. if parent updates)
    // We use a ref to avoid infinite loops if onChange triggers this
    const lastContentRef = useRef(content);
    
    useEffect(() => {
        if (content !== lastContentRef.current) {
            lastContentRef.current = content;
            setState(parseContent(content));
        }
    }, [content]);

    const handleBlockUpdate = (index: number, newVal: string) => {
        const newBlocks = [...blocks];
        newBlocks[index] = newVal;
        
        const newState = { ...state, blocks: newBlocks };
        setState(newState);
        
        // Sync to parent immediately
        onChange(newState.header + newBlocks.join('\n'));
    };

    const handleDeleteBlock = (index: number) => {
        const newBlocks = [...blocks];
        newBlocks.splice(index, 1);
        
        const newState = { ...state, blocks: newBlocks };
        setState(newState);
        setEditIndex(null);
        
        // Sync to parent immediately
        onChange(newState.header + newBlocks.join('\n'));
    };

    const handleAddBlock = () => {
        const newBlocks = [...blocks, ''];
        const newState = { ...state, blocks: newBlocks };
        setState(newState);
        setEditIndex(newBlocks.length - 1);
        onChange(newState.header + newBlocks.join('\n'));
    };

    return (
        <div className="space-y-2 pb-12">
            {blocks.map((block, idx) => (
                <div key={idx} className="relative group min-h-[24px]">
                    {editIndex === idx ? (
                        <AutoTextArea 
                            value={block}
                            onChange={(val) => handleBlockUpdate(idx, val)}
                            onBlur={() => setEditIndex(null)}
                            onDelete={() => handleDeleteBlock(idx)}
                        />
                    ) : (
                        <div 
                            onClick={(e) => {
                                setEditIndex(idx);
                                e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }}
                            className="p-1 -ml-1 rounded-lg border border-transparent hover:border-gray-200 dark:hover:border-gray-700 cursor-text transition-colors"
                        >
                            {/* If block is empty, show a placeholder space to maintain clickability */}
                            {block.trim() === '' ? <div className="h-6 opacity-20 bg-gray-100 dark:bg-gray-800 rounded"></div> : (
                                <NotesRenderer content={block} className={styleClass} />
                            )}
                        </div>
                    )}
                </div>
            ))}
            
            <button 
                onClick={handleAddBlock}
                className="w-full py-4 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition flex items-center justify-center font-bold text-sm mt-4"
            >
                <Plus size={16} className="mr-2"/> Tap to add paragraph
            </button>
        </div>
    );
};
