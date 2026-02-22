# Deployment Guide

## Architecture
This project uses **ES Modules** and **Import Maps**. It does **not** require a build step (like Webpack or Vite) to run in the browser. It runs directly from source.

## Vercel Deployment
Because there is no build step, Vercel acts as a static file server.

1. **Project Settings**:
   - **Framework Preset**: Other
   - **Build Command**: (Leave Empty)
   - **Output Directory**: (Leave Empty or `.`)

2. **Environment Variables**:
   - Since this is a static app, server-side environment variables (like `API_KEY`) are **NOT** automatically injected into the browser code at runtime without a bundler.
   - **Recommendation**: Use the "BYOK" (Bring Your Own Key) feature in the App Settings to input your Gemini API Key directly in the browser.

3. **Routing**:
   - The `vercel.json` file handles Single Page Application (SPA) routing by rewriting all requests to `index.html`.

## Local Development
To run locally, use any static server that supports SPA fallback:
```bash
npx serve -s .
```
