import { Request, Response, NextFunction } from 'express';
import { L402Service } from '../../../application/services/l402.service.js';

export interface L402MiddlewareOptions {
  priceSats: number;
  resourceName: string;
}

export function createL402Middleware(
  l402Service: L402Service,
  options: L402MiddlewareOptions
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.header('Authorization');

    // Case 1: Client has provided L402 credentials
    if (authHeader && authHeader.startsWith('L402 ')) {
      try {
        const verification = await l402Service.verifyAuthorizationHeader(authHeader);
        if (verification.isValid) {
          (req as any).l402 = verification;
          return next();
        }

        return res.status(402).json({
          error: 'Payment Verification Failed',
          details: verification.errorReason,
          protocol: 'L402',
        });
      } catch (err: any) {
        return res.status(500).json({
          error: 'L402 Verification Exception',
          details: err.message,
        });
      }
    }

    // Case 2: No credentials -> Issue 402 Challenge
    try {
      const challenge = await l402Service.generateChallenge(
        options.priceSats,
        `${options.resourceName}:${req.path}`
      );

      res.setHeader(
        'WWW-Authenticate',
        `L402 macaroon="${challenge.macaroon}", invoice="${challenge.invoice}"`
      );

      return res.status(402).json({
        statusCode: 402,
        protocol: 'L402',
        message: 'Payment Required: Please pay the attached BOLT-11 Lightning invoice to obtain the preimage.',
        challenge: {
          priceSats: challenge.priceSats,
          invoice: challenge.invoice,
          paymentHash: challenge.paymentHash,
          expiresAt: challenge.expiresAt,
        },
        instructions: {
          step1: 'Pay the invoice over Lightning Network (or via Alby Hub NWC).',
          step2: 'Extract the 32-byte hex payment preimage (R).',
          step3: 'Repeat request with header: "Authorization: L402 <macaroon>:<preimage>".',
        },
      });
    } catch (err: any) {
      return res.status(500).json({
        error: 'Failed to generate L402 Challenge',
        details: err.message,
      });
    }
  };
}
