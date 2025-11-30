# ESHF Embeddings

A TypeScript/Node.js Azure Functions solution that processes German energy-saving house forum posts, generates vector embeddings using OpenAI's API, and stores them in Pinecone for semantic search capabilities.

## Overview

This project implements a queue-based serverless architecture for processing forum posts from Azure Cosmos DB, generating embeddings, and storing them in a vector database for efficient semantic search. The system is designed to handle German language content with support for umlauts, quoted replies, and forum-specific formatting.

## Key Features

- **Queue-based architecture** for scalable, decoupled processing
- **Smart text chunking** with overlap for better retrieval
- **German language support** (umlauts, quoted replies, forum-specific formatting)
- **Rate limit handling** with exponential backoff for OpenAI API
- **Comprehensive metadata preservation** (category, author, timestamp, thread context)
- **Production-ready** error handling, monitoring, and dead-letter queue support

## Technology Stack

- **Runtime**: Azure Functions v4 (Programming Model v4)
- **Language**: TypeScript 5.x with Node.js 20.x
- **Database**: Azure Cosmos DB (NoSQL storage for forum posts)
- **Vector Database**: Pinecone (serverless vector storage)
- **AI/ML**: OpenAI Embeddings API (text-embedding-3-small/large)
- **Queue System**: Azure Storage Queues (decoupled processing pipeline)
- **Monitoring**: Azure Application Insights

## Architecture

The system uses a queue-based serverless architecture with four main Azure Functions:

1. **PostDiscovery Function** (Timer Trigger) - Queries Cosmos DB for unprocessed posts and enqueues them
2. **EmbeddingProcessor Function** (Queue Trigger) - Generates embeddings via OpenAI API
3. **PineconeUploader Function** (Queue Trigger) - Batch upserts vectors to Pinecone and updates Cosmos DB
4. **ManualProcessor Function** (HTTP Trigger) - Manual processing endpoint for specific posts or bulk operations

### Design Principles

- Decoupled processing via Azure Storage Queues for independent scaling
- Retry logic with exponential backoff for external API calls
- Dead-letter queue handling for failed messages
- Comprehensive telemetry and monitoring via Application Insights

## Project Structure

```
eshf-embeddings/
├── src/
│   ├── functions/
│   │   ├── postDiscovery.ts          # Timer trigger - discovers new posts
│   │   ├── embeddingProcessor.ts     # Queue trigger - generates embeddings
│   │   ├── pineconeUploader.ts       # Queue trigger - uploads to Pinecone
│   │   └── manualProcessor.ts        # HTTP trigger - manual processing
│   ├── lib/
│   │   ├── cosmos/                   # Cosmos DB client and queries
│   │   ├── openai/                   # OpenAI API integration
│   │   ├── pinecone/                 # Pinecone vector database client
│   │   ├── chunking/                 # Text chunking and preprocessing
│   │   ├── queue/                    # Azure Queue client
│   │   └── utils/                    # Logging, errors, metrics
│   └── types/                        # TypeScript type definitions
├── tests/
│   ├── unit/                         # Unit tests
│   └── integration/                  # Integration tests
├── terraform/                        # Infrastructure as Code (Terraform)
├── specs/                            # ExecPlans and specifications
├── host.json                         # Function app configuration
├── package.json
└── tsconfig.json
```

## Getting Started

### Prerequisites

- Node.js 20.x or later
- Azure Functions Core Tools v4
- Azure subscription with:
  - Azure Cosmos DB account
  - Azure Storage account
  - Application Insights instance
- OpenAI API key
- Pinecone API key

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd eshf-embeddings
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables (see Configuration section)

4. Build the project:
   ```bash
   npm run build
   ```

### Configuration

Create a `local.settings.json` file in the root directory with the required environment variables:

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "<storage-connection-string>",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "COSMOS_ENDPOINT": "<cosmos-db-endpoint>",
    "COSMOS_KEY": "<cosmos-db-key>",
    "COSMOS_DATABASE": "<database-name>",
    "COSMOS_CONTAINER": "<container-name>",
    "OPENAI_API_KEY": "<openai-api-key>",
    "PINECONE_API_KEY": "<pinecone-api-key>",
    "PINECONE_INDEX": "<pinecone-index-name>",
    "APPINSIGHTS_INSTRUMENTATIONKEY": "<app-insights-key>"
  }
}
```

## Development

### Common Commands

- `npm install` - Install/sync dependencies
- `npm install <package>` - Add a dependency
- `npm test` - Run tests with Jest
- `npm run lint` - Run ESLint for code quality
- `npm run format` - Format code with Prettier
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Start Azure Functions locally (alias for `func start`)

### Running Locally

Start the Azure Functions runtime locally:

```bash
npm start
```

The functions will be available at:
- PostDiscovery: Timer trigger (runs on schedule)
- EmbeddingProcessor: Queue trigger (processes messages from queue)
- PineconeUploader: Queue trigger (processes messages from queue)
- ManualProcessor: `http://localhost:7071/api/manual-processor`

## Testing

The project uses Jest with ts-jest for testing. Tests are organized into:

- **Unit tests** (`tests/unit/`) - Test individual modules and functions in isolation
- **Integration tests** (`tests/integration/`) - Test interactions with external services

### Running Tests

```bash
npm test
```

### Test Coverage

Run tests with coverage report:

```bash
npm test -- --coverage
```

## Code Style

- **Variables and Functions**: `camelCase`
- **Classes/Types/Interfaces**: `PascalCase`
- **Constants**: `UPPER_SNAKE_CASE`
- **TypeScript strict mode** enabled
- **ESLint** for code quality
- **Prettier** for code formatting

## Deployment

Deploy to Azure using Azure Functions Core Tools:

```bash
func azure functionapp publish <function-app-name>
```

Or use the Infrastructure as Code (Terraform) templates in the `terraform/` directory for automated deployment.

## Monitoring

Monitor the application using:
- **Azure Application Insights** for telemetry and performance metrics
- **Azure Portal** for function execution logs
- **Dead-letter queues** for failed message analysis

## Contributing

Every contribution is welcome!
