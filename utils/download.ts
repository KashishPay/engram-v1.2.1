
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { jsPDF } from 'jspdf';
import { triggerHaptic } from './haptics';
import { showLocalNotification } from './notifications';
import { FileOpener } from '@capawesome-team/capacitor-file-opener';

/**
 * Unified utility to handle PDF downloads across Web and Capacitor.
 * On Native: Saves to Documents/Engram/... and attempts to open it automatically.
 * On Web: Triggers standard browser download.
 */
export const downloadPDF = async (doc: jsPDF, filename: string, options: { 
  folderPath?: string; // e.g., "Engram/Diary/Math"
  notificationId?: number;
} = {}) => {
  const { 
    folderPath = 'Engram/Exports',
    notificationId = Math.floor(Date.now() / 1000)
  } = options;

  if (Capacitor.isNativePlatform()) {
    try {
      // 1. Prepare Paths
      const safeFolderPath = folderPath.replace(/\/+$/, ''); // Remove trailing slashes
      const fullPath = `${safeFolderPath}/${filename}`;
      
      // 2. Ensure Directory exists
      try {
        await Filesystem.mkdir({
          path: safeFolderPath,
          directory: Directory.Documents,
          recursive: true,
        });
      } catch {
        // Directory likely exists
      }
      
      // 3. Get base64 string from jsPDF
      const pdfBase64 = doc.output('datauristring').split(',')[1];
      
      // 4. Write File directly to Documents
      const fileResult = await Filesystem.writeFile({
        path: fullPath,
        data: pdfBase64,
        directory: Directory.Documents,
      });

      // 5. Show Success Notification
      await showLocalNotification("PDF Saved ✅", {
        body: `${filename} saved successfully.`,
        id: notificationId,
        ongoing: false,
        extra: {
          filePath: fileResult.uri,
          mimeType: 'application/pdf'
        }
      });

      triggerHaptic.notification('Success');

      // 6. Attempt to open the file so the user can easily find it
      try {
        await FileOpener.openFile({
          path: fileResult.uri,
          mimeType: 'application/pdf'
        });
      } catch (openError) {
        console.warn('Could not open file automatically', openError);
        alert(`File saved to Documents folder as ${filename}.`);
      }

    } catch (error) {
      console.error('[DOWNLOAD] Native PDF save failed', error);
      triggerHaptic.notification('Error');
      await showLocalNotification('Download Failed', {
        body: 'Could not save the PDF document.',
        id: notificationId
      });
      alert('Failed to save PDF: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  } else {
    // Standard Web Download
    doc.save(filename);
    triggerHaptic.notification('Success');
  }
};

/**
 * Downloads a JSON string as a .json file.
 */
export const downloadFileFromBase64 = async (base64Data: string, filename: string, mimeType: string, options: { 
  folderPath?: string; 
  notificationId?: number;
} = {}) => {
  const { 
    folderPath = 'Engram/Exports',
    notificationId = Math.floor(Date.now() / 1000)
  } = options;

  if (Capacitor.isNativePlatform()) {
    try {
      const safeFolderPath = folderPath.replace(/\/+$/, '');
      const fullPath = `${safeFolderPath}/${filename}`;
      
      try {
        await Filesystem.mkdir({
          path: safeFolderPath,
          directory: Directory.Documents,
          recursive: true,
        });
      } catch {
        // usually means the dir exists
      }
      
      const fileResult = await Filesystem.writeFile({
        path: fullPath,
        data: base64Data,
        directory: Directory.Documents,
      });

      await showLocalNotification("File Saved ✅", {
        body: `${filename} saved successfully.`,
        id: notificationId,
        ongoing: false,
        extra: {
          filePath: fileResult.uri,
          mimeType: mimeType
        }
      });

      triggerHaptic.notification('Success');

      try {
        await FileOpener.openFile({
          path: fileResult.uri,
          mimeType: mimeType
        });
      } catch (openError) {
        console.warn('Could not open file automatically', openError);
        alert(`File saved to Documents folder as ${filename}. Open it via your file manager.`);
      }

    } catch (error) {
      console.error('[DOWNLOAD] Native file save failed', error);
      triggerHaptic.notification('Error');
      await showLocalNotification('Download Failed', {
        body: 'Could not save the file.',
        id: notificationId
      });
      alert('Failed to save file: ' + (error instanceof Error ? error.message : 'Unknown error'));
      throw error;
    }
  } else {
    // Standard Web Download
    try {
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      triggerHaptic.notification('Success');
    } catch(e) {
      console.error("Web download failed", e);
    }
  }
};

/**
 * Downloads a JSON string as a .json file.
 */
export const downloadLargeJSONStream = async (
  stream: AsyncGenerator<string, void, unknown>, 
  filename: string, 
  options: { folderPath?: string; notificationId?: number } = {}
) => {
  const { folderPath = 'Engram/Exports', notificationId = Math.floor(Date.now() / 1000) } = options;

  if (Capacitor.isNativePlatform()) {
      try {
        const safeFolderPath = folderPath.replace(/\/+$/, '');
        const fullPath = `${safeFolderPath}/${filename}`;
        
        try {
          await Filesystem.mkdir({ path: safeFolderPath, directory: Directory.Documents, recursive: true });
        } catch { /* Directory probably already exists */ }

        const fileResult = await Filesystem.writeFile({
            path: fullPath,
            data: "",
            directory: Directory.Documents,
            encoding: Encoding.UTF8
        });

        let buffer = "";
        const MAX_BUFFER = 2 * 1024 * 1024; // 2MB chunk to bridge
        for await (const chunk of stream) {
            buffer += chunk;
            if (buffer.length > MAX_BUFFER) {
                await Filesystem.appendFile({
                    path: fullPath,
                    data: buffer,
                    directory: Directory.Documents,
                    encoding: Encoding.UTF8
                });
                buffer = "";
            }
        }
        if (buffer.length > 0) {
            await Filesystem.appendFile({
                path: fullPath,
                data: buffer,
                directory: Directory.Documents,
                encoding: Encoding.UTF8
            });
        }

        await showLocalNotification("Backup Saved ✅", {
            body: `${filename} saved successfully to Documents.`,
            id: notificationId,
            ongoing: false,
            extra: { filePath: fileResult.uri, mimeType: 'application/json' }
        });
        triggerHaptic.notification('Success');

        try {
            await FileOpener.openFile({ path: fileResult.uri, mimeType: 'application/json' });
        } catch (openError) {
             console.warn('Could not open file automatically', openError);
             alert(`Backup saved to Documents folder as ${filename}.`);
        }

      } catch (error) {
        console.error('[DOWNLOAD] Native Stream JSON save failed', error);
        triggerHaptic.notification('Error');
        await showLocalNotification('Export Failed', { body: 'Could not save the backup file.', id: notificationId });
        alert('Failed to save backup: ' + (error instanceof Error ? error.message : 'Unknown error'));
        throw error;
      }
  } else {
      try {
          if ('showSaveFilePicker' in window) {
              try {
                  const handle = await (window as any).showSaveFilePicker({
                      suggestedName: filename,
                      types: [{
                          description: 'JSON Lines file',
                          accept: { 'application/jsonl+json': ['.jsonl'], 'application/json': ['.json'] },
                      }],
                  });
                  const writable = await handle.createWritable();
                  for await (const chunk of stream) {
                      await writable.write(chunk);
                  }
                  await writable.close();
                  triggerHaptic.notification('Success');
                  return;
              } catch (err: any) {
                  if (err.name === 'AbortError') return; // User cancelled
                  console.warn('showSaveFilePicker failed, falling back to Blob', err);
              }
          }

          const chunks: string[] = [];
          for await (const chunk of stream) {
              chunks.push(chunk);
          }
          const blob = new Blob(chunks, { type: filename.endsWith('.jsonl') ? "application/jsonl+json" : "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          triggerHaptic.notification('Success');
      } catch (e) {
          console.error("Web stream download failed", e);
      }
  }
};

export const downloadJSON = async (jsonString: string, filename: string, options: { 
  folderPath?: string; 
  notificationId?: number;
} = {}) => {
  const { 
    folderPath = 'Engram/Exports',
    notificationId = Math.floor(Date.now() / 1000)
  } = options;

  if (Capacitor.isNativePlatform()) {
    try {
      const safeFolderPath = folderPath.replace(/\/+$/, '');
      const fullPath = `${safeFolderPath}/${filename}`;
      
      try {
        await Filesystem.mkdir({
          path: safeFolderPath,
          directory: Directory.Documents,
          recursive: true,
        });
      } catch {
        // usually means the dir exists
      }
      
      const fileResult = await Filesystem.writeFile({
        path: fullPath,
        data: jsonString,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
      });

      await showLocalNotification("Backup Saved ✅", {
        body: `${filename} saved to Documents folder.`,
        id: notificationId,
        ongoing: false,
        extra: {
          filePath: fileResult.uri,
          mimeType: 'application/json'
        }
      });

      triggerHaptic.notification('Success');

      // Optional: don't automatically open json, just notify.
      // Or we can try opening it:
      try {
        await FileOpener.openFile({
          path: fileResult.uri,
          mimeType: 'application/json'
        });
      } catch (openError) {
        console.warn('Could not open file automatically', openError);
        alert(`Backup saved to your Documents folder as ${filename}.`);
      }

    } catch (error) {
      console.error('[DOWNLOAD] Native JSON save failed', error);
      triggerHaptic.notification('Error');
      await showLocalNotification('Export Failed', {
        body: 'Could not save the backup file.',
        id: notificationId
      });
      alert('Failed to save backup: ' + (error instanceof Error ? error.message : 'Unknown error'));
      throw error;
    }
  } else {
    // Standard Web Download
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    triggerHaptic.notification('Success');
  }
};
