import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";

dotenv.config();

async function test() {
    const ai = new GoogleGenAI({ apiKey: process.env.VITE_API_KEY });
    for await (const m of ai.models.list()) {
      console.log(m.name, m.displayName, m.version);
    }
}
test();
