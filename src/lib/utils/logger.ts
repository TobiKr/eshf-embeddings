/**
 * Structured logging utilities for Azure Functions
 *
 * Compatible with Application Insights for cloud monitoring.
 */

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
 */
export function debug(message: string, context?: LogContext): void {
  console.debug(formatLogMessage(LogLevel.DEBUG, message, context));
}

/**
 * Log informational message
 */
export function info(message: string, context?: LogContext): void {
  console.info(formatLogMessage(LogLevel.INFO, message, context));
}

/**
 * Log warning message
 */
export function warn(message: string, context?: LogContext): void {
  console.warn(formatLogMessage(LogLevel.WARN, message, context));
}

/**
 * Log error message
 */
export function error(message: string, context?: LogContext): void {
  console.error(formatLogMessage(LogLevel.ERROR, message, context));
}

/**
 * Log error with full error object details
 */
export function logError(message: string, err: Error, context?: LogContext): void {
  const errorContext = {
    ...context,
    errorName: err.name,
    errorMessage: err.message,
    errorStack: err.stack,
  };
  error(message, errorContext);
}
