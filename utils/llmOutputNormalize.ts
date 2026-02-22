
// Post-processing for LLM text outputs to ensure rendering stability

export const normalizeLLMOutput = (text: string): string => {
    if (!text) return "";
    let clean = text;

    // 1. Strip Markdown code blocks if present (common LLM artifact)
    // Removes ```markdown or ```json at start, and ``` at end
    clean = clean.replace(/^```[a-z]*\n/i, '').replace(/\n```$/, '');

    // 2. Normalize Delimiters (Legacy/Stubborn LLM fallback)
    // Even if instructed otherwise, some models might output $$...$$.
    // We convert these to standard LaTeX \[...\] for consistency in the Renderer.
    // Note: We use 'gs' flag for dotAll (multiline math)
    clean = clean.replace(/\$\$(.*?)\$\$/gs, '\\[$1\\]');
    
    // Convert inline $...$ to \(...\)
    // We assume the prompt forbids $, so we only catch clear cases to avoid false positives (e.g. currency).
    // Matches $ followed by non-space, content, non-space, $
    clean = clean.replace(/([^\\]|^)\$([^\s$].*?[^\s$])\$/g, '$1\\($2\\)');

    return clean;
};
