import { pipeline, env } from '@xenova/transformers';
import { Chunk } from './chunker';

// Configure transformers.js for browser extension environment
env.allowLocalModels = false; // Always fetch from HF Hub
env.useBrowserCache = false; // Disable Cache API to avoid DOMCacheThread crash in Gecko 115

export class VectorStore {
  private chunks: Chunk[] = [];
  private embeddings: number[][] = [];
  private embedder: any = null;

  async init(progressCallback?: (info: any) => void) {
    if (!this.embedder) {
      this.embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        progress_callback: progressCallback
      });
    }
  }

  async addChunks(newChunks: Chunk[], progressCallback?: (info: any) => void) {
    await this.init(progressCallback);
    
    for (let i = 0; i < newChunks.length; i++) {
       const chunk = newChunks[i];
       const output = await this.embedder(chunk.text, { pooling: 'mean', normalize: true });
       const vector = Array.from(output.data);
       this.chunks.push(chunk);
       this.embeddings.push(vector as number[]);
       
       if (progressCallback) {
          progressCallback({ status: 'chunking', progress: (i + 1) / newChunks.length * 100 });
       }
       
       // Yield the event loop to prevent Zotero UI from hanging
       await new Promise(r => setTimeout(r, 5));
    }
  }

  async search(query: string, topK: number = 3): Promise<{ chunk: Chunk, score: number }[]> {
    if (this.chunks.length === 0) return [];
    
    await this.init();
    const output = await this.embedder(query, { pooling: 'mean', normalize: true });
    const queryVector = Array.from(output.data) as number[];

    // Compute cosine similarity (dot product on normalized vectors)
    const similarities = this.embeddings.map((vec, idx) => {
      let dot = 0;
      for (let i = 0; i < vec.length; i++) {
        dot += vec[i] * queryVector[i];
      }
      return { idx, score: dot };
    });

    similarities.sort((a, b) => b.score - a.score);
    
    return similarities.slice(0, topK).map(s => ({
       chunk: this.chunks[s.idx],
       score: s.score
    }));
  }
}
