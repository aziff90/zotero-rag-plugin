# Zotero RAG Chat Plugin 

## Overview
This plugin is a NotebookLM-style RAG architecture for Zotero 7. It seamlessly integrates into your research workflow by allowing you to extract text from your selected PDFs/items, chunk the text, create embeddings entirely offline using local AI models (`Xenova/all-MiniLM-L6-v2`), and query the Gemini API to answer your questions strictly based on the provided context sources.

## How it Works
1. **Extraction:** Relies on Zotero's internal `item.attachmentText` API to quickly pull text indexing without requiring heavy external PDF parsers.
2. **Chunking & Vector Search:** Dynamically splits documents into ~1000 character overlapping chunks on the fly. It utilises a robust `Transformers.js` model running entirely inside Zotero to search the text vectors.
3. **Chat Interface:** Features an integrated React app loaded directly in a Zotero Dialog window to process chat history and stream from Gemini 2.5 Flash.

## Features
- **NotebookLM-style RAG**: Extract knowledge from your actual Zotero PDFs and let AI answer based on facts, not hallucinations.
- **Smart Data Extraction**: The plugin doesn't just read PDFs and Notes—it now automatically spins up the `tesseract.js` Optical Character Recognition (OCR) engine natively inside your browser to "read" standard images attached to your library!
- **Smart AI Fallback**: If the context doesn't have the exact answer, the AI is instructed to seamlessly supplement its response with its own general knowledge rather than strictly failing.
- **Multiple AI Providers**: Easily switch between **Google Gemini**, **OpenAI ChatGPT**, **Anthropic Claude**, and **Local Ollama** models using the new Settings menu.
- **Source Citations**: AI responses are strictly grounded, appending exactly which sources were used at the end of the message.
- **Transparent Processing**: Embeddings are generated locally on your machine for maximum privacy, complete with a real-time progress bar.
- **Sleek Interface**: Built-in support for Zotero's fluid Dark Mode styling, an auto-expanding chat input box, native Markdown UI rendering (for bolding and bulleted lists), and a beautiful transparent flat node icon.
- **Persistent Chat History**: Maintains context throughout your research browsing session.

## Installation & Setup

1. Open Zotero 7 and navigate to `Tools > Add-ons`.
2. Click the gear icon and select **Install Add-on From File...**
3. Select the `zotero-rag-plugin-1.0.0.xpi` file included in this directory.
4. Restart Zotero when prompted.
5. In your Zotero Library, select one or more PDFs/items, right-click, and select **"Chat with Selected Items..."**.

### Configuring your LLM Engine
You can customise the RAG Assistant globally by configuring the LLM Backend:
1. Navigate to **Zotero Options / Preferences > RAG Assistant Settings**.
2. Select your preferred provider (Gemini, ChatGPT, Claude, Ollama).
3. Paste in your **API Key**.
4. Optional: Specify the precise **Model Name** you want to use (e.g., `gemini-2.5-flash`, `gpt-4o`, `claude-3-haiku-20240307`, or `llama3`).

*Note: The very first time you generate embeddings, the semantic search model (`all-MiniLM-L6-v2`) will be downloaded locally, measuring around 22MB. You will see a progress bar indicating the status.*
5. Wait for the vectors to initialise, and start asking questions about your sources!
