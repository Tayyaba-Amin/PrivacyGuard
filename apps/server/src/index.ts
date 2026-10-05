import { createApp } from './app.js';
import { config } from './config/env.js';

const app = createApp();

app.listen(config.port, config.host, () => {
  // Startup information only. Request and user content is never logged.
  console.log(`PrivacyGuard API listening on http://${config.host}:${config.port}`);
});