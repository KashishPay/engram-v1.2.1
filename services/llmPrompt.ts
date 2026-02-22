
// Centralized Prompt Logic for OCR and Note Generation

export const getOCRPrompt = (persona?: string, styleParams?: string | null): string => {
    let prompt = `You are a study notes OCR expert. 
    1. Extract all text from this image. Use Markdown headings.
    2. **IMPORTANT**: For ANY mathematical formula, equation, or variable, you MUST use STANDARD LaTeX delimiters:
       - Use \`\\( ... \\)\` for inline math.
       - Use \`\\[ ... \\]\` for block/display math.
       - **DO NOT** use dollar signs ($ or $$).
       - Escape backslashes exactly once (e.g. \\alpha, not \\\\alpha).
    3. IF you see a diagram, figure, chart, or graph:
       - Identify its bounding box coordinates [ymin, xmin, ymax, xmax] on a scale of 0-1000.
       - Provide a short caption/description.
       - Output the specific tag: [CROP:ymin,xmin,ymax,xmax|Description].
       - Do NOT simply describe it in text if you use the CROP tag. Use the CROP tag so the system can extract the visual.
    4. **FORMATTING**: For multi-line equations, use the \`aligned\` environment. DO NOT use \`array\` with '@' separator hacks.
    
    Output clean markdown notes.`;

    if (persona) {
        prompt += `\n\nAdditional Context/Persona: ${persona}`;
    }

    return prompt;
};

export const OCR_SYSTEM_INSTRUCTION = "You are a specialized OCR tool. Priority: Accurate text, standard LaTeX delimiters (\\(..\\), \\[..\\]), and identifying visual regions.";
