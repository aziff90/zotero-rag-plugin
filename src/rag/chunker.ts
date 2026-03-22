export interface Chunk {
  id: string;
  itemId: number;
  itemKey: string;
  title: string;
  text: string;
  chunkIndex: number;
}

/**
 * Splits extracted text into overlapping chunks.
 */
export function chunkText(
  documents: { itemId: number; itemKey: string; title: string; text: string }[],
  chunkSize: number = 1000,
  overlap: number = 200,
): Chunk[] {
  const chunks: Chunk[] = [];

  for (const doc of documents) {
    const text = doc.text;
    let startIndex = 0;
    let chunkIndex = 0;

    // Very simple character-based chunking
    while (startIndex < text.length) {
      let endIndex = startIndex + chunkSize;

      // If we're not at the very end, try to find a nice break point (space or newline)
      if (endIndex < text.length) {
        const breakSearch = text.lastIndexOf(" ", endIndex);
        if (breakSearch > startIndex + chunkSize - overlap) {
          endIndex = breakSearch;
        }
      } else {
        endIndex = text.length;
      }

      const chunkText = text.slice(startIndex, endIndex).trim();

      if (chunkText.length > 0) {
        chunks.push({
          id: `${doc.itemId}-chunk-${chunkIndex}`,
          itemId: doc.itemId,
          itemKey: doc.itemKey,
          title: doc.title,
          text: chunkText,
          chunkIndex: chunkIndex,
        });
        chunkIndex++;
      }

      // Move startIndex forward by chunkSize MINUS overlap
      startIndex = endIndex - overlap;
      if (
        startIndex >= text.length ||
        startIndex < 0 ||
        endIndex === text.length
      ) {
        break; // Ensure we don't loop infinitely or redundantly
      }
    }
  }

  return chunks;
}
