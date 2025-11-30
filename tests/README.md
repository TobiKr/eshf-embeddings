# ESHF Embeddings - Test Suite

This directory contains the test suite for the ESHF embeddings pipeline.

## Test Structure

```
tests/
├── unit/               # Unit tests (no external dependencies)
│   ├── logger.test.ts
│   ├── errors.test.ts
│   └── metadata.test.ts
└── integration/        # Integration tests (require real services)
    ├── cosmos.test.ts
    ├── openai.test.ts
    └── pinecone.test.ts
```

## Running Tests

### Run All Tests

```bash
npm test
```

### Run Only Unit Tests

```bash
npm test -- unit
```

### Run Only Integration Tests

```bash
npm test -- integration
```

### Run Specific Test File

```bash
npm test -- logger.test.ts
npm test -- cosmos.test.ts
```

### Run Tests with Coverage

```bash
npm test -- --coverage
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

## Unit Tests

Unit tests are fast, isolated tests that don't require external services. They test:

- **logger.test.ts** - Logging utilities and formatting
- **errors.test.ts** - Custom error classes and type guards
- **metadata.test.ts** - Pinecone metadata formatting and validation

**Requirements:** None - these tests run standalone

## Integration Tests

Integration tests make real API calls to external services. They test:

- **cosmos.test.ts** - Cosmos DB queries and operations
- **openai.test.ts** - OpenAI embeddings generation
- **pinecone.test.ts** - Pinecone vector upsert and query

**Requirements:**
- Valid credentials in `local.settings.json`
- Network access to Azure, OpenAI, and Pinecone
- **NOTE:** Integration tests may incur costs (especially OpenAI API calls)

### Configuration for Integration Tests

Ensure your `local.settings.json` contains:

```json
{
  "IsEncrypted": false,
  "Values": {
    "COSMOS_ENDPOINT": "https://your-cosmos-account.documents.azure.com:443/",
    "COSMOS_KEY": "your-cosmos-key",
    "COSMOS_DATABASE": "eshf-forum",
    "COSMOS_CONTAINER": "posts",
    "OPENAI_API_KEY": "sk-...",
    "OPENAI_MODEL": "text-embedding-3-large",
    "PINECONE_API_KEY": "pcsk_...",
    "PINECONE_HOST": "https://your-index.svc.pinecone.io",
    "PINECONE_INDEX": "eshf"
  }
}
```

## Test Timeouts

Integration tests have a 30-second timeout to account for network latency. If tests timeout:

1. Check your network connection
2. Verify credentials are correct
3. Check service availability

## Skipping Integration Tests

Integration tests automatically skip if credentials are not configured. You'll see:

```
Skipping: Cosmos DB credentials not configured
```

This is normal and expected if you haven't set up `local.settings.json`.

## Writing New Tests

### Unit Test Template

```typescript
import { functionToTest } from '../../src/lib/module/file';

describe('Module Name', () => {
  describe('functionToTest', () => {
    it('should do something', () => {
      const result = functionToTest('input');
      expect(result).toBe('expected');
    });
  });
});
```

### Integration Test Template

```typescript
import { functionToTest } from '../../src/lib/module/file';

describe('Module Integration Tests', () => {
  beforeAll(() => {
    if (!process.env.REQUIRED_ENV_VAR) {
      console.warn('Env var not set. Skipping tests.');
    }
  });

  it('should test integration', async () => {
    if (!process.env.REQUIRED_ENV_VAR) {
      console.log('Skipping: credentials not configured');
      return;
    }

    const result = await functionToTest();
    expect(result).toBeDefined();
  }, 30000); // 30 second timeout
});
```

## Continuous Integration

Tests are run automatically on:
- Pull requests
- Pushes to main branch
- Before deployments

See `.github/workflows/ci.yml` for CI configuration.
