/**
 * Authentication API endpoint
 *
 * Handles password validation and cookie creation
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { validatePassword } from './lib/auth/passwordAuth';
import * as logger from './lib/utils/logger';
import { trackEvent, trackMetric } from './lib/utils/telemetry';
import { startTransaction, setTag, addBreadcrumb } from './lib/utils/sentry';

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
    addBreadcrumb('Authentication request received', 'auth', 'info');

    const body = await request.json() as { password?: string };
    const { password } = body;

    if (!password || typeof password !== 'string') {
      const duration = Date.now() - startTime;

      trackEvent('AuthApi.BadRequest', { reason: 'missing_password' }, { durationMs: duration });
      trackMetric('AuthApi.RequestTime', duration, { outcome: 'bad_request' });

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

    addBreadcrumb('Validating password', 'auth', 'info');

    const result = await validatePassword(password);

    const duration = Date.now() - startTime;
    const success = result.status === 200;

    // Track authentication attempt
    trackEvent(
      success ? 'AuthApi.Success' : 'AuthApi.Failed',
      { statusCode: result.status?.toString() || '200' },
      { durationMs: duration }
    );

    trackMetric('AuthApi.RequestTime', duration, {
      outcome: success ? 'success' : 'failed',
    });

    if (success) {
      addBreadcrumb('Authentication successful', 'auth', 'info');
      transaction?.setStatus('ok');
    } else {
      addBreadcrumb('Authentication failed', 'auth', 'warning');
      transaction?.setStatus('permission_denied');
    }

    transaction?.finish();

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error('Auth API error', { error });

    // Mark transaction as failed
    transaction?.setStatus('internal_error');

    trackEvent('AuthApi.Error', {
      errorType: error instanceof Error ? error.name : 'unknown',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    trackMetric('AuthApi.RequestTime', duration, { outcome: 'error' });

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
