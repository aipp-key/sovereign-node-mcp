import { NextFunction, Request, Response, Router } from 'express';
import { CrewAiStatusService } from '../../../application/services/crewai-status.service.js';
import { DUAL_RAIL_CORS_HEADERS } from '../middleware/l402.middleware.js';

export function createCrewAiStatusRouter(crewAiStatusService: CrewAiStatusService): Router {
  const router = Router();

  router.use('/crewai-status', (req: Request, res: Response, next: NextFunction) => {
    for (const [k, v] of Object.entries(DUAL_RAIL_CORS_HEADERS)) {
      res.setHeader(k, v);
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Strictly read-only heartbeat + verified run snapshot; never triggers /kickoff
  router.get('/crewai-status', async (_req: Request, res: Response) => {
    try {
      res.setHeader('Cache-Control', 'public, max-age=60');
      const status = await crewAiStatusService.getStatus();
      res.json(status);
    } catch {
      res.status(503).json({ error: 'CrewAI status temporarily unavailable' });
    }
  });

  return router;
}
