/**
 * Main entry point for Azure Functions v4
 *
 * This file imports all function handlers to register them with the Azure Functions runtime.
 * The @azure/functions app object is shared across all files, so importing the function
 * files causes their app.timer(), app.storageQueue(), etc. calls to register.
 */

// Initialize error tracking and monitoring before anything else
import { initializeSentry } from './lib/utils/sentry';

// Sentry should be initialized first to catch all errors
initializeSentry();


// Import all function files to trigger their registration

// Existing embedding pipeline functions
import './postDiscovery';
import './embeddingProcessor';
import './pineconeUploader';
import './manualProcessor';

// New chat/RAG functions
import './chatApi';
import './authApi';
import './webServer';
import './searchEndpoint';
