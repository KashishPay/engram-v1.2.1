import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Image as ImageIcon, Loader, Layers, Plus } from 'lucide-react';
import { getImageFromIDB } from '../services/storage';
import { ImageViewer } from './ImageViewer';
import katex from 'katex';
import DOMPurify from 'dompurify';

interface NotesRendererProps {
  content: string;
  onRenderError?: () => void;
  // Optional style override to prevent [STYLE] tag stripping if handled externally
  className?: string; 
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
                <div className="absolute top-3 left-3 z-10">
                    <span className="bg-black/70 backdrop-blur-md text-white text-[10px] font-bold px-2.5 py-1.5 rounded-lg border border-white/10 flex items-center shadow-lg">
                        <Layers size={12} className="mr-1.5"/> AI Crop
                    </span>
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
  let alignCount = tokens.filter(isAlign).length;

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
    return `<div class="overflow-x-auto w-full pb-2 mb-2 touch-pan-x ${styleClass}">${sanitized}</div>`;
  } catch (e: any) {
    return `<div class="p-2 border border-red-200 bg-red-50 text-red-600 text-xs font-mono rounded overflow-x-auto" data-render-error="true"><div class="font-bold flex items-center mb-1"><span style="font-size:1.2em; margin-right:4px;">⚠️</span> LaTeX Error</div>${e.message}</div>`;
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

    protectedContent = protectedContent.replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (match, innerFormula) => {
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

        const inlineMathRegex = /\\\((.*?)\\\)/gs;
        processedText = processedText.replace(inlineMathRegex, (match, formula) => {
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
            } catch (e: any) {
                return `<span class="text-red-500 font-mono text-[10px] border-b border-red-300" title="${e.message}" data-render-error="true">[Math Error]</span>`;
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
        let currentLine = line;
        const trimmed = currentLine.trim();

        const listMatch = currentLine.match(/^\s*([-\*]|\d+\.)\s+(.*)/);
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
    const atomPattern = /```[\s\S]*?```|\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\begin\{([a-zA-Z0-9\*]+)\}[\s\S]*?\\end\{\1\}/g;
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
    onBlur: () => void
}> = ({ value, onChange, onBlur }) => {
    const ref = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (ref.current) {
            ref.current.style.height = 'auto';
            ref.current.style.height = ref.current.scrollHeight + 'px';
        }
    }, [value]);

    return (
        <textarea
            ref={ref}
            value={value}
            onChange={e => onChange(e.target.value)}
            onBlur={onBlur}
            autoFocus
            className="w-full bg-transparent outline-none resize-none font-mono text-sm p-3 rounded-lg border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/10"
            rows={1}
        />
    );
};

export const InteractiveNoteEditor: React.FC<InteractiveNoteEditorProps> = ({ content, onChange }) => {
    const [blocks, setBlocks] = useState<string[]>([]);
    const [editIndex, setEditIndex] = useState<number | null>(null);
    const [styleClass, setStyleClass] = useState<string>('');
    const [header, setHeader] = useState<string>('');

    // Initialization: Split content
    useEffect(() => {
        // Extract style tag if present
        let clean = content;
        const styleMatch = content.match(/^\[STYLE: math=([a-z-]+)\]/);
        let extractedStyle = '';
        let extractedHeader = '';
        
        if (styleMatch) {
            extractedStyle = `theme-math-${styleMatch[1]}`;
            extractedHeader = styleMatch[0] + '\n\n';
            clean = content.replace(/^\[STYLE: math=[a-z-]+\]\s*/, '');
        }
        
        setStyleClass(extractedStyle);
        setHeader(extractedHeader);
        setBlocks(splitRawContent(clean));
    }, [content]);

    const handleBlockUpdate = (index: number, newVal: string) => {
        const newBlocks = [...blocks];
        newBlocks[index] = newVal;
        setBlocks(newBlocks);
        // Sync to parent immediately
        onChange(header + newBlocks.join('\n'));
    };

    const handleAddBlock = () => {
        const newBlocks = [...blocks, ''];
        setBlocks(newBlocks);
        setEditIndex(newBlocks.length - 1);
        onChange(header + newBlocks.join('\n'));
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
                        />
                    ) : (
                        <div 
                            onClick={() => setEditIndex(idx)}
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
