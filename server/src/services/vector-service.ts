import { Pinecone } from '@pinecone-database/pinecone';

export class VectorService {
  private static pinecone: Pinecone | null = null;

  static async init() {
    if (!process.env.PINECONE_API_KEY) return;
    this.pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  }

  static async searchKnowledge(query: string, domain: 'fitness' | 'nutrition'): Promise<string[]> {
    if (!this.pinecone) return [];
    
    const index = this.pinecone.index('zym-knowledge');
    const embedding = await this.getEmbedding(query);
    
    const results = await index.query({
      vector: embedding,
      filter: { domain },
      topK: 3,
      includeMetadata: true
    });

    return results.matches?.map(m => m.metadata?.text as string) || [];
  }

  static async getEmbedding(text: string): Promise<number[]> {
    // Use OpenRouter for embeddings
    const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text
      })
    });
    const data = await response.json();
    return data.data[0].embedding;
  }
}
