import { pipeline, env } from "@xenova/transformers";
import { Chunk } from "./chunker";

// Configure transformers.js for browser extension environment
env.allowLocalModels = false; // Always fetch from HF Hub
env.useBrowserCache = false; // Disable Cache API to avoid DOMCacheThread crash in Gecko 115

export class VectorStore {
  private chunks: Chunk[] = [];
  private embeddings: number[][] = [];
  private embedder: any = null;

  async init(progressCallback?: (info: any) => void) {
    if (!this.embedder) {
      this.embedder = await pipeline(
        "feature-extraction",
        "Xenova/all-MiniLM-L6-v2",
        {
          progress_callback: progressCallback,
        },
      );
    }
  }

  async addChunks(newChunks: Chunk[], progressCallback?: (info: any) => void) {
    await this.init(progressCallback);

    for (let i = 0; i < newChunks.length; i++) {
      const chunk = newChunks[i];
      const output = await this.embedder(chunk.text, {
        pooling: "mean",
        normalize: true,
      });
      const vector = Array.from(output.data);
      this.chunks.push(chunk);
      this.embeddings.push(vector as number[]);

      if (progressCallback) {
        progressCallback({
          status: "chunking",
          progress: ((i + 1) / newChunks.length) * 100,
        });
      }

      // Yield the event loop to prevent Zotero UI from hanging
      await new Promise((r) => setTimeout(r, 5));
    }
  }

  async search(
    query: string,
    topK: number = 5,
  ): Promise<{ chunk: Chunk; score: number }[]> {
    if (this.chunks.length === 0) return [];

    await this.init();
    const output = await this.embedder(query, {
      pooling: "mean",
      normalize: true,
    });
    const queryVector = Array.from(output.data) as number[];

    // 1. Compute cosine similarity (dot product on normalized vectors)
    const similarities = this.embeddings.map((vec, idx) => {
      let dot = 0;
      for (let i = 0; i < vec.length; i++) {
        dot += vec[i] * queryVector[i];
      }
      return { idx, score: dot };
    });

    // 2. Fetch top 30 via semantic search to cast a wide net
    similarities.sort((a, b) => b.score - a.score);
    const topCandidates = similarities.slice(0, 30);

    // 3. Simulated Cross-Encoder Re-Ranking using BM25 Lexical Scoring
    // We re-score the top 30 semantic chunks using exact keyword density
    const queryTerms = query
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 2);

    const reranked = topCandidates.map((candidate) => {
      const text = this.chunks[candidate.idx].text.toLowerCase();
      let lexicalScore = 0;

      queryTerms.forEach((term) => {
        const regex = new RegExp(`\\b${term}\\b`, "g");
        const matches = text.match(regex);
        if (matches) {
          const termFrequency = matches.length;
          // Basic BM25-like Term Frequency saturation
          lexicalScore += (termFrequency * 2.5) / (termFrequency + 1.5);
        }
      });

      // Normalize semantic score (typically 0.4 to 1.0) and multiply/add lexical weight
      const finalScore =
        candidate.score * 0.6 + (lexicalScore > 0 ? lexicalScore * 0.05 : 0);
      return {
        chunk: this.chunks[candidate.idx],
        score: finalScore,
      };
    });

    // Sort by the new Hybrid Score
    reranked.sort((a, b) => b.score - a.score);

    return reranked.slice(0, topK);
  }
}
