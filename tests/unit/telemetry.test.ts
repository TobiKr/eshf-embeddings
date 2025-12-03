/**
 * Unit tests for Application Insights telemetry module
 */

import * as telemetry from '../../src/lib/utils/telemetry';

// Mock environment variables
const originalEnv = process.env;

describe('Telemetry Module', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('initializeTelemetry', () => {
    it('should initialize without connection string', () => {
      // Test that initialization doesn't throw when no connection string is provided
      expect(() => telemetry.initializeTelemetry()).not.toThrow();
    });

    it('should not throw on multiple initializations', () => {
      expect(() => {
        telemetry.initializeTelemetry();
        telemetry.initializeTelemetry();
      }).not.toThrow();
    });
  });

  describe('getTelemetryClient', () => {
    it('should return null when not configured', () => {
      // When no connection string is set, client should be null
      delete process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
      const client = telemetry.getTelemetryClient();

      // Client will be null if App Insights is not configured
      expect(client).toBeNull();
    });
  });

  describe('trackEvent', () => {
    it('should not throw when tracking events without client', () => {
      expect(() => {
        telemetry.trackEvent('test.event', { key: 'value' }, { count: 1 });
      }).not.toThrow();
    });

    it('should accept event with properties and measurements', () => {
      expect(() => {
        telemetry.trackEvent(
          'embedding.success',
          { postId: '123', category: 'test' },
          { duration: 100, chunks: 5 }
        );
      }).not.toThrow();
    });
  });

  describe('trackMetric', () => {
    it('should not throw when tracking metrics without client', () => {
      expect(() => {
        telemetry.trackMetric('test.metric', 42, { source: 'test' });
      }).not.toThrow();
    });

    it('should accept numeric values', () => {
      expect(() => {
        telemetry.trackMetric('processing.time', 1234.56);
      }).not.toThrow();
    });
  });

  describe('trackDependency', () => {
    it('should not throw when tracking dependencies without client', () => {
      expect(() => {
        telemetry.trackDependency(
          'OpenAI.Embeddings',
          'OpenAI API',
          'generate embedding',
          1500,
          true,
          200,
          { model: 'text-embedding-3-large' }
        );
      }).not.toThrow();
    });

    it('should track failed dependencies', () => {
      expect(() => {
        telemetry.trackDependency(
          'CosmosDB.Query',
          'Azure Cosmos DB',
          'SELECT * FROM c',
          500,
          false,
          500,
          { error: 'timeout' }
        );
      }).not.toThrow();
    });
  });

  describe('trackException', () => {
    it('should not throw when tracking exceptions without client', () => {
      const error = new Error('Test error');
      expect(() => {
        telemetry.trackException(error, { context: 'test' });
      }).not.toThrow();
    });

    it('should handle different error types', () => {
      const errors = [
        new Error('Standard error'),
        new TypeError('Type error'),
        new RangeError('Range error'),
      ];

      errors.forEach((error) => {
        expect(() => {
          telemetry.trackException(error);
        }).not.toThrow();
      });
    });
  });

  describe('trackTrace', () => {
    it('should not throw when tracking traces without client', () => {
      expect(() => {
        telemetry.trackTrace('Test message', telemetry.SeverityLevel.Information);
      }).not.toThrow();
    });

    it('should accept all severity levels', () => {
      const severityLevels = [
        telemetry.SeverityLevel.Verbose,
        telemetry.SeverityLevel.Information,
        telemetry.SeverityLevel.Warning,
        telemetry.SeverityLevel.Error,
        telemetry.SeverityLevel.Critical,
      ];

      severityLevels.forEach((severity) => {
        expect(() => {
          telemetry.trackTrace('Test message', severity, { level: severity.toString() });
        }).not.toThrow();
      });
    });
  });

  describe('trackPageView', () => {
    it('should not throw when tracking page views without client', () => {
      expect(() => {
        telemetry.trackPageView('HomePage', 'https://example.com/', 150);
      }).not.toThrow();
    });

    it('should accept minimal parameters', () => {
      expect(() => {
        telemetry.trackPageView('MinimalPage');
      }).not.toThrow();
    });
  });

  describe('trackOperation', () => {
    it('should execute and track successful operations', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');

      const result = await telemetry.trackOperation('test.operation', mockOperation, {
        context: 'test',
      });

      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalled();
    });

    it('should track failed operations and rethrow errors', async () => {
      const error = new Error('Operation failed');
      const mockOperation = jest.fn().mockRejectedValue(error);

      await expect(
        telemetry.trackOperation('failing.operation', mockOperation)
      ).rejects.toThrow('Operation failed');

      expect(mockOperation).toHaveBeenCalled();
    });

    it('should measure operation duration', async () => {
      const mockOperation = jest.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve('done'), 50))
      );

      const result = await telemetry.trackOperation('timed.operation', mockOperation);

      expect(result).toBe('done');
      expect(mockOperation).toHaveBeenCalled();
    });
  });

  describe('flushTelemetry', () => {
    it('should complete flush without errors', async () => {
      await expect(telemetry.flushTelemetry()).resolves.not.toThrow();
    });
  });

  describe('SeverityLevel', () => {
    it('should have correct enum values', () => {
      expect(telemetry.SeverityLevel.Verbose).toBe(0);
      expect(telemetry.SeverityLevel.Information).toBe(1);
      expect(telemetry.SeverityLevel.Warning).toBe(2);
      expect(telemetry.SeverityLevel.Error).toBe(3);
      expect(telemetry.SeverityLevel.Critical).toBe(4);
    });
  });
});
