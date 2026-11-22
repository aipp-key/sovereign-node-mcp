import express from 'express';
import dotenv from 'dotenv';
import { BitcoinRpcAdapter } from './infrastructure/bitcoin/bitcoin-rpc.adapter.js';
import { LndGatewayAdapter } from './infrastructure/lightning/lnd-gateway.adapter.js';
import { PhoenixdGatewayAdapter } from './infrastructure/lightning/phoenixd-gateway.adapter.js';
import { PhoenixdPayerAdapter } from './infrastructure/lightning/phoenixd-payer.adapter.js';
import { NodeTruthService } from './application/services/node-truth.service.js';
import { L402Service } from './application/services/l402.service.js';
import { Eip7702ShieldService } from './application/services/eip7702-shield.service.js';
import { EvmSafetyService } from './application/services/evm-safety.service.js';
import { PreflightGuardService } from './application/services/preflight-guard.service.js';
import { BtcWatchtowerService } from './application/services/btc-watchtower.service.js';
import { MarketIntelService } from './application/services/market-intel.service.js';
import { OracleFeedsService } from './application/services/oracle-feeds.service.js';
import { createDefaultCrewAiStatusService } from './application/services/crewai-status.service.js';
import { createNodeTruthRouter } from './interfaces/http/controllers/node-truth.controller.js';
import { createOmniRailRouter } from './interfaces/http/controllers/omni-rail.controller.js';
import { createEvmShieldRouter } from './interfaces/http/controllers/evm-shield.controller.js';
import { createPreflightGuardRouter } from './interfaces/http/controllers/preflight-guard.controller.js';
import { createWatchtowerRouter } from './interfaces/http/controllers/watchtower.controller.js';
import { createMarketIntelRouter } from './interfaces/http/controllers/market-intel.controller.js';
import { createOracleFeedsRouter } from './interfaces/http/controllers/oracle-feeds.controller.js';
import { createMcpRouter } from './interfaces/http/controllers/mcp.controller.js';
import { createCrewAiStatusRouter } from './interfaces/http/controllers/crewai-status.controller.js';
import { createInternalCoreRouter } from './interfaces/http/controllers/internal-core.controller.js';

dotenv.config();

const PORT = Number(process.env.PORT) || 3088;
const HOST = process.env.HOST || '0.0.0.0';
const TAILSCALE_HOST = process.env.TAILSCALE_HOST || '127.0.0.1';
const MACAROON_SECRET = process.env.MACAROON_SECRET || 'sovereign-l402-dev-secret-key-32b-min';

async function bootstrap() {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
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
  const eip7702ShieldService = new Eip7702ShieldService();
  const evmSafetyService = new EvmSafetyService();
  const marketIntelService = new MarketIntelService();
  marketIntelService.start();
  const oracleFeedsService = new OracleFeedsService();
  oracleFeedsService.start();
  const preflightGuardService = new PreflightGuardService({
    evmSafetyService,
    eip7702ShieldService,
    nodeTruthService,
    oracleFeedsService,
  });
  const btcWatchtowerService = new BtcWatchtowerService(nodeTruthService);
  btcWatchtowerService.start();
  const crewAiStatusService = createDefaultCrewAiStatusService(process.env);
  const phoenixdPayer = new PhoenixdPayerAdapter({
    baseUrl: process.env.PHOENIXD_URL || 'http://127.0.0.1:9740',
    httpPassword: process.env.PHOENIXD_PASSWORD || '__G3mE5-OJwzyIdNmMMxNQRnjqb-uK-w',
  });

  // 3. Transport Layer Routers
  const router = createNodeTruthRouter(nodeTruthService, l402Service);
  const omniRouter = createOmniRailRouter(nodeTruthService, l402Service, phoenixdPayer);
  const evmShieldRouter = createEvmShieldRouter(eip7702ShieldService, l402Service);
  const preflightGuardRouter = createPreflightGuardRouter(preflightGuardService, l402Service);
  const watchtowerRouter = createWatchtowerRouter(btcWatchtowerService, l402Service);
  const marketIntelRouter = createMarketIntelRouter(marketIntelService, l402Service);
  const oracleFeedsRouter = createOracleFeedsRouter(oracleFeedsService, l402Service);
  const mcpRouter = createMcpRouter(
    nodeTruthService,
    eip7702ShieldService,
    l402Service,
    evmSafetyService,
    preflightGuardService
  );
  const crewAiStatusRouter = createCrewAiStatusRouter(crewAiStatusService);
  const internalCoreRouter = createInternalCoreRouter(nodeTruthService, {
    coreBridgeKey: process.env.CORE_BRIDGE_KEY,
  });
  app.use(router);
  app.use(omniRouter);
  app.use(evmShieldRouter);
  app.use(preflightGuardRouter);
  app.use(watchtowerRouter);
  app.use(marketIntelRouter);
  app.use(oracleFeedsRouter);
  app.use(mcpRouter);
  app.use(crewAiStatusRouter);
  app.use(internalCoreRouter);

  // 4. Clean JSON 404 & Error Handlers (prevents Express HTML 404 & stack-trace leaks)
  app.use((_req: express.Request, res: express.Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({ error: 'Invalid JSON payload' });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  });

  const server = app.listen(PORT, HOST, () => {
    console.log(`[Sovereign Node Engine] Live on http://${HOST}:${PORT}`);
    console.log(`[Sovereign Node Engine] Node Target: ${TAILSCALE_HOST} (Bitcoin Core 31.1 & LND 0.21.3)`);
    console.log(`[Sovereign Node Engine] L402 Zero-Trust Protected Endpoints Active`);
  });

  const shutdown = () => {
    marketIntelService.stop();
    oracleFeedsService.stop();
    btcWatchtowerService.stop();
    server.close();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  console.error('[Sovereign Node Engine] Bootstrap failed:', err);
  process.exit(1);
});
