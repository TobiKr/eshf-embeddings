/**
 * Authentication API endpoint
 *
 * Handles password validation and cookie creation
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { validatePassword } from '../lib/auth/passwordAuth';
import * as logger from '../lib/utils/logger';

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
  try {
    const body = await request.json() as { password?: string };
    const { password } = body;

    if (!password || typeof password !== 'string') {
      return {
        status: 400,
        jsonBody: {
          success: false,
          message: 'Passwort erforderlich',
        },
      };
    }

    logger.info('Authentication attempt');

    return validatePassword(password);
  } catch (error) {
    logger.error('Auth API error', { error });

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
