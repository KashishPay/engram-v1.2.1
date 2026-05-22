
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
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
