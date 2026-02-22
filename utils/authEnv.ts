
export function isPreviewEnv(): boolean {
  const loc = window.location;
  const origin = loc.origin || "null";
  const hostname = loc.hostname || "";
  const protocol = loc.protocol || "";

  // Treat as preview if ANY of these is true:
  // - Blob protocol (common in some code editors)
  // - AI Studio / Google User Content domains
  // - Empty hostname or null origin
  return (
      protocol === "blob:" ||
      origin.includes("scf.usercontent.goog") ||
      origin.includes("googleusercontent.com") ||
      origin.includes("aistudio.google.com") ||
      origin.includes("ai.studio") ||
      hostname === "" || 
      origin === "null"
  );
}

export function getOAuthAppOrigin(): string {
  if (isPreviewEnv()) {
      // In preview, force the production URL for the OAuth redirect.
      // This ensures the callback goes to a whitelisted domain in Google Cloud Console.
      return "https://engram-space.vercel.app";
  }
  
  // Otherwise use the current origin (e.g., localhost, vercel deployment)
  return window.location.origin;
}
