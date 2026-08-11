import http from 'node:http';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { installSensitiveLogFilter } from './logging.js';
import { SessionManager } from './sessions.js';
import { QueueStore } from './queue-store.js';

installSensitiveLogFilter();
const config = loadConfig();
const queueStore = new QueueStore(config.queueDatabasePath);
const sessions = new SessionManager({
  rootPath: config.sessionPath,
  maxSessions: config.maxSessions,
  store: queueStore,
  queueLimits: config.queueLimits
});
const server = http.createServer(createApp({ sessions, config }));
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`[service] shutting down signal=${signal}`);
  server.close();
  await sessions.stop();
  queueStore.close();
  const forceTimer = setTimeout(() => process.exit(1), 10_000);
  forceTimer.unref();
  server.closeAllConnections();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (error) => console.error('[service] unhandled rejection', error));
process.on('uncaughtException', (error) => {
  console.error('[service] uncaught exception', error);
  void shutdown('uncaughtException');
});

await sessions.start();
server.listen(config.port, config.host, () => {
  console.info(`[service] listening on http://${config.host}:${config.port}`);
});
