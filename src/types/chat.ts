/**
 * Type definitions for chat API
 */

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  message: string;
  conversationHistory?: ChatMessage[];
}

export interface StreamChunk {
  type: 'start' | 'content' | 'sources' | 'done' | 'error';
  text?: string;
  sources?: any[];
  error?: string;
}
