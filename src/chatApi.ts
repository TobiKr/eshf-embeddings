/**
 * Chat API endpoint with RAG (Retrieval-Augmented Generation)
 *
 * Provides streaming chat responses using Claude Sonnet 4.5
 * with context from Pinecone vector database
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import Anthropic from '@anthropic-ai/sdk';
import { isAuthenticated, unauthorizedResponse } from './lib/auth/passwordAuth';
import { retrieveContext } from './lib/rag/retrieval';
import { getSystemPrompt, formatContextFromChunks, formatSourcesForDisplay } from './lib/rag/prompts';
import { ChatRequest, StreamChunk } from './types/chat';
import * as logger from './lib/utils/logger';

import { startTransaction, setTag, captureException } from './lib/utils/sentry';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const CLAUDE_MODEL = 'claude-sonnet-4-5-20250929';
const MAX_TOKENS = 40960;

/**
 * Chat endpoint handler with streaming support
 *
 * @param request - HTTP request with chat message
 * @param context - Azure Functions invocation context
 * @returns Streaming response with chat content and sources
 */
export async function chatApi(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const startTime = Date.now();

  // Start Sentry transaction for performance monitoring
  const transaction = startTransaction('chatApi', 'http.request');
  setTag('function', 'chatApi');
  setTag('invocationId', context.invocationId);

  try {
    // Step 1: Authentication
    if (!isAuthenticated(request)) {
      logger.warn('Unauthorized chat request');
      transaction?.setStatus('unauthenticated');
      transaction?.finish();

      return unauthorizedResponse();
    }

    // Step 2: Parse request
    const body = await request.json() as ChatRequest;
    const { message, conversationHistory = [] } = body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      transaction?.setStatus('invalid_argument');
      transaction?.finish();

      return {
        status: 400,
        jsonBody: {
          error: 'Message is required',
          message: 'Nachricht darf nicht leer sein',
        },
      };
    }

    setTag('messageLength', message.length.toString());
    setTag('hasHistory', conversationHistory.length > 0 ? 'true' : 'false');

    logger.info('Chat request received', {
      messageLength: message.length,
      hasHistory: conversationHistory.length > 0,
    });

    // Step 3: Retrieve relevant context from vector database
    const retrieval = await retrieveContext(message);

    if (!retrieval.success) {
      logger.error('Retrieval failed', { error: retrieval.error });
      transaction?.setStatus('internal_error');
      transaction?.finish();

      return {
        status: 500,
        jsonBody: {
          error: 'Retrieval error',
          message: 'Fehler beim Abrufen relevanter Forenbeiträge',
        },
      };
    }

    const chunks = retrieval.chunks || [];
    logger.info('Context retrieved', {
      chunksRetrieved: chunks.length,
      topScore: chunks[0]?.score,
    });

    // Step 4: Format context and create system prompt
    const formattedContext = formatContextFromChunks(chunks);
    const systemPrompt = getSystemPrompt(formattedContext);

    // Step 5: Build messages array with conversation history
    const messages = [
      ...conversationHistory.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      {
        role: 'user' as const,
        content: message,
      },
    ];

    logger.debug('Calling Claude API', {
      model: CLAUDE_MODEL,
      messagesCount: messages.length,
      systemPromptLength: systemPrompt.length,
    });

    // Step 6: Stream response from Claude (transaction will be finished inside)
    return streamClaudeResponse(systemPrompt, messages, chunks, startTime, transaction);

  } catch (error) {
    logger.error('Chat API error', { error });

    // Mark transaction as failed and capture exception
    transaction?.setStatus('internal_error');
    captureException(error as Error, {
      function: 'chatApi',
      invocationId: context.invocationId,
    });

    transaction?.finish();

    return {
      status: 500,
      jsonBody: {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unbekannter Fehler',
      },
    };
  }
}

/**
 * Streams Claude response as Server-Sent Events
 *
 * @param systemPrompt - System prompt with context
 * @param messages - Conversation messages
 * @param chunks - Retrieved chunks for source citations
 * @param startTime - Request start time for metrics
 * @param transaction - Optional Sentry transaction for tracking
 * @returns Streaming HTTP response
 */
async function streamClaudeResponse(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  chunks: any[],
  startTime: number,
  transaction?: { setStatus: (status: string) => void; finish: () => void }
): Promise<HttpResponseInit> {
  const encoder = new TextEncoder();

  // Create readable stream
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Send start event
        const startChunk: StreamChunk = { type: 'start' };
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(startChunk)}\n\n`)
        );

        // Create Claude stream
        const claudeStream = await anthropic.messages.stream({
          model: CLAUDE_MODEL,
          max_tokens: MAX_TOKENS,
          system: systemPrompt,
          messages: messages,
        });

        // Stream content chunks
        for await (const event of claudeStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            const contentChunk: StreamChunk = {
              type: 'content',
              text: event.delta.text,
            };
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(contentChunk)}\n\n`)
            );
          }
        }

        // Wait for stream to complete
        const finalMessage = await claudeStream.finalMessage();

        const duration = Date.now() - startTime;

        logger.info('Claude response completed', {
          tokensUsed: finalMessage.usage.input_tokens + finalMessage.usage.output_tokens,
          inputTokens: finalMessage.usage.input_tokens,
          outputTokens: finalMessage.usage.output_tokens,
          executionTime: duration,
        });

        // Send sources
        const sources = formatSourcesForDisplay(chunks, 5);
        const sourcesChunk: StreamChunk = {
          type: 'sources',
          sources: sources,
        };
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(sourcesChunk)}\n\n`)
        );

        // Send done event
        const doneChunk: StreamChunk = { type: 'done' };
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(doneChunk)}\n\n`)
        );

        controller.close();

        // Mark transaction as successful
        transaction?.setStatus('ok');
        transaction?.finish();
      } catch (error) {
        logger.error('Error during streaming', { error });

        // Track streaming error
        captureException(error as Error, {
          function: 'streamClaudeResponse',
          phase: 'streaming',
        });

        const errorChunk: StreamChunk = {
          type: 'error',
          error: error instanceof Error ? error.message : 'Streaming error',
        };
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(errorChunk)}\n\n`)
        );
        controller.close();

        // Mark transaction as failed
        transaction?.setStatus('internal_error');
        transaction?.finish();
      }
    },
  });

  return {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
    body: stream,
  };
}

// Register HTTP endpoint
app.http('chat', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'chat',
  handler: chatApi,
});
