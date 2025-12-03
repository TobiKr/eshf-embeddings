/**
 * Simple password-based authentication for chat endpoint
 *
 * Uses cookie-based authentication with password from environment variable
 */

import { HttpRequest, HttpResponseInit } from '@azure/functions';
import * as logger from '../utils/logger';

const COOKIE_NAME = 'chat_password';
const PASSWORD_HEADER = 'X-Chat-Password';

/**
 * Validates password from request cookie or header
 *
 * @param request - HTTP request to validate
 * @returns True if password is valid, false otherwise
 */
export function isAuthenticated(request: HttpRequest): boolean {
  const expectedPassword = process.env.CHAT_PASSWORD;

  if (!expectedPassword) {
    logger.error('CHAT_PASSWORD environment variable not set');
    return false;
  }

  // Check password in header (for initial authentication)
  const headerPassword = request.headers.get(PASSWORD_HEADER);
  if (headerPassword && headerPassword === expectedPassword) {
    return true;
  }

  // Check password in cookie
  const cookies = parseCookies(request.headers.get('cookie') || '');
  const cookiePassword = cookies[COOKIE_NAME];

  if (cookiePassword && cookiePassword === expectedPassword) {
    return true;
  }

  return false;
}

/**
 * Creates a Set-Cookie header for password authentication
 *
 * @param password - Password to store in cookie
 * @returns Set-Cookie header value
 */
export function createAuthCookie(password: string): string {
  // Cookie valid for 24 hours
  const maxAge = 24 * 60 * 60; // seconds

  return `${COOKIE_NAME}=${password}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
}

/**
 * Parses cookie string into key-value object
 *
 * @param cookieString - Raw cookie header value
 * @returns Object with cookie key-value pairs
 */
function parseCookies(cookieString: string): Record<string, string> {
  const cookies: Record<string, string> = {};

  if (!cookieString) {
    return cookies;
  }

  cookieString.split(';').forEach((cookie) => {
    const [key, value] = cookie.trim().split('=');
    if (key && value) {
      cookies[key] = value;
    }
  });

  return cookies;
}

/**
 * Creates unauthorized response
 *
 * @returns HTTP 401 response
 */
export function unauthorizedResponse(): HttpResponseInit {
  return {
    status: 401,
    jsonBody: {
      error: 'Unauthorized',
      message: 'Ungültiges Passwort',
    },
  };
}

/**
 * Validates password and returns authentication response
 *
 * @param password - Password to validate
 * @returns Success response with cookie or error response
 */
export function validatePassword(password: string): HttpResponseInit {
  const expectedPassword = process.env.CHAT_PASSWORD;

  if (!expectedPassword) {
    logger.error('CHAT_PASSWORD environment variable not set');
    return {
      status: 500,
      jsonBody: {
        error: 'Configuration error',
        message: 'Server-Konfigurationsfehler',
      },
    };
  }

  if (password !== expectedPassword) {
    logger.warn('Invalid password attempt');
    return {
      status: 401,
      jsonBody: {
        success: false,
        message: 'Ungültiges Passwort',
      },
    };
  }

  logger.info('Successful authentication');

  return {
    status: 200,
    headers: {
      'Set-Cookie': createAuthCookie(password),
    },
    jsonBody: {
      success: true,
      message: 'Authentifizierung erfolgreich',
    },
  };
}
