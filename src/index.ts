import express from 'express';
import dotenv from 'dotenv';
import { BitcoinRpcAdapter } from './infrastructure/bitcoin/bitcoin-rpc.adapter.js';
import { LndGatewayAdapter } from './infrastructure/lightning/lnd-gateway.adapter.js';
import { PhoenixdGatewayAdapter } from './infrastructure/lightning/phoenixd-gateway.adapter.js';
import { NodeTruthService } from './application/services/node-truth.service.js';
import { L402Service } from './application/services/l402.service.js';
import { createNodeTruthRouter } from './interfaces/http/controllers/node-truth.controller.js';

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

  // 3. Transport Layer Router
  const router = createNodeTruthRouter(nodeTruthService, l402Service);
  app.use(router);

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
