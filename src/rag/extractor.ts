import { createWorker } from 'tesseract.js';

export async function extractTextFromItems(items: Zotero.Item[]): Promise<{ itemId: number; itemKey: string; title: string; text: string }[]> {
  const extracted: { itemId: number; itemKey: string; title: string; text: string }[] = [];

  for (const item of items) {
    if (!item) continue;

    let textContent = "";
    const title = item.getField("title") || `Item ${item.id}`;

    // Note item
    if (item.isRegularItem() === false && item.itemType === "note") {
      textContent = item.getNote();
      // Simple HTML to text conversion for notes
      textContent = textContent.replace(/<[^>]+>/g, " ");
    } 
    // PDF attachment or standalone PDF
    else if (item.isAttachment()) {
      if (item.attachmentContentType === "application/pdf" || item.attachmentContentType === "text/html") {
        try {
          // Use Zotero's built in fulltext indexing
          const ft = await item.attachmentText;
          if (ft) {
            textContent = ft;
          }
        } catch (e) {
          ztoolkit.log(`Failed to extract text for attachment ${item.id}`, e);
        }
      }
    } 
    // Pure Image Attachment
    else if (item.isAttachment() && item.attachmentContentType?.startsWith("image/")) {
      try {
        const filePath = await item.getFilePathAsync();
        if (filePath) {
           // @ts-ignore
           ztoolkit.log(`Running OCR on image attachment ${item.id}`);
           const worker = await createWorker('eng');
           const { data: { text } } = await worker.recognize(`file://${filePath}`);
           if (text) textContent = text;
           await worker.terminate();
        }
      } catch (e) {
        // @ts-ignore
        ztoolkit.log(`OCR failed for image attachment ${item.id}`, e);
      }
    }
    // Regular item (e.g., Book, Journal Article with attachments)
    else {
      // Try to get attachments
      const attachmentIDs = item.getAttachments();
      const attachments = await Zotero.Items.getAsync(attachmentIDs) as Zotero.Item[];
      for (const attachment of attachments) {
        if (attachment.attachmentContentType === "application/pdf" || attachment.attachmentContentType === "text/html") {
          try {
            const ft = await attachment.attachmentText;
            if (ft) {
              textContent += "\n" + ft;
            }
          } catch (e) {
             ztoolkit.log(`Failed to extract text for attachment ${attachment.id}`, e);
          }
        } else if (attachment.attachmentContentType?.startsWith("image/")) {
          try {
             const filePath = await attachment.getFilePathAsync();
             if (filePath) {
                 // @ts-ignore
                 ztoolkit.log(`Running OCR on image attachment ${attachment.id}`);
                 const worker = await createWorker('eng');
                 const { data: { text } } = await worker.recognize(`file://${filePath}`);
                 if (text) textContent += "\n" + text;
                 await worker.terminate();
             }
          } catch (e) {
             // @ts-ignore
             ztoolkit.log(`OCR failed for image attachment ${attachment.id}`, e);
          }
        }
      }

      // Also grab abstract
      const abstract = item.getField("abstractNote");
      if (abstract) {
        textContent = abstract + "\n" + textContent;
      }
    }

    if (textContent.trim()) {
      extracted.push({
        itemId: item.id,
        itemKey: item.key,
        title: title,
        text: textContent.trim(),
      });
    }
  }

  return extracted;
}
