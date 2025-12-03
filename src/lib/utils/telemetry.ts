/**
 * Application Insights telemetry utilities
 *
 * Provides custom event tracking, metrics, and dependencies for Azure Functions.
 * Integrates with Application Insights for cloud monitoring and observability.
 */

import * as appInsights from 'applicationinsights';
import { getConfig } from '../../types/config';

/**
 * Telemetry client instance
 */
let telemetryClient: appInsights.TelemetryClient | null = null;
let isInitialized = false;

/**
 * Initialize Application Insights
 *
 * This should be called once at application startup.
 * Azure Functions automatically configures Application Insights when
 * APPLICATIONINSIGHTS_CONNECTION_STRING is set, but we initialize it
 * explicitly for custom telemetry.
 */
export function initializeTelemetry(): void {
  if (isInitialized) {
    return;
  }

  const connectionString = getConfig('APPLICATIONINSIGHTS_CONNECTION_STRING', '');

  if (!connectionString) {
    console.warn(
      '[Telemetry] APPLICATIONINSIGHTS_CONNECTION_STRING not configured. Custom telemetry disabled.'
    );
    isInitialized = true;
    return;
  }

  try {
    // Setup Application Insights
    appInsights
      .setup(connectionString)
      .setAutoCollectRequests(true)
      .setAutoCollectPerformance(true, true)
      .setAutoCollectExceptions(true)
      .setAutoCollectDependencies(true)
      .setAutoCollectConsole(true, true)
      .setUseDiskRetryCaching(true)
      .setSendLiveMetrics(false) // Disable live metrics for cost optimization
      .setDistributedTracingMode(appInsights.DistributedTracingModes.AI_AND_W3C);

    appInsights.start();

    telemetryClient = appInsights.defaultClient;

    // Add cloud role name for better filtering in Application Insights
    telemetryClient.context.tags[telemetryClient.context.keys.cloudRole] =
      'eshf-embeddings';

    console.info('[Telemetry] Application Insights initialized successfully');
    isInitialized = true;
  } catch (error) {
    console.error('[Telemetry] Failed to initialize Application Insights:', error);
    isInitialized = true;
  }
}

/**
 * Get the telemetry client instance
 */
export function getTelemetryClient(): appInsights.TelemetryClient | null {
  if (!isInitialized) {
    initializeTelemetry();
  }
  return telemetryClient;
}

/**
 * Track a custom event
 *
 * @param name - Event name
 * @param properties - Custom properties
 * @param measurements - Custom measurements (numeric values)
 */
export function trackEvent(
  name: string,
  properties?: Record<string, string>,
  measurements?: Record<string, number>
): void {
  const client = getTelemetryClient();
  if (client) {
    client.trackEvent({
      name,
      properties,
      measurements,
    });
  }
}

/**
 * Track a custom metric
 *
 * @param name - Metric name
 * @param value - Metric value
 * @param properties - Custom properties
 */
export function trackMetric(
  name: string,
  value: number,
  properties?: Record<string, string>
): void {
  const client = getTelemetryClient();
  if (client) {
    client.trackMetric({
      name,
      value,
      properties,
    });
  }
}

/**
 * Track a dependency (external API call, database query, etc.)
 *
 * @param name - Dependency name
 * @param dependencyTypeName - Dependency type (e.g., 'HTTP', 'Azure Cosmos DB', 'OpenAI API')
 * @param data - Command or request data
 * @param duration - Duration in milliseconds
 * @param success - Whether the dependency call succeeded
 * @param resultCode - Result code (HTTP status, error code, etc.)
 * @param properties - Custom properties
 */
export function trackDependency(
  name: string,
  dependencyTypeName: string,
  data: string,
  duration: number,
  success: boolean,
  resultCode?: number,
  properties?: Record<string, string>
): void {
  const client = getTelemetryClient();
  if (client) {
    client.trackDependency({
      name,
      dependencyTypeName,
      data,
      duration,
      success,
      resultCode,
      properties,
    });
  }
}

/**
 * Track an exception
 *
 * @param error - The error object
 * @param properties - Custom properties
 */
export function trackException(
  error: Error,
  properties?: Record<string, string>
): void {
  const client = getTelemetryClient();
  if (client) {
    client.trackException({
      exception: error,
      properties,
    });
  }
}

/**
 * Track a page view (for HTTP-triggered functions serving web content)
 *
 * @param name - Page name
 * @param url - Page URL
 * @param duration - Duration in milliseconds
 * @param properties - Custom properties
 */
export function trackPageView(
  name: string,
  url?: string,
  duration?: number,
  properties?: Record<string, string>
): void {
  const client = getTelemetryClient();
  if (client) {
    client.trackPageView({
      name,
      url,
      duration,
      properties,
      id: `${name}-${Date.now()}`,
    });
  }
}

/**
 * Severity levels for telemetry traces
 */
export enum SeverityLevel {
  Verbose = 0,
  Information = 1,
  Warning = 2,
  Error = 3,
  Critical = 4,
}

/**
 * Track a trace (custom log message)
 *
 * @param message - Log message
 * @param severity - Severity level
 * @param properties - Custom properties
 */
export function trackTrace(
  message: string,
  severity?: SeverityLevel,
  properties?: Record<string, string>
): void {
  const client = getTelemetryClient();
  if (client) {
    client.trackTrace({
      message,
      severity: severity !== undefined ? severity : SeverityLevel.Information,
      properties,
    } as any); // Type assertion needed due to Application Insights type definitions
  }
}

/**
 * Flush all telemetry data
 *
 * Should be called before application shutdown to ensure all telemetry is sent.
 */
export function flushTelemetry(): Promise<void> {
  return new Promise((resolve) => {
    const client = getTelemetryClient();
    if (client) {
      client.flush();
      // Give a short delay for flush to complete
      setTimeout(() => resolve(), 1000);
    } else {
      resolve();
    }
  });
}

/**
 * Helper function to measure and track execution time of an async operation
 *
 * @param name - Operation name
 * @param operation - The async operation to execute
 * @param properties - Custom properties
 * @returns The result of the operation
 */
export async function trackOperation<T>(
  name: string,
  operation: () => Promise<T>,
  properties?: Record<string, string>
): Promise<T> {
  const startTime = Date.now();
  let success = true;
  let error: Error | undefined;

  try {
    const result = await operation();
    return result;
  } catch (err) {
    success = false;
    error = err as Error;
    trackException(error, { ...properties, operation: name });
    throw err;
  } finally {
    const duration = Date.now() - startTime;
    trackEvent(
      name,
      {
        ...properties,
        success: success.toString(),
        ...(error && { errorMessage: error.message }),
      },
      { duration }
    );
  }
}
