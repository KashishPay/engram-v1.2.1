const fs = require("fs");
const path = require("path");
const destDir = path.join("public");
if (!fs.existsSync(destDir)){ fs.mkdirSync(destDir, { recursive: true }); }
const src = path.join("node_modules","pdfjs-dist","build","pdf.worker.min.js");
const dst = path.join("public","pdf.worker.min.js");
if (fs.existsSync(src)) { 
    fs.copyFileSync(src, dst);
    console.log("PDF Worker copied to public/");
} else {
    console.warn("Warning: pdf.worker.min.js not found in node_modules.");
}