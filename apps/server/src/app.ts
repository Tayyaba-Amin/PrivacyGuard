import cors from 'cors';
import express from 'express';
import type { ErrorRequestHandler } from 'express';
import { createAiProvider } from './ai/index.js';
import type { AiProvider } from './ai/types.js';
import { config } from './config/env.js';
import { createAnalyzeRouter } from './routes/analyze.js';
import { createAnalyzeImageRouter } from './routes/analyze-image.js';
import { createProtectRouter } from './routes/protect.js';
import { createProtectImageRouter } from './routes/protect-image.js';
import { createRescanRouter } from './routes/rescan.js';
import { createRescanImageRouter } from './routes/rescan-image.js';
import { healthRouter } from './routes/health.js';

/** Body-parser rejects oversized payloads before our own limit runs. */
const isPayloadTooLarge = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'type' in error &&
  (error as { type?: unknown }).type === 'entity.too.large';

// Returns JSON for every failure so clients never receive an HTML error page.
const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (isPayloadTooLarge(error)) {
    res.status(413).json({
      error: { code: 'text_too_large', message: 'Request body is too large.' },
    });
    return;
  }

  res.status(500).json({ error: { code: 'internal_error', message: 'Unexpected server error.' } });
};

export type AppDependencies = {
  /**
   * Contextual-analysis provider. Defaults to the Featherless provider built
   * from server configuration. Tests inject a provider pointed at a local mock;
   * `null` runs the API with the deterministic engine only.
   */
  ai: AiProvider | null;
};

export const createApp = (dependencies: Partial<AppDependencies> = {}): express.Express => {
  const ai = 'ai' in dependencies ? (dependencies.ai ?? null) : createAiProvider();
  const app = express();

  app.disable('x-powered-by');

  app.use(cors({ origin: config.corsOrigins }));
  // Higher limit for image uploads (10MB), text routes use lower limit via their own middleware
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: false, limit: '64kb' }));

  app.use('/api/health', healthRouter);
  app.use('/api/analyze', createAnalyzeRouter({ ai }));
  app.use('/api/analyze', createAnalyzeImageRouter({ ai }));
  app.use('/api/protect', createProtectRouter({}));
  app.use('/api/protect', createProtectImageRouter({}));
  app.use('/api/rescan', createRescanRouter({ ai }));
  app.use('/api/rescan', createRescanImageRouter({ ai }));

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Unknown endpoint.' } });
  });

  app.use(errorHandler);

  return app;
};