# Zotero RAG Plugin - Changelog

## v1.1.0 - _March 24, 2026_

The following architectural optimizations and bug fixes have been implemented to improve retrieval accuracy and resolve user-reported configuration issues.

### 1. RAG Retrieval Pipeline Optimization

#### Precise Semantic Chunking

The target text chunk length was reduced from 1000 tokens down to **300 tokens** (with a 50-token overlap). This highly targeted size adjustment forces the vector embeddings to isolate specific concepts and paragraphs, drastically reducing LLM context dilution and preventing the system from drowning in noisy, irrelevant text blocks.

#### Hybrid Semantic and Lexical Re-Ranker

To address issues with naive vector search prioritizing weakly matched text, a lightweight **BM25 Lexical Re-Ranker** was integrated natively into the vector search engine.

- The search pipeline now retrieves an initial wide net of 30 candidate chunks using standard Cosine Similarity.
- It then processes those candidates locally, re-scoring them by analyzing exact query keyword density (utilizing a BM25-style term frequency saturation model).
- The semantic and lexical scores are normalized together, enabling the engine to sort and serve the absolute mathematically tightest 15 chunks to the LLM contextual prompt. This simulated cross-encoder behavior significantly boosts context retrieval accuracy.

### 2. Bug Fixes & Enhancements

#### HTML Webpage Support

Native support explicitly verified for extracting, chunking, and indexing `text/html` Snapshot tags appended by Zotero web saves.

#### Install Compatibility

Fixed a packaging pipeline configuration error that was generating incompatible `.xpi` archives, preventing successful deployment on Zotero 7 clients. The new `v1.1.0` binary validates safely against Zotero's strict addon policies.

#### API Key Namespace Resolution

Resolved a critical issue where users were receiving persistent "API Key Missing" errors in the chat window despite having correctly entered their keys in the Settings menu.

- The interface was attempting to fetch the active API key from the local Zotero SQLite database using a truncated prefix (`extensions.zoterorag.apiKey`).
- The exact reference was corrected to rigidly inherit Zotero's master extensions prefix (`extensions.zotero.zoterorag.apiKey`), securing proper local memory access and allowing third-party LLM integration (like Anthropic Claude and OpenAI) to function correctly.
