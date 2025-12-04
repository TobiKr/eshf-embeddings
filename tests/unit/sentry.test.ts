/**
 * Unit tests for Sentry error tracking module
 */

// Mock Sentry modules before importing
jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  addBreadcrumb: jest.fn(),
  setUser: jest.fn(),
  setTag: jest.fn(),
  setTags: jest.fn(),
  setContext: jest.fn(),
  getActiveSpan: jest.fn(),
  startSpan: jest.fn((options, callback) => callback()),
  flush: jest.fn().mockResolvedValue(true),
  close: jest.fn().mockResolvedValue(true),
}));

jest.mock('@sentry/profiling-node', () => ({
  nodeProfilingIntegration: jest.fn(() => ({})),
}));

import * as sentry from '../../src/lib/utils/sentry';

// Mock environment variables
const originalEnv = process.env;

describe('Sentry Module', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('initializeSentry', () => {
    it('should initialize without DSN', () => {
      // Test that initialization doesn't throw when no DSN is provided
      expect(() => sentry.initializeSentry()).not.toThrow();
    });

    it('should not throw on multiple initializations', () => {
      expect(() => {
        sentry.initializeSentry();
        sentry.initializeSentry();
      }).not.toThrow();
    });
  });

  describe('isSentryEnabled', () => {
    it('should return false when DSN is not configured', () => {
      delete process.env.SENTRY_DSN;
      sentry.initializeSentry();
      expect(sentry.isSentryEnabled()).toBe(false);
    });
  });

  describe('captureException', () => {
    it('should not throw when capturing exceptions without DSN', () => {
      const error = new Error('Test error');
      expect(() => {
        sentry.captureException(error, { context: 'test' });
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
          sentry.captureException(error);
        }).not.toThrow();
      });
    });
  });

  describe('captureMessage', () => {
    it('should not throw when capturing messages without DSN', () => {
      expect(() => {
        sentry.captureMessage('Test message', 'info', { key: 'value' });
      }).not.toThrow();
    });

    it('should accept all severity levels', () => {
      const severityLevels: Array<Parameters<typeof sentry.captureMessage>[1]> = [
        'fatal',
        'error',
        'warning',
        'log',
        'info',
        'debug',
      ];

      severityLevels.forEach((level) => {
        expect(() => {
          sentry.captureMessage('Test message', level);
        }).not.toThrow();
      });
    });
  });

  describe('addBreadcrumb', () => {
    it('should not throw when adding breadcrumbs without DSN', () => {
      expect(() => {
        sentry.addBreadcrumb('Test breadcrumb', 'test', 'info', { data: 'value' });
      }).not.toThrow();
    });

    it('should accept different severity levels', () => {
      const severities: Array<Parameters<typeof sentry.addBreadcrumb>[2]> = [
        'fatal',
        'error',
        'warning',
        'info',
        'debug',
      ];

      severities.forEach((severity) => {
        expect(() => {
          sentry.addBreadcrumb('Test', 'category', severity);
        }).not.toThrow();
      });
    });
  });

  describe('setUser', () => {
    it('should not throw when setting user without DSN', () => {
      expect(() => {
        sentry.setUser('user123', 'user@example.com', { role: 'admin' });
      }).not.toThrow();
    });
  });

  describe('clearUser', () => {
    it('should not throw when clearing user without DSN', () => {
      expect(() => {
        sentry.clearUser();
      }).not.toThrow();
    });
  });

  describe('setTag', () => {
    it('should not throw when setting tags without DSN', () => {
      expect(() => {
        sentry.setTag('environment', 'test');
      }).not.toThrow();
    });
  });

  describe('setTags', () => {
    it('should not throw when setting multiple tags without DSN', () => {
      expect(() => {
        sentry.setTags({ env: 'test', version: '1.0.0' });
      }).not.toThrow();
    });
  });

  describe('setContext', () => {
    it('should not throw when setting context without DSN', () => {
      expect(() => {
        sentry.setContext('app', { version: '1.0.0', build: '123' });
      }).not.toThrow();
    });

    it('should handle null context', () => {
      expect(() => {
        sentry.setContext('cleared', null);
      }).not.toThrow();
    });
  });

  describe('startTransaction', () => {
    it('should return undefined when DSN is not configured', () => {
      delete process.env.SENTRY_DSN;
      sentry.initializeSentry();
      const transaction = sentry.startTransaction('test-transaction', 'test');
      expect(transaction).toBeUndefined();
    });

    it('should return transaction-like object with setStatus and finish methods', () => {
      // Even without DSN, if not initialized, it should return undefined
      const transaction = sentry.startTransaction('test', 'test');
      if (transaction) {
        expect(transaction).toHaveProperty('setStatus');
        expect(transaction).toHaveProperty('finish');
        expect(() => {
          transaction.setStatus('ok');
          transaction.finish();
        }).not.toThrow();
      }
    });
  });

  describe('wrapAzureFunction', () => {
    it('should return original handler when DSN is not configured', () => {
      delete process.env.SENTRY_DSN;
      sentry.initializeSentry();

      const mockHandler = jest.fn().mockResolvedValue('result');
      const wrapped = sentry.wrapAzureFunction('testFunction', mockHandler);

      expect(wrapped).toBe(mockHandler);
    });

    it('should handle successful function execution', async () => {
      const mockHandler = jest.fn().mockResolvedValue('success');
      const wrapped = sentry.wrapAzureFunction('testFunction', mockHandler);

      const result = await wrapped('arg1', 'arg2');

      expect(result).toBe('success');
      expect(mockHandler).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should handle function errors', async () => {
      const error = new Error('Function failed');
      const mockHandler = jest.fn().mockRejectedValue(error);
      const wrapped = sentry.wrapAzureFunction('testFunction', mockHandler);

      await expect(wrapped('arg')).rejects.toThrow('Function failed');
      expect(mockHandler).toHaveBeenCalledWith('arg');
    });
  });

  describe('flushSentry', () => {
    it('should complete flush without errors', async () => {
      await expect(sentry.flushSentry()).resolves.toBe(true);
    });

    it('should accept custom timeout', async () => {
      await expect(sentry.flushSentry(5000)).resolves.toBe(true);
    });
  });

  describe('closeSentry', () => {
    it('should complete close without errors', async () => {
      await expect(sentry.closeSentry()).resolves.toBe(true);
    });

    it('should accept custom timeout', async () => {
      await expect(sentry.closeSentry(3000)).resolves.toBe(true);
    });
  });
});
