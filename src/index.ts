import express from 'express';
import dotenv from 'dotenv';
import { BitcoinRpcAdapter } from './infrastructure/bitcoin/bitcoin-rpc.adapter.js';
import { LndGatewayAdapter } from './infrastructure/lightning/lnd-gateway.adapter.js';
import { PhoenixdGatewayAdapter } from './infrastructure/lightning/phoenixd-gateway.adapter.js';
import { PhoenixdPayerAdapter } from './infrastructure/lightning/phoenixd-payer.adapter.js';
import { NodeTruthService } from './application/services/node-truth.service.js';
import { L402Service } from './application/services/l402.service.js';
import { createNodeTruthRouter } from './interfaces/http/controllers/node-truth.controller.js';
import { createOmniRailRouter } from './interfaces/http/controllers/omni-rail.controller.js';

dotenv.config();

const PORT = Number(process.env.PORT) || 3088;
const HOST = process.env.HOST || '0.0.0.0';
const TAILSCALE_HOST = process.env.TAILSCALE_HOST || '127.0.0.1';
const MACAROON_SECRET = process.env.MACAROON_SECRET || 'sovereign-l402-dev-secret-key-32b-min';

async function bootstrap() {
  const app = express();
  app.use(express.json());

  // 1. Infrastructure Layer Adapters
  const bitcoinAdapter = new BitcoinRpcAdapter({
    tailscaleHost: TAILSCALE_HOST,
    containerName: 'sovereign-bitcoind',
  });

  const lightningBackend = process.env.LIGHTNING_BACKEND || 'phoenixd';
  const lightningGateway =
    lightningBackend === 'phoenixd'
      ? new PhoenixdGatewayAdapter({
          baseUrl: process.env.PHOENIXD_URL || 'http://127.0.0.1:9740',
          httpPassword: process.env.PHOENIXD_PASSWORD || '__G3mE5-OJwzyIdNmMMxNQRnjqb-uK-w',
          macaroonSecretKey: MACAROON_SECRET,
        })
      : new LndGatewayAdapter({
          tailscaleHost: TAILSCALE_HOST,
          containerName: 'sovereign-lnd',
          macaroonSecretKey: MACAROON_SECRET,
          devBypassSettlement: process.env.DEV_BYPASS_SETTLEMENT === 'true',
        });

  // 2. Application Layer Services
  const nodeTruthService = new NodeTruthService(bitcoinAdapter);
  const l402Service = new L402Service(lightningGateway);
  const phoenixdPayer = new PhoenixdPayerAdapter({
    baseUrl: process.env.PHOENIXD_URL || 'http://127.0.0.1:9740',
    httpPassword: process.env.PHOENIXD_PASSWORD || '__G3mE5-OJwzyIdNmMMxNQRnjqb-uK-w',
  });

  // 3. Transport Layer Routers
  const router = createNodeTruthRouter(nodeTruthService, l402Service);
  const omniRouter = createOmniRailRouter(nodeTruthService, l402Service, phoenixdPayer);
  app.use(router);
  app.use(omniRouter);

  // 4. Clean JSON Error Handler (prevents HTML stack-trace leaks on malformed JSON)
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({ error: 'Invalid JSON payload' });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  });

  app.listen(PORT, HOST, () => {
    console.log(`[Sovereign Node Engine] Live on http://${HOST}:${PORT}`);
    console.log(`[Sovereign Node Engine] Node Target: ${TAILSCALE_HOST} (Bitcoin Core 31.1 & LND 0.21.3)`);
    console.log(`[Sovereign Node Engine] L402 Zero-Trust Protected Endpoints Active`);
  });
}

bootstrap().catch((err) => {
  console.error('[Sovereign Node Engine] Bootstrap failed:', err);
  process.exit(1);
});
