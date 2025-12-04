/**
 * Structured logging utilities for Azure Functions
 *
 * Compatible with Application Insights and Sentry for cloud monitoring.
 */

import { trackTrace, trackException, SeverityLevel } from './telemetry';
import { captureException, captureMessage, addBreadcrumb } from './sentry';

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

  // Add as breadcrumb to Sentry for debugging context
  addBreadcrumb(message, 'debug', 'debug', context);
}

/**
 * Log informational message
 */
export function info(message: string, context?: LogContext): void {
  const formattedMessage = formatLogMessage(LogLevel.INFO, message, context);
  console.info(formattedMessage);
  trackTrace(message, SeverityLevel.Information, contextToProperties(context));

  // Add as breadcrumb to Sentry for debugging context
  addBreadcrumb(message, 'info', 'info', context);
}

/**
 * Log warning message
 */
export function warn(message: string, context?: LogContext): void {
  const formattedMessage = formatLogMessage(LogLevel.WARN, message, context);
  console.warn(formattedMessage);
  trackTrace(message, SeverityLevel.Warning, contextToProperties(context));

  // Send warning to Sentry
  captureMessage(message, 'warning', context);
}

/**
 * Log error message
 */
export function error(message: string, context?: LogContext): void {
  const formattedMessage = formatLogMessage(LogLevel.ERROR, message, context);
  console.error(formattedMessage);
  trackTrace(message, SeverityLevel.Error, contextToProperties(context));

  // Send error to Sentry
  captureMessage(message, 'error', context);
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

  // Track as exception in Application Insights
  trackException(err, contextToProperties(context));

  // Capture exception in Sentry with full context
  captureException(err, context);
}
