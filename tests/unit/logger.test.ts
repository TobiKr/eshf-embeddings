/**
 * Unit tests for logger utility
 */

import * as logger from '../../src/lib/utils/logger';

describe('Logger Utility', () => {
  let consoleDebugSpy: jest.SpyInstance;
  let consoleInfoSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('debug', () => {
    it('should log debug messages', () => {
      logger.debug('Test debug message');
      expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
      expect(consoleDebugSpy.mock.calls[0][0]).toContain('[DEBUG]');
      expect(consoleDebugSpy.mock.calls[0][0]).toContain('Test debug message');
    });

    it('should include context in debug logs', () => {
      logger.debug('Test debug', { userId: '123', action: 'login' });
      expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
      const logOutput = consoleDebugSpy.mock.calls[0][0];
      expect(logOutput).toContain('userId');
      expect(logOutput).toContain('123');
    });
  });

  describe('info', () => {
    it('should log info messages', () => {
      logger.info('Test info message');
      expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
      expect(consoleInfoSpy.mock.calls[0][0]).toContain('[INFO]');
      expect(consoleInfoSpy.mock.calls[0][0]).toContain('Test info message');
    });

    it('should include timestamp', () => {
      logger.info('Test');
      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('warn', () => {
    it('should log warning messages', () => {
      logger.warn('Test warning');
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy.mock.calls[0][0]).toContain('[WARN]');
      expect(consoleWarnSpy.mock.calls[0][0]).toContain('Test warning');
    });
  });

  describe('error', () => {
    it('should log error messages', () => {
      logger.error('Test error');
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('[ERROR]');
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('Test error');
    });
  });

  describe('logError', () => {
    it('should log error with error object details', () => {
      const testError = new Error('Test error object');
      logger.logError('Error occurred', testError);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const logOutput = consoleErrorSpy.mock.calls[0][0];
      expect(logOutput).toContain('Error occurred');
      expect(logOutput).toContain('errorName');
      expect(logOutput).toContain('errorMessage');
      expect(logOutput).toContain('Test error object');
    });

    it('should include additional context with error', () => {
      const testError = new Error('Test error');
      logger.logError('Error with context', testError, { postId: '123' });

      const logOutput = consoleErrorSpy.mock.calls[0][0];
      expect(logOutput).toContain('postId');
      expect(logOutput).toContain('123');
    });
  });
});
