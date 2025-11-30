# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Project Overview

This is a **TypeScript/Node.js** Azure Functions solution that processes German energy-saving house forum posts from Azure Cosmos DB, generates vector embeddings using OpenAI's API, and stores them in Pinecone for semantic search capabilities.

**Main Technologies**:
- **Runtime**: Azure Functions v4 (Programming Model v4)
- **Language**: TypeScript 5.x with Node.js 20.x
- **Database**: Azure Cosmos DB (NoSQL storage for forum posts)
- **Vector Database**: Pinecone (serverless vector storage)
- **AI/ML**: OpenAI Embeddings API (text-embedding-3-small/large)
- **Queue System**: Azure Storage Queues (decoupled processing pipeline)
- **Monitoring**: Azure Application Insights

**Key Features**:
- Queue-based architecture for scalable, decoupled processing
- Smart text chunking with overlap for better retrieval
- German language support (umlauts, quoted replies, forum-specific formatting)
- Rate limit handling with exponential backoff for OpenAI API
- Comprehensive metadata preservation (category, author, timestamp, thread context)
- Production-ready error handling, monitoring, and dead-letter queue support

# Skills Protocol (Superpowers)

## Mandatory First Response Protocol

Before responding to ANY user message, you MUST complete this checklist:

1. ☐ List available skills in your mind
2. ☐ Ask yourself: "Does ANY skill match this request?"
3. ☐ If yes → Use the Skill tool to read and run the skill file
4. ☐ Announce which skill you're using
5. ☐ Follow the skill exactly

**Responding WITHOUT completing this checklist = automatic failure.**

## Common Rationalizations That Mean You're About To Fail

If you catch yourself thinking ANY of these thoughts, STOP. You are rationalizing. Check for and use the skill.

- "This is just a simple question" → WRONG. Questions are tasks. Check for skills.
- "I can check git/files quickly" → WRONG. Files don't have conversation context. Check for skills.
- "Let me gather information first" → WRONG. Skills tell you HOW to gather information. Check for skills.
- "This doesn't need a formal skill" → WRONG. If a skill exists for it, use it.
- "I remember this skill" → WRONG. Skills evolve. Run the current version.
- "This doesn't count as a task" → WRONG. If you're taking action, it's a task. Check for skills.
- "The skill is overkill for this" → WRONG. Skills exist because simple things become complex. Use it.
- "I'll just do this one thing first" → WRONG. Check for skills BEFORE doing anything.

**Why:** Skills document proven techniques that save time and prevent mistakes. Not using available skills means repeating solved problems and making known errors.

If a skill for your task exists, you must use it or you will fail at your task.

## How to Use Skills

You have skills available.

### Automatic Setup Detection

**IMPORTANT:** Before attempting to use skills, you MUST verify that the skills system and CLAUDE.md is properly configured by checking if you see skills like this. Also if the user already has a well-formatted CLAUDE.md with the project information filled in below, you can skip the setup:

# Should see:
# /superpowers:brainstorm - Interactive design refinement
# /superpowers:write-plan - Create implementation plan
# /superpowers:execute-plan - Execute plan in batches

1. **Inform the user:** "I've detected that the agent instructions system is not yet set up. I'll automatically install it now by fetching the metaprompt from the agent-instructions repository and executing it. You will need to install the setup process described in: https://github.com/obra/superpowers/tree/main?tab=readme-ov-file#claude-code-via-plugin-marketplace to enable Claude Code Superpowers."

2. **Clone the metaprompt from the remote repository:**

   **IMPORTANT:** The metaprompt is stored as **METAPROMPT.md** in the `agent-setup` branch of the **agent-instructions repository** (`https://github.com/flora131/agent-instructions.git`), NOT in the user's current project repository. You must clone this external repository to access the metaprompt.
   
   ```bash
   # Create temporary directory
   TEMP_DIR=$(mktemp -d)
   echo "Fetching metaprompt from agent-instructions repository..."
   
   # Clone the agent-setup branch from the agent-instructions repository
   # This is an EXTERNAL repository, not the user's current project
   git clone -b agent-setup https://github.com/flora131/agent-instructions.git "$TEMP_DIR/agent-instructions"
   
   # The METAPROMPT.md is now available at: $TEMP_DIR/agent-instructions/METAPROMPT.md
   ```

3. **Read the METAPROMPT.md file** from the temporary directory and follow ALL instructions in order:
   - **Phase 1**: Analyze the project and populate CLAUDE.md file
   - **Phase 2**: IMPORTANT: Since you are Claude Code, you MUST stop after Phase 1 because you already have native skills support. You do NOT need to set up skills again.
   - The metaprompt provides comprehensive instructions for both phases

4. **Execute each step automatically** following the metaprompt's two-phase process - don't wait for approval between steps

5. **If any step fails:**
   - STOP immediately and inform the user what went wrong
   - Show the error message clearly
   - Explain what the error means in plain language
   - Suggest possible fixes from the Troubleshooting section in SETUP.md (which will be referenced by METAPROMPT.md)
   - Ask the user for help if the issue is unclear

6. **Clean up temporary directory** after setup completes:
   ```bash
   rm -rf "$TEMP_DIR"
   ```

### Skills with Checklists

If a skill has a checklist, you MUST create TodoWrite todos for EACH item.

**Don't:**
- Work through checklist mentally
- Skip creating todos "to save time"
- Batch multiple items into one todo
- Mark complete without doing them

**Why:** Checklists without TodoWrite tracking = steps get skipped. Every time. The overhead of TodoWrite is tiny compared to the cost of missing steps.

## Key Principles

1. **Finding a relevant skill = mandatory to read and use it.** Not optional.
2. **Skills document proven techniques** that save time and prevent mistakes.
3. **Always announce** which skill you're using and why.
4. **Follow skills exactly** - don't rationalize away the discipline.
5. **Create TodoWrite todos** for any skill checklists.

## Custom Agents

The system supports custom specialized agents stored in agent-specific directories. These agents can be invoked for specific tasks that match their expertise.

### Agent Selection and Usage

- IMPORTANT: ALWAYS start by invoking the agent-organizer sub-agent, an expert agent organizer specializing in multi-agent orchestration.
- Custom agents are automatically selected based on the context and task requirements
- The system analyzes the user's request and matches it with the most appropriate specialized agent
- Multiple sub-agents can work in parallel on different aspects of a complex task
- **Maximum parallel agents**: 50 sub-agents can operate simultaneously
- Each agent has its own expertise domain defined in its configuration
- Agents can coordinate and share context through the main agent orchestrator

### When Custom Agents Are Used

The system automatically invokes custom agents when:
- The task matches a specialized agent's expertise domain
- Complex tasks benefit from parallel processing across multiple specialized agents
- Domain-specific knowledge or workflows are required
- The main agent determines delegation would improve efficiency or accuracy

# ExecPlans

When writing complex features or significant refactors, use an ExecPlan (as described in `specs/PLANS.md`) from design to implementation. If the user request requires multiple specs, create multiple specification files in the `specs/` directory. After creating the specs, create a master ExecPlan that links to each individual spec ExecPlan. Update the `specs/README.md` to include links to the new specs.

ALWAYS start an ExecPlan creation by consulting the DeepWiki tool for best practices on design patterns, architecture, and implementation strategies. Ask it questions about the system design and constructs in the library that will help you achieve your goals.

Skip using an ExecPlan for straightforward tasks (roughly the easiest 25%).

# Architecture

**Pattern**: Queue-based serverless architecture using Azure Functions v4 Programming Model.

**Key Components**:
1. **PostDiscovery Function** (Timer Trigger) - Queries Cosmos DB for unprocessed posts and enqueues them
2. **EmbeddingProcessor Function** (Queue Trigger) - Generates embeddings via OpenAI API
3. **PineconeUploader Function** (Queue Trigger) - Batch upserts vectors to Pinecone and updates Cosmos DB
4. **ManualProcessor Function** (HTTP Trigger) - Manual processing endpoint for specific posts or bulk operations

**Design Principles**:
- Decoupled processing via Azure Storage Queues for independent scaling
- Retry logic with exponential backoff for external API calls
- Dead-letter queue handling for failed messages
- Comprehensive telemetry and monitoring via Application Insights

**Project Structure**:
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
├── infra/                            # Infrastructure as Code (Bicep)
├── specs/                            # ExecPlans and specifications
├── host.json                         # Function app configuration
├── package.json
└── tsconfig.json
```

For detailed architecture documentation, see [ARCHITECTURE.md](ARCHITECTURE.md).

# Development Guidelines

## General

- Before implementing a large refactor or new feature explain your plan and get approval.
- Human-in-the-loop: If you're unsure about a design decision or implementation detail, ask for clarification before proceeding. Feel free to ask clarifying questions as you are working.
- Avoid re-inventing the wheel: Use existing libraries and tools where appropriate.

## TypeScript/Node.js

`npm` is the package manager used to manage dependencies and development tasks. Below are the common commands:

- `npm install` - Install/sync dependencies
- `npm install <package>` - Add a dependency
- `npm test` - Run tests with Jest
- `npm run lint` - Run ESLint for code quality
- `npm run format` - Format code with Prettier
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Start Azure Functions locally (alias for `func start`)

### Technology Stack Focus
- **Node.js 20.x**: LTS runtime for Azure Functions v4
- **TypeScript 5.x**: Type-safe development with full IntelliSense support
- **Azure Functions v4**: Programming Model v4 with inline trigger/binding definitions (no function.json files)
- **@azure/functions**: Azure Functions SDK for Node.js
- **@azure/cosmos**: Cosmos DB SDK for querying and updating forum posts
- **@azure/storage-queue**: Azure Storage Queue SDK for message passing
- **OpenAI SDK**: Official OpenAI client for embeddings generation
- **@pinecone-database/pinecone**: Pinecone client for vector storage
- **tiktoken**: Official OpenAI tokenizer for chunking logic

### Code Organization and Modularity

**Prefer highly modular code** that separates concerns into distinct modules. This improves:
- **Testability**: Each module can be tested in isolation
- **Reusability**: Modules can be used independently
- **Maintainability**: Changes are localized to specific modules
- **Readability**: Clear separation of concerns makes code easier to understand

**Guidelines**:
- Keep modules focused on a single responsibility
- Use clear module boundaries and minimal public APIs
- Prefer composition over large monolithic modules
- Extract shared functionality into dedicated modules as the codebase grows

# Code Style

## Documentation

**IMPORTANT: Documentation means docstrings and type hints in the code, NOT separate documentation files.**

- You should NOT create any separate documentation pages (README files, markdown docs, etc.)
- The code itself should contain proficient documentation in the form of docstrings and type hints (for Python)
- For Python: Add comprehensive numpy-style docstrings to all functions, classes, and modules
- Type stubs (.pyi files) should have detailed descriptions for all exported functions and classes

**Avoid Over-Documenting:**
- Do NOT document obvious behavior (e.g., a function named `get_name` that returns a name doesn't need extensive documentation)
- Focus documentation on WHY and HOW, not WHAT (the code itself shows what it does)
- Document edge cases, non-obvious behavior, and important constraints
- Skip docstrings for trivial functions where the name and type hints are self-explanatory
- Prioritize documenting public APIs, complex logic, and non-intuitive design decisions

## TypeScript Code Style

### Documentation and Comments

- Use JSDoc comments for public functions, classes, and complex logic
- Ensure functions have descriptive names with clear parameter types
- Document non-obvious behavior, edge cases, and important constraints
- Avoid over-documenting obvious functionality

**Example**:
```typescript
/**
 * Chunks text content into overlapping segments for embedding generation.
 *
 * @param content - The text content to chunk
 * @param maxTokens - Maximum tokens per chunk (default: 400)
 * @param overlap - Token overlap between chunks (default: 50)
 * @returns Array of text chunks with metadata
 */
export function chunkText(content: string, maxTokens = 400, overlap = 50): Chunk[] {
  // Implementation
}
```

### Naming Conventions

- **Variables and Functions**: `camelCase` (e.g., `processPost`, `embeddings`)
- **Classes/Types/Interfaces**: `PascalCase` (e.g., `ForumPost`, `EmbeddingResult`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `MAX_RETRIES`, `BATCH_SIZE`)
- **Private members**: prefix with `_` if needed (e.g., `_internalState`)
- **Type files**: Use descriptive names matching their content (e.g., `post.ts`, `queue.ts`)

### Additional TypeScript Guidelines

- **Always use explicit types** - Avoid `any`, prefer `unknown` if type is truly unknown
- **Prefer interfaces over types** for object shapes (better for extension)
- **Use strict mode** - Ensure `tsconfig.json` has `"strict": true`
- **Async/await over promises** - More readable and easier to debug
- **Error handling** - Always handle errors in async functions, use custom error classes
- **Immutability** - Prefer `const` over `let`, use readonly properties where appropriate

# Test-Driven Development (TDD)

- Never create throwaway test scripts or ad hoc verification files
- If you need to test functionality, write a proper test in the test suite

## Testing Guidelines

- Write tests for all new features in the `tests/` directory
- Use **Jest** with **ts-jest** as the testing framework
- Organize tests into `unit/` and `integration/` subdirectories
- Use Jest's built-in mocking capabilities for external dependencies
- Aim for high test coverage, especially for:
  - Chunking logic (various content lengths, edge cases)
  - OpenAI API integration (rate limiting, retries, error handling)
  - Queue message processing (serialization, error scenarios)
  - Cosmos DB queries and updates
- Always include test cases for:
  - Empty inputs and null/undefined values
  - Invalid data types and malformed data
  - Large datasets and performance edge cases
  - German language special characters (umlauts, ß)
  - Rate limit scenarios and retry logic
- Include comments explaining edge cases and expected behavior

**Testing Structure**:
```
tests/
├── unit/
│   ├── chunking.test.ts           # Text chunking algorithm tests
│   ├── embeddings.test.ts         # OpenAI API wrapper tests
│   └── preprocessor.test.ts       # Content preprocessing tests
└── integration/
    ├── cosmos.test.ts             # Cosmos DB integration tests
    ├── openai.test.ts             # OpenAI API integration tests
    └── pinecone.test.ts           # Pinecone integration tests
```

# Tools

You have a collection of tools available to assist with development and debugging. These tools can be invoked as needed.

- `sequential-thinking-tools`
  - **When to use:** For complex reasoning tasks that require step-by-step analysis. A good rule of thumb is if the task requires more than 25% effort.
- `deepwiki`
  - **When to use:** Consult for external knowledge or documentation that is not part of the immediate codebase. Can be helpful for system design questions or understanding third-party libraries.
- `context7`
  - **When to use:** For retrieving immediate documentation on the latest version of a library or framework. Useful for quick lookups to double-check syntax, parameters, or usage examples.
- `playwright`
  - **When to use:** For end-to-end testing of web applications. Use this tool to automate browser interactions and verify UI functionality. Can also be used for discovering documentation pages for third-party libraries.

# Updates to This Document
- Update this document as needed to reflect changes in development practices or project structure
  - Updates usually come in the form of the package structure changing
- Do NOT contradict existing guidelines in the document
- This document should be an executive summary of the development practices for this project
  - Keep low-level implementation details out of this document