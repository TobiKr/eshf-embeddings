/**
 * Structured logging utilities for Azure Functions
 *
 * Compatible with Application Insights for cloud monitoring.
 */

import { trackTrace, trackException, SeverityLevel } from './telemetry';

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
 * Convert LogContext to string properties for Application Insights
 */
function contextToProperties(context?: LogContext): Record<string, string> | undefined {
  if (!context) return undefined;

  const properties: Record<string, string> = {};
  for (const [key, value] of Object.entries(context)) {
    properties[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
  return properties;
}

/**
 * Log debug message
 */
export function debug(message: string, context?: LogContext): void {
  const formattedMessage = formatLogMessage(LogLevel.DEBUG, message, context);
  console.debug(formattedMessage);
  trackTrace(message, SeverityLevel.Verbose, contextToProperties(context));
}

/**
 * Log informational message
 */
export function info(message: string, context?: LogContext): void {
  const formattedMessage = formatLogMessage(LogLevel.INFO, message, context);
  console.info(formattedMessage);
  trackTrace(message, SeverityLevel.Information, contextToProperties(context));
}

/**
 * Log warning message
 */
export function warn(message: string, context?: LogContext): void {
  const formattedMessage = formatLogMessage(LogLevel.WARN, message, context);
  console.warn(formattedMessage);
  trackTrace(message, SeverityLevel.Warning, contextToProperties(context));
}

/**
 * Log error message
 */
export function error(message: string, context?: LogContext): void {
  const formattedMessage = formatLogMessage(LogLevel.ERROR, message, context);
  console.error(formattedMessage);
  trackTrace(message, SeverityLevel.Error, contextToProperties(context));
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

  // Also track as exception in Application Insights
  trackException(err, contextToProperties(context));
}
