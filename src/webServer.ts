/**
 * Static file server for chat UI
 *
 * Serves HTML, CSS, and JavaScript files for the chat interface
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import * as fs from 'fs';
import * as path from 'path';
import * as logger from './lib/utils/logger';
import { trackEvent, trackMetric } from './lib/utils/telemetry';
import { startTransaction, setTag, addBreadcrumb } from './lib/utils/sentry';

// Content type mapping
const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

/**
 * Serves static files from the static directory
 *
 * @param request - HTTP request
 * @param context - Azure Functions invocation context
 * @returns Static file response or 404
 */
export async function webServer(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const startTime = Date.now();

  // Start Sentry transaction for performance monitoring
  const transaction = startTransaction('webServer', 'http.request');
  setTag('function', 'webServer');
  setTag('invocationId', context.invocationId);

  try {
    const url = new URL(request.url);
    let filePath = url.pathname;

    // Default to index.html for root path
    if (filePath === '/' || filePath === '') {
      filePath = '/index.html';
    }

    setTag('filePath', filePath);

    addBreadcrumb(
      'Static file request received',
      'http',
      'info',
      { filePath, method: request.method }
    );

    // Security: Prevent directory traversal
    if (filePath.includes('..')) {
      const duration = Date.now() - startTime;

      logger.warn('Directory traversal attempt blocked', { path: filePath });

      // Track security event
      trackEvent('WebServer.SecurityViolation', {
        type: 'directory_traversal',
        path: filePath,
      });

      trackMetric('WebServer.RequestTime', duration, { outcome: 'security_blocked' });

      addBreadcrumb(
        'Directory traversal attempt blocked',
        'security',
        'warning',
        { path: filePath }
      );

      transaction?.setStatus('permission_denied');
      transaction?.finish();

      return {
        status: 403,
        body: 'Forbidden',
      };
    }

    // Construct absolute file path
    const staticDir = path.join(process.cwd(), 'static');
    const absolutePath = path.join(staticDir, filePath);

    // Check if file exists
    if (!fs.existsSync(absolutePath)) {
      const duration = Date.now() - startTime;

      logger.warn('File not found', { path: filePath });

      trackEvent('WebServer.NotFound', { path: filePath }, { durationMs: duration });
      trackMetric('WebServer.RequestTime', duration, { outcome: 'not_found' });

      transaction?.setStatus('not_found');
      transaction?.finish();

      return {
        status: 404,
        body: 'Not Found',
      };
    }

    // Check if it's a file (not directory)
    const stats = fs.statSync(absolutePath);
    if (!stats.isFile()) {
      const duration = Date.now() - startTime;

      trackEvent('WebServer.NotFound', { path: filePath, reason: 'not_a_file' }, { durationMs: duration });
      trackMetric('WebServer.RequestTime', duration, { outcome: 'not_found' });

      transaction?.setStatus('not_found');
      transaction?.finish();

      return {
        status: 404,
        body: 'Not Found',
      };
    }

    // Read file
    const content = fs.readFileSync(absolutePath);

    // Determine content type
    const ext = path.extname(filePath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';

    const duration = Date.now() - startTime;

    logger.debug('Serving static file', {
      path: filePath,
      size: content.length,
      contentType,
    });

    // Track successful file serving
    trackEvent(
      'WebServer.Success',
      {
        filePath,
        contentType,
        extension: ext,
      },
      {
        fileSize: content.length,
        durationMs: duration,
      }
    );

    trackMetric('WebServer.FileSize', content.length, { extension: ext });
    trackMetric('WebServer.RequestTime', duration, { outcome: 'success' });

    setTag('contentType', contentType);
    setTag('extension', ext);

    transaction?.setStatus('ok');
    transaction?.finish();

    return {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
      },
      body: content.toString(),
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error('Error serving static file', { error });

    // Mark transaction as failed
    transaction?.setStatus('internal_error');

    trackEvent('WebServer.Error', {
      errorType: error instanceof Error ? error.name : 'unknown',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    trackMetric('WebServer.RequestTime', duration, { outcome: 'error' });

    transaction?.finish();

    return {
      status: 500,
      body: 'Internal Server Error',
    };
  }
}

// Register root endpoint
app.http('root', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: '/',
  handler: webServer,
});

// Register static file endpoints
app.http('styles', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'styles.css',
  handler: webServer,
});

app.http('app-js', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'app.js',
  handler: webServer,
});
