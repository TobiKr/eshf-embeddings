/**
 * System prompts for RAG chat agent
 *
 * Defines prompts for Claude to generate accurate, detailed responses
 * based on forum post context
 */

interface ForumChunk {
  metadata: {
    author: string;
    timestamp: string;
    category: string;
    threadTitle: string;
    postText?: string;
    contentPreview?: string;
    url?: string;
    permalink?: string;
    images?: string[];
  };
  score: number;
  rerankerScore?: number; // Semantic relevance score from reranker
}

/**
 * Formats retrieved chunks into context string for Claude
 *
 * @param chunks - Retrieved chunks from Pinecone
 * @returns Formatted context string with metadata
 */
export function formatContextFromChunks(chunks: ForumChunk[]): string {
  if (!chunks || chunks.length === 0) {
    return 'Keine relevanten Forenbeiträge gefunden.';
  }

  return chunks
    .map((chunk, index) => {
      const text = chunk.metadata.postText || chunk.metadata.contentPreview || '';
      const date = new Date(chunk.metadata.timestamp).toLocaleDateString('de-DE', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });

      // Use reranker score if available (more accurate), otherwise fall back to vector score
      const relevanceScore = chunk.rerankerScore ?? chunk.score;
      const relevanceLabel = chunk.rerankerScore !== undefined ? 'Semantische Relevanz' : 'Relevanz';

      // Build metadata header
      const metadataLines = [
        `[Quelle ${index + 1}]`,
        `Autor: ${chunk.metadata.author}`,
        `Datum: ${date}`,
        `Kategorie: ${chunk.metadata.category}`,
        `Thread: ${chunk.metadata.threadTitle}`,
      ];

      // Add permalink if available
      if (chunk.metadata.permalink) {
        metadataLines.push(`Link: ${chunk.metadata.permalink}`);
      }

      // Add images count if available
      if (chunk.metadata.images && chunk.metadata.images.length > 0) {
        metadataLines.push(`Bilder: ${chunk.metadata.images.length}`);
      }

      metadataLines.push(`${relevanceLabel}: ${(relevanceScore * 100).toFixed(1)}%`);

      return `${metadataLines.join('\n')}

${text}
${'─'.repeat(80)}`;
    })
    .join('\n\n');
}

/**
 * Generates system prompt for Claude with forum context
 *
 * @param context - Formatted context from retrieved chunks
 * @returns System prompt string
 */
export function getSystemPrompt(context: string): string {
  return `Du bist ein hilfreicher Assistent für das energiesparhaus.at Forum, Österreichs führende Community für energieeffizientes Bauen und Sanieren.

DEINE AUFGABE:
Beantworte Fragen basierend auf den bereitgestellten Forenbeiträgen. Sei detailliert, präzise und hilfreich.

WICHTIGE REGELN:
1. Nutze NUR die Informationen aus den bereitgestellten Forenbeiträgen
2. Zitiere konkrete Aussagen und nenne die Autoren (z.B. "Laut Max123 vom 15.01.2024...")
3. Wenn mehrere Meinungen existieren, präsentiere verschiedene Perspektiven
4. Sei detailliert - keine oberflächlichen Zusammenfassungen
5. Wenn die Forenbeiträge nicht genug Informationen enthalten, sage das ehrlich
6. Gib technische Details wieder, wenn sie in den Beiträgen erwähnt werden
7. Antworte auf Deutsch in einem freundlichen, professionellen Ton

VERFÜGBARE FORENBEITRÄGE:
${context}

Beantworte nun die Frage des Nutzers basierend auf diesen Forenbeiträgen.`;
}

/**
 * Formats sources for display in chat UI
 *
 * @param chunks - Retrieved chunks from Pinecone
 * @param maxSources - Maximum number of sources to return (default: 5)
 * @returns Array of formatted source objects
 */
export function formatSourcesForDisplay(chunks: ForumChunk[], maxSources = 5): any[] {
  return chunks.slice(0, maxSources).map((chunk, index) => {
    const date = new Date(chunk.metadata.timestamp).toLocaleDateString('de-DE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // Use reranker score if available (more accurate), otherwise fall back to vector score
    const relevanceScore = chunk.rerankerScore ?? chunk.score;

    return {
      id: index + 1,
      author: chunk.metadata.author,
      date: date,
      category: chunk.metadata.category,
      threadTitle: chunk.metadata.threadTitle,
      url: chunk.metadata.url || '#',
      permalink: chunk.metadata.permalink || chunk.metadata.url || '#',
      images: chunk.metadata.images || [],
      relevance: (relevanceScore * 100).toFixed(1),
      excerpt: (chunk.metadata.postText || chunk.metadata.contentPreview || '').substring(0, 200) + '...',
    };
  });
}
