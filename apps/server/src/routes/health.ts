import { Router } from 'express';

const SERVICE_NAME = 'privacyguard-api';
const SERVICE_VERSION = '0.1.0';

export type HealthResponse = {
  status: 'ok';
  service: string;
  version: string;
  uptimeSeconds: number;
};

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  const body: HealthResponse = {
    status: 'ok',
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    uptimeSeconds: Math.round(process.uptime()),
  };

  res.status(200).json(body);
});