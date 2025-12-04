/**
 * Structured logging utilities for Azure Functions
 *
 * All console logs are automatically captured by Sentry via captureConsoleIntegration.
 * No manual breadcrumbs or message capturing needed.
 */

import { captureException } from './sentry';

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

interface LogContext {
  [key: string]: unknown;
}

/**
 * Formats a log message with timestamp and context
 */
function formatLogMessage(
  level: LogLevel,
  message: string,
  context?: LogContext
): string {
  const timestamp = new Date().toISOString();
  const contextStr = context ? ` | ${JSON.stringify(context)}` : '';
  return `[${timestamp}] [${level}] ${message}${contextStr}`;
}

/**
 * Log debug message
 * Automatically captured by Sentry console integration
 */
export function debug(message: string, context?: LogContext): void {
  const formattedMessage = formatLogMessage(LogLevel.DEBUG, message, context);
  console.debug(formattedMessage);
}

/**
 * Log informational message
 * Automatically captured by Sentry console integration
 */
export function info(message: string, context?: LogContext): void {
  const formattedMessage = formatLogMessage(LogLevel.INFO, message, context);
  console.info(formattedMessage);
}

/**
 * Log warning message
 * Automatically captured by Sentry console integration
 */
export function warn(message: string, context?: LogContext): void {
  const formattedMessage = formatLogMessage(LogLevel.WARN, message, context);
  console.warn(formattedMessage);
}

/**
 * Log error message
 * Automatically captured by Sentry console integration
 */
export function error(message: string, context?: LogContext): void {
  const formattedMessage = formatLogMessage(LogLevel.ERROR, message, context);
  console.error(formattedMessage);
}

/**
 * Log error with full error object details
 * Uses Sentry's captureException for rich error tracking
 */
export function logError(message: string, err: Error, context?: LogContext): void {
  const errorContext = {
    ...context,
    errorName: err.name,
    errorMessage: err.message,
    errorStack: err.stack,
  };

  const formattedMessage = formatLogMessage(LogLevel.ERROR, message, errorContext);
  console.error(formattedMessage);

  // Capture exception in Sentry with full context for detailed error tracking
  captureException(err, context);
}
