/**
 * Authentication API endpoint
 *
 * Handles password validation and cookie creation
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { validatePassword } from './lib/auth/passwordAuth';
import * as logger from './lib/utils/logger';

import { startTransaction, setTag } from './lib/utils/sentry';

/**
 * Authentication endpoint handler
 *
 * @param request - HTTP request with password
 * @param context - Azure Functions invocation context
 * @returns Authentication response with cookie
 */
export async function authApi(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const startTime = Date.now();

  // Start Sentry transaction for performance monitoring
  const transaction = startTransaction('authApi', 'http.request');
  setTag('function', 'authApi');
  setTag('invocationId', context.invocationId);

  try {

    const body = await request.json() as { password?: string };
    const { password } = body;

    if (!password || typeof password !== 'string') {
      const duration = Date.now() - startTime;

      transaction?.setStatus('invalid_argument');
      transaction?.finish();

      return {
        status: 400,
        jsonBody: {
          success: false,
          message: 'Passwort erforderlich',
        },
      };
    }

    logger.info('Authentication attempt');

    const result = await validatePassword(password);

    const duration = Date.now() - startTime;
    const success = result.status === 200;

    // Track authentication attempt

    if (success) {
      transaction?.setStatus('ok');
    } else {
      transaction?.setStatus('permission_denied');
    }

    transaction?.finish();

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error('Auth API error', { error });

    // Mark transaction as failed
    transaction?.setStatus('internal_error');

    transaction?.finish();

    return {
      status: 500,
      jsonBody: {
        success: false,
        message: 'Server-Fehler',
      },
    };
  }
}

// Register HTTP endpoint
app.http('auth', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth',
  handler: authApi,
});
