/**
 * Static file server for chat UI
 *
 * Serves HTML, CSS, and JavaScript files for the chat interface
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import * as fs from 'fs';
import * as path from 'path';
import * as logger from '../lib/utils/logger';

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
  try {
    const url = new URL(request.url);
    let filePath = url.pathname;

    // Default to index.html for root path
    if (filePath === '/' || filePath === '') {
      filePath = '/index.html';
    }

    // Security: Prevent directory traversal
    if (filePath.includes('..')) {
      logger.warn('Directory traversal attempt blocked', { path: filePath });
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
      logger.warn('File not found', { path: filePath });
      return {
        status: 404,
        body: 'Not Found',
      };
    }

    // Check if it's a file (not directory)
    const stats = fs.statSync(absolutePath);
    if (!stats.isFile()) {
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

    logger.debug('Serving static file', {
      path: filePath,
      size: content.length,
      contentType,
    });

    return {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
      },
      body: content.toString(),
    };
  } catch (error) {
    logger.error('Error serving static file', { error });

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
  route: '',
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
