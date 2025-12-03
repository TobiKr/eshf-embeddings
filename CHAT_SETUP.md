# Chat Agent Setup Guide

## Overview

The RAG (Retrieval-Augmented Generation) chat agent provides an interactive interface to query the energiesparhaus.at forum posts using semantic search and AI-powered responses.

## Architecture

```
User → Web UI (/) → Auth (/api/auth) → Chat API (/api/chat)
                                              ↓
                                    RAG Pipeline:
                                    1. Generate embedding (OpenAI)
                                    2. Query Pinecone (top 30 chunks)
                                    3. Format context with metadata
                                    4. Stream response (Claude Sonnet 4.5)
```

## Environment Variables

Add these to your `local.settings.json` (local) and Azure Function App Settings (production):

```json
{
  "CHAT_PASSWORD": "your-secure-password",
  "ANTHROPIC_API_KEY": "sk-ant-..."
}
```

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `CHAT_PASSWORD` | Password for chat access | `energiesparhaus2024` |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude | `sk-ant-...` |
| `OPENAI_API_KEY` | OpenAI API key (already configured) | `sk-...` |
| `PINECONE_API_KEY` | Pinecone API key (already configured) | `pcsk_...` |
| `PINECONE_HOST` | Pinecone host URL (already configured) | `https://...` |
| `PINECONE_INDEX` | Pinecone index name (already configured) | `eshf` |

## Local Development

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Edit `local.settings.json` and add your `ANTHROPIC_API_KEY`:

```json
{
  "Values": {
    ...
    "CHAT_PASSWORD": "energiesparhaus2024",
    "ANTHROPIC_API_KEY": "sk-ant-your-key-here"
  }
}
```

### 3. Build TypeScript

```bash
npm run build
```

### 4. Start Azure Functions

```bash
npm start
```

### 5. Access Chat UI

Open your browser to: `http://localhost:7071`

Enter the password: `energiesparhaus2024` (or your custom password)

## API Endpoints

### POST /api/auth

Authenticate with password.

**Request:**
```json
{
  "password": "energiesparhaus2024"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Authentifizierung erfolgreich"
}
```

### POST /api/chat

Send chat message and receive streaming response.

**Request:**
```json
{
  "message": "Wie funktioniert eine Wärmepumpe?",
  "conversationHistory": [
    {
      "role": "user",
      "content": "Previous question..."
    },
    {
      "role": "assistant",
      "content": "Previous answer..."
    }
  ]
}
```

**Response:** Server-Sent Events stream

```
data: {"type": "start"}
data: {"type": "content", "text": "Eine Wärmepumpe..."}
data: {"type": "sources", "sources": [...]}
data: {"type": "done"}
```

### GET /

Serve chat UI (HTML).

### GET /styles.css

Serve CSS stylesheet.

### GET /app.js

Serve JavaScript application.

## Deployment to Azure

### 1. Build Project

```bash
npm run build
```

### 2. Configure Azure Function App Settings

Add the following application settings in Azure Portal:

- `CHAT_PASSWORD`: Your chosen password
- `ANTHROPIC_API_KEY`: Your Anthropic API key

### 3. Deploy

```bash
# Using Azure Functions Core Tools
func azure functionapp publish <your-function-app-name>

# Or use VS Code Azure Functions extension
# Right-click on function app and select "Deploy to Function App..."
```

### 4. Access Chat

Navigate to: `https://<your-function-app>.azurewebsites.net/`

## Configuration

### Retrieval Settings

Edit [src/lib/rag/retrieval.ts](src/lib/rag/retrieval.ts:15):

```typescript
const DEFAULT_TOP_K = 30; // Number of chunks to retrieve
const EMBEDDING_MODEL = 'text-embedding-3-large'; // OpenAI model
```

### Claude Model

Edit [src/functions/chatApi.ts](src/functions/chatApi.ts:17):

```typescript
const CLAUDE_MODEL = 'claude-sonnet-4-5-20250929';
const MAX_TOKENS = 4096; // Maximum response length
```

### System Prompt

Edit [src/lib/rag/prompts.ts](src/lib/rag/prompts.ts:52) to customize the assistant's behavior.

## Troubleshooting

### "Unauthorized" Error

- Check that `CHAT_PASSWORD` is set correctly
- Clear browser cookies and try again
- Check browser console for errors

### No Results Returned

- Verify Pinecone is populated with vectors
- Check `PINECONE_HOST` and `PINECONE_INDEX` settings
- Review logs for embedding generation errors

### Streaming Not Working

- Ensure browser supports Server-Sent Events (all modern browsers do)
- Check network tab in browser dev tools for stream errors
- Verify `ANTHROPIC_API_KEY` is valid

### Build Errors

```bash
# Clear build artifacts
rm -rf dist/

# Rebuild
npm run build
```

## File Structure

```
eshf-embeddings/
├── src/
│   ├── functions/
│   │   ├── authApi.ts           # Password authentication endpoint
│   │   ├── chatApi.ts           # Chat endpoint with streaming
│   │   └── webServer.ts         # Serves static files
│   ├── lib/
│   │   ├── auth/
│   │   │   └── passwordAuth.ts  # Auth middleware
│   │   └── rag/
│   │       ├── retrieval.ts     # Vector search logic
│   │       └── prompts.ts       # System prompts for Claude
│   └── types/
│       └── chat.ts              # TypeScript types
├── static/
│   ├── index.html               # Chat UI
│   ├── styles.css               # Styling
│   └── app.js                   # Client-side logic
└── CHAT_SETUP.md                # This file
```

## Next Steps

### Improvements for Future Iterations

1. **Reranking**: Add a reranking step after retrieval for better relevance
2. **Hybrid Search**: Combine semantic search with keyword matching
3. **Metadata Filtering UI**: Allow users to filter by category, date, author
4. **Conversation Persistence**: Store chat history in database
5. **User Accounts**: Replace password with proper authentication
6. **Larger Chunks**: Increase chunk size to 600-800 tokens for more context
7. **Mobile Optimization**: Improve responsive design
8. **Rate Limiting**: Add per-user rate limiting

## Support

For issues or questions:
1. Check Azure Function logs in Azure Portal
2. Review browser console for client-side errors
3. Check `local.settings.json` for missing variables
