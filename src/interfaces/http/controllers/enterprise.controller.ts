import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  EnterpriseInquiryRecord,
  EnterpriseInquiryRequestSchema,
} from '../../../domain/schemas/enterprise-inquiry.schema.js';
import { DUAL_RAIL_CORS_HEADERS } from '../middleware/l402.middleware.js';

const INQUIRY_LOG_PATH =
  process.env.ENTERPRISE_INQUIRY_LOG_PATH ||
  path.resolve(process.cwd(), 'data', 'enterprise-inquiries.jsonl');

const recentInquiries: EnterpriseInquiryRecord[] = [];

export function createEnterpriseRouter(options: { coreBridgeKey?: string } = {}): Router {
  const router = Router();

  router.use('/v1/enterprise', (req: Request, res: Response, next: NextFunction) => {
    for (const [k, v] of Object.entries(DUAL_RAIL_CORS_HEADERS)) {
      res.setHeader(k, v);
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  router.post('/v1/enterprise/inquiry', async (req: Request, res: Response) => {
    const parsed = EnterpriseInquiryRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid enterprise inquiry payload',
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
      return;
    }

    const rawIp =
      (req.headers['cf-connecting-ip'] as string) ||
      (req.headers['x-forwarded-for'] as string) ||
      req.socket.remoteAddress ||
      'unknown';
    const clientIpHash = crypto.createHash('sha256').update(rawIp).digest('hex').slice(0, 16);
    const inquiryId = `ent_${crypto.randomBytes(8).toString('hex')}`;
    const createdAt = new Date().toISOString();

    const record: EnterpriseInquiryRecord = {
      inquiryId,
      createdAt,
      clientIpHash,
      ...parsed.data,
    };

    recentInquiries.unshift(record);
    if (recentInquiries.length > 200) recentInquiries.length = 200;

    try {
      await fs.mkdir(path.dirname(INQUIRY_LOG_PATH), { recursive: true });
      await fs.appendFile(INQUIRY_LOG_PATH, `${JSON.stringify(record)}\n`, 'utf8');
    } catch (err) {
      console.error('[EnterpriseRouter] Failed to append inquiry to disk:', err);
    }

    res.status(201).json({
      status: 'received',
      source: 'sovroute-node-hel1-1:enterprise-desk',
      data: {
        inquiryId,
        createdAt,
        selectedProducts: record.selectedProducts,
        preferredSettlement: record.preferredSettlement,
        monthlyVolume: record.monthlyVolume,
        slaResponseTarget: '< 12 hours (Direct Engineering & Architecture Desk)',
      },
    });
  });

  router.get('/internal/core/enterprise-inquiries', async (req: Request, res: Response) => {
    const expectedKey = options.coreBridgeKey?.trim();
    const providedKey = (req.headers['x-sovroute-core-key'] as string | undefined)?.trim();
    if (!expectedKey || providedKey !== expectedKey) {
      res.status(401).json({ error: 'Unauthorized internal core request' });
      return;
    }

    res.json({
      status: 'ok',
      count: recentInquiries.length,
      inquiries: recentInquiries,
    });
  });

  return router;
}
