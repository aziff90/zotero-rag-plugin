export interface LLMConfig {
  provider: 'gemini' | 'ollama' | 'openai' | 'anthropic';
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export class LLMClient {
  constructor(private config: LLMConfig) {}

  async generate(prompt: string, contextChunks: string[], onChunk?: (text: string) => void): Promise<string> {
    const systemPrompt = `You are an elite academic research assistant. You are provided with excerpts from the user's selected documents. Each document is labeled with a source number, e.g., Source [1]: Document Title.
Use these sources to synthesize a comprehensive, smart, and highly analytical answer using Markdown formatting (bolding, bullet points) for readability.
CRITICAL INSTRUCTION FOR CITATIONS:
You MUST use bracketed inline citations at the end of every factual sentence you write. For example: "The economy grew by 5% [1]." or "This trend is rising [1][2]." 
NEVER use the word "Source" in your citations. NEVER write "(Source 1)". ONLY write the bracketed number like "[1]".
If the provided sources don't fully answer the question, seamlessly supplement with your own general knowledge.`;
    
    // Construct full prompt with context
    let fullPrompt = `${systemPrompt}\n\nCONTEXT SOURCES:\n`;
    contextChunks.forEach((chunk, i) => {
      fullPrompt += `--- Source ${i + 1} ---\n${chunk}\n`;
    });
    fullPrompt += `\nUSER QUESTION: ${prompt}`;

    if (this.config.provider === 'gemini') {
      return this.generateGemini(fullPrompt, onChunk);
    } else if (this.config.provider === 'openai') {
      return this.generateOpenAI(systemPrompt, fullPrompt.replace(systemPrompt, ''), onChunk);
    } else if (this.config.provider === 'anthropic') {
      return this.generateAnthropic(systemPrompt, fullPrompt.replace(systemPrompt, ''), onChunk);
    } else {
      return this.generateOllama(fullPrompt, onChunk);
    }
  }

  private async generateGemini(prompt: string, onChunk?: (text: string) => void): Promise<string> {
    const apiKey = this.config.apiKey;
    if (!apiKey) throw new Error("Gemini API key is required");
    
    const model = this.config.model || "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
         contents: [{ parts: [{ text: prompt }] }]
      })
    });

    if (!response.ok) {
        throw new Error(`Gemini API Error: ${response.statusText}`);
    }

    if (!response.body) throw new Error("No response body");
    const reader = response.body.getReader() as any;
    const decoder = new TextDecoder("utf-8");
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.trim().startsWith('data: '));
      
      for (const line of lines) {
         try {
             const dataStr = line.replace('data: ', '');
             const data = JSON.parse(dataStr);
             const textPart = data.candidates?.[0]?.content?.parts?.[0]?.text;
             if (textPart) {
                 if (onChunk) onChunk(textPart);
                 fullText += textPart;
             }
         } catch (e) {
             // ignore incomplete JSON
         }
      }
    }
    
    return fullText;
  }

  private async generateOpenAI(systemPrompt: string, userPrompt: string, onChunk?: (text: string) => void): Promise<string> {
    const apiKey = this.config.apiKey;
    if (!apiKey) throw new Error("OpenAI API key is required");
    
    const model = this.config.model || "gpt-4o-mini";
    const url = `https://api.openai.com/v1/chat/completions`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
         model,
         messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
         ],
         stream: !!onChunk
      })
    });

    if (!response.ok) throw new Error(`OpenAI API Error: ${response.statusText}`);
    
    if (!onChunk) {
        const data = await response.json() as any;
        return data.choices[0].message.content;
    }

    if (!response.body) throw new Error("No response body");
    const reader = response.body.getReader() as any;
    const decoder = new TextDecoder("utf-8");
    let fullText = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim() !== '' && line.startsWith('data: '));
        
        for (const line of lines) {
            const dataStr = line.replace('data: ', '');
            if (dataStr === '[DONE]') break;
            try {
                const data = JSON.parse(dataStr);
                const content = data.choices[0]?.delta?.content;
                if (content) {
                    if (onChunk) onChunk(content);
                    fullText += content;
                }
            } catch (e) {
                // Ignore incomplete JSON
            }
        }
    }
    return fullText;
  }

  private async generateAnthropic(systemPrompt: string, userPrompt: string, onChunk?: (text: string) => void): Promise<string> {
    const apiKey = this.config.apiKey;
    if (!apiKey) throw new Error("Anthropic API key is required");
    
    const model = this.config.model || "claude-3-haiku-20240307";
    const url = `https://api.anthropic.com/v1/messages`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
         model,
         max_tokens: 1024,
         system: systemPrompt,
         messages: [
            { role: "user", content: userPrompt }
         ],
         stream: !!onChunk
      })
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({})) as any;
        throw new Error(`Anthropic API Error: ${errData.error?.message || response.statusText}`);
    }
    
    if (!onChunk) {
        const data = await response.json() as any;
        return data.content[0].text;
    }

    if (!response.body) throw new Error("No response body");
    const reader = response.body.getReader() as any;
    const decoder = new TextDecoder("utf-8");
    let fullText = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim() !== '' && line.startsWith('data: '));
        
        for (const line of lines) {
            const dataStr = line.replace('data: ', '');
            try {
                const data = JSON.parse(dataStr);
                if (data.type === 'content_block_delta' && data.delta?.text) {
                    if (onChunk) onChunk(data.delta.text);
                    fullText += data.delta.text;
                }
            } catch (e) {
                // Ignore incomplete JSON
            }
        }
    }
    return fullText;
  }

  private async generateOllama(prompt: string, onChunk?: (text: string) => void): Promise<string> {
    const baseUrl = this.config.baseUrl || "http://localhost:11434";
    const model = this.config.model || "llama3";
    
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        prompt: prompt,
        stream: !!onChunk
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama API Error: ${response.statusText}`);
    }

    if (!onChunk) {
        const data = await response.json() as any;
        return data.response;
    }

    if (!response.body) throw new Error("No response body");
    const reader = response.body.getReader() as any;
    const decoder = new TextDecoder("utf-8");
    let fullText = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim() !== '');
        
        for (const line of lines) {
            try {
                const data = JSON.parse(line);
                if (data.response) {
                    if (onChunk) onChunk(data.response);
                    fullText += data.response;
                }
            } catch (e) {
                // Ignore incomplete JSON
            }
        }
    }

    return fullText;
  }
}
