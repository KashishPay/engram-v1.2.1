import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";

async function test() {
    const env = fs.readFileSync('.env', 'utf8');
    const key = env.split('\n').find(l => l.startsWith('VITE_API_KEY='))?.split('=')[1]?.trim();
    if (!key) throw new Error("No API key");
    
    const ai = new GoogleGenAI({ apiKey: key });
    // try to list models
    try {
        const response = await (ai.models as any).list();
        for await (const m of response) {
          console.log(m.name, m.displayName, m.version);
        }
    } catch(e) {
        console.log("Error:", e.message);
    }
}
test();
