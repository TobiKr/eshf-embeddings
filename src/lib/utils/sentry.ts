/**
 * Sentry error tracking and performance monitoring
 *
 * Provides comprehensive error tracking, performance monitoring, and breadcrumbs
 * for Azure Functions applications.
 */

import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { getConfig } from '../../types/config';

let isInitialized = false;

/**
 * Initialize Sentry with Azure Functions configuration
 *
 * This should be called once at application startup.
 */
export function initializeSentry(): void {
  if (isInitialized) {
    return;
  }

  const dsn = getConfig('SENTRY_DSN', '');
  const environment = getConfig('SENTRY_ENVIRONMENT', 'development');
  const release = getConfig('SENTRY_RELEASE', '') || undefined;

  if (!dsn) {
    console.warn('[Sentry] SENTRY_DSN not configured. Error tracking disabled.');
    isInitialized = true;
    return;
  }

  try {
    Sentry.init({
      dsn,
      environment,
      release,

      // Performance Monitoring
      tracesSampleRate: environment === 'production' ? 0.1 : 1.0, // 10% in prod, 100% in dev

      // Profiling
      profilesSampleRate: environment === 'production' ? 0.1 : 1.0,
      integrations: [
        nodeProfilingIntegration(),
      ],

      // Configure how errors are captured
      beforeSend(event, hint) {
        // Don't send events if in local development without explicit config
        if (environment === 'development' && !dsn) {
          return null;
        }
        return event;
      },

      // Configure breadcrumbs
      maxBreadcrumbs: 50,
      attachStacktrace: true,

      // Azure Functions specific tags
      initialScope: {
        tags: {
          runtime: 'azure-functions',
          'node.version': process.version,
        },
      },
    });

    console.info('[Sentry] Error tracking initialized successfully');
    isInitialized = true;
  } catch (error) {
    console.error('[Sentry] Failed to initialize:', error);
    isInitialized = true;
  }
}

/**
 * Check if Sentry is initialized and configured
 */
export function isSentryEnabled(): boolean {
  return isInitialized && !!getConfig('SENTRY_DSN', '');
}

/**
 * Capture an exception and send to Sentry
 *
 * @param error - The error to capture
 * @param context - Additional context for the error
 * @returns Event ID from Sentry
 */
export function captureException(
  error: Error,
  context?: Record<string, unknown>
): string | undefined {
  if (!isSentryEnabled()) {
    return undefined;
  }

  return Sentry.captureException(error, {
    extra: context,
  });
}

/**
 * Capture a message and send to Sentry
 *
 * @param message - The message to capture
 * @param level - Severity level
 * @param context - Additional context
 * @returns Event ID from Sentry
 */
export function captureMessage(
  message: string,
  level: Sentry.SeverityLevel = 'info',
  context?: Record<string, unknown>
): string | undefined {
  if (!isSentryEnabled()) {
    return undefined;
  }

  return Sentry.captureMessage(message, {
    level,
    extra: context,
  });
}

/**
 * Add breadcrumb for tracking user actions and events
 *
 * Breadcrumbs provide context leading up to an error.
 *
 * @param message - Breadcrumb message
 * @param category - Category for filtering
 * @param level - Severity level
 * @param data - Additional data
 */
export function addBreadcrumb(
  message: string,
  category: string,
  level: Sentry.SeverityLevel = 'info',
  data?: Record<string, unknown>
): void {
  if (!isSentryEnabled()) {
    return;
  }

  Sentry.addBreadcrumb({
    message,
    category,
    level,
    data,
    timestamp: Date.now() / 1000,
  });
}

/**
 * Set user context for error tracking
 *
 * @param userId - User identifier
 * @param email - User email
 * @param additional - Additional user properties
 */
export function setUser(
  userId: string,
  email?: string,
  additional?: Record<string, unknown>
): void {
  if (!isSentryEnabled()) {
    return;
  }

  Sentry.setUser({
    id: userId,
    email,
    ...additional,
  });
}

/**
 * Clear user context
 */
export function clearUser(): void {
  if (!isSentryEnabled()) {
    return;
  }

  Sentry.setUser(null);
}

/**
 * Set custom tag for filtering and grouping errors
 *
 * @param key - Tag key
 * @param value - Tag value
 */
export function setTag(key: string, value: string): void {
  if (!isSentryEnabled()) {
    return;
  }

  Sentry.setTag(key, value);
}

/**
 * Set multiple tags at once
 *
 * @param tags - Object with tag key-value pairs
 */
export function setTags(tags: Record<string, string>): void {
  if (!isSentryEnabled()) {
    return;
  }

  Sentry.setTags(tags);
}

/**
 * Set custom context for additional error information
 *
 * @param key - Context key
 * @param context - Context data
 */
export function setContext(key: string, context: Record<string, unknown> | null): void {
  if (!isSentryEnabled()) {
    return;
  }

  Sentry.setContext(key, context);
}

/**
 * Start a transaction for backward compatibility
 * Returns a simple object with setStatus and finish methods
 *
 * In Sentry v8, transactions are managed differently. This provides a compatibility layer.
 *
 * @param name - Transaction name
 * @param op - Operation type
 * @returns Transaction-like object
 */
export function startTransaction(
  name: string,
  op: string
): { setStatus: (status: string) => void; finish: () => void } | undefined {
  if (!isSentryEnabled()) {
    return undefined;
  }

  // In Sentry v8, we don't need to manually manage transactions
  // They are automatically created and managed by the SDK
  return {
    setStatus: (status: string) => {
      // Status is handled automatically in v8
    },
    finish: () => {
      // Finishing is handled automatically in v8
    },
  };
}

/**
 * Wrap an Azure Function handler with Sentry error tracking and performance monitoring
 *
 * @param functionName - Name of the function
 * @param handler - The Azure Function handler to wrap
 * @returns Wrapped handler with Sentry instrumentation
 */
export function wrapAzureFunction<T extends (...args: any[]) => Promise<any>>(
  functionName: string,
  handler: T
): T {
  if (!isSentryEnabled()) {
    return handler;
  }

  return (async (...args: any[]) => {
    const transaction = startTransaction(functionName, 'azure.function');

    setTags({
      function: functionName,
      runtime: 'azure-functions',
    });

    addBreadcrumb(
      `Function ${functionName} invoked`,
      'function',
      'info',
      {
        functionName,
        argsCount: args.length,
      }
    );

    try {
      const result = await handler(...args);
      transaction?.setStatus('ok');
      return result;
    } catch (error) {
      transaction?.setStatus('internal_error');
      captureException(error as Error, {
        functionName,
        args: JSON.stringify(args),
      });
      throw error;
    } finally {
      transaction?.finish();
    }
  }) as T;
}

/**
 * Flush all pending events to Sentry
 *
 * Should be called before application shutdown.
 *
 * @param timeout - Timeout in milliseconds (default: 2000)
 * @returns Promise that resolves when flush is complete
 */
export async function flushSentry(timeout: number = 2000): Promise<boolean> {
  if (!isSentryEnabled()) {
    return true;
  }

  return Sentry.flush(timeout);
}

/**
 * Close Sentry client
 *
 * @param timeout - Timeout in milliseconds (default: 2000)
 * @returns Promise that resolves when client is closed
 */
export async function closeSentry(timeout: number = 2000): Promise<boolean> {
  if (!isSentryEnabled()) {
    return true;
  }

  return Sentry.close(timeout);
}

// Re-export commonly used Sentry types
export type { SeverityLevel, Span } from '@sentry/node';
