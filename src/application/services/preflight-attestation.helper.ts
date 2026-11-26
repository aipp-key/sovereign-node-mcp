import {
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign,
  timingSafeEqual,
  verify as cryptoVerify,
  type KeyObject,
} from 'crypto';
import {
  PreflightAsymmetricAttestation,
  PreflightAttestationVerifyRequest,
  PreflightGuardReport,
  PreflightSandboxScenario,
} from '../../domain/schemas/preflight-guard.schema.js';

const DEV_FALLBACK_SECRET = 'sovereign-l402-dev-secret-key-32b-min';

interface Ed25519SignerState {
  kid: string;
  privateKey: KeyObject;
  publicKey: KeyObject;
  publicKeyJwk: Record<string, unknown>;
}

let cachedEd25519Signer: Ed25519SignerState | null = null;
let cachedEd25519EnvValue: string | undefined;

function deriveEd25519Kid(pubJwk: Record<string, unknown>): string {
  const canonical = JSON.stringify({
    crv: pubJwk.crv ?? 'Ed25519',
    kty: pubJwk.kty ?? 'OKP',
    x: pubJwk.x,
  });
  return createHash('sha256').update(canonical).digest('base64url').slice(0, 16);
}

function getEd25519Signer(): Ed25519SignerState {
  const rawEnv = process.env.PREFLIGHT_ED25519_JWK?.trim();
  if (cachedEd25519Signer && cachedEd25519EnvValue === rawEnv) {
    return cachedEd25519Signer;
  }

  let privateKey: KeyObject;
  let publicKey: KeyObject;

  if (rawEnv) {
    const parsed = JSON.parse(rawEnv) as Record<string, unknown>;
    privateKey = createPrivateKey({ key: parsed as any, format: 'jwk' });
    publicKey = createPublicKey(privateKey);
  } else {
    const kp = generateKeyPairSync('ed25519');
    privateKey = kp.privateKey;
    publicKey = kp.publicKey;
  }

  const rawPubJwk = publicKey.export({ format: 'jwk' }) as Record<string, unknown>;
  const kid = deriveEd25519Kid(rawPubJwk);
  const publicKeyJwk: Record<string, unknown> = {
    kty: rawPubJwk.kty,
    crv: rawPubJwk.crv,
    x: rawPubJwk.x,
    kid,
    alg: 'EdDSA',
    use: 'sig',
  };

  cachedEd25519Signer = { kid, privateKey, publicKey, publicKeyJwk };
  cachedEd25519EnvValue = rawEnv;
  return cachedEd25519Signer;
}

export function getPreflightJwks(): { keys: Record<string, unknown>[] } {
  const { publicKeyJwk } = getEd25519Signer();
  return { keys: [publicKeyJwk] };
}

function signEd25519JwsSync(claims: Record<string, unknown>): PreflightAsymmetricAttestation {
  const { kid, privateKey, publicKeyJwk } = getEd25519Signer();
  const headerB64 = Buffer.from(
    JSON.stringify({ alg: 'EdDSA', typ: 'sovroute-attestation+jwt', kid })
  ).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signingInput = `${headerB64}.${payloadB64}`;
  const sigB64 = cryptoSign(null, Buffer.from(signingInput), privateKey).toString('base64url');

  return {
    algorithm: 'Ed25519',
    alg: 'EdDSA',
    kid,
    jws: `${signingInput}.${sigB64}`,
    publicKeyJwk,
  };
}

function verifyEd25519JwsSync(jws: string, jwkOverride?: Record<string, unknown>): boolean {
  const parts = jws.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return false;
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as {
      alg?: string;
    };
    if (header.alg !== 'EdDSA') return false;
    const key = jwkOverride
      ? createPublicKey({ key: jwkOverride as any, format: 'jwk' })
      : getEd25519Signer().publicKey;
    return cryptoVerify(
      null,
      Buffer.from(`${parts[0]}.${parts[1]}`),
      key,
      Buffer.from(parts[2], 'base64url')
    );
  } catch {
    return false;
  }
}

export function resolveAttestationSecret(): string {
  const envSecret = process.env.MACAROON_SECRET?.trim();
  if (envSecret && envSecret.length >= 16) return envSecret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('MACAROON_SECRET must be configured in production for cryptographic attestations.');
  }
  return DEV_FALLBACK_SECRET;
}

export function attachPreflightAttestationAndSla(report: PreflightGuardReport): PreflightGuardReport {
  const timestamp = Date.now();
  const nodeId = process.env.NODE_ID || 'sovroute-node-hel1-1';
  const secret = resolveAttestationSecret();

  const payloadToSign = `${nodeId}:${report.protocol}:${report.verdict}:${report.riskScore}:${report.inspectedAt}:${timestamp}`;
  const reportHash = createHash('sha256').update(payloadToSign).digest('hex');
  const signature = createHmac('sha256', secret).update(reportHash).digest('hex');

  const asymmetric = signEd25519JwsSync({
    iss: process.env.PUBLIC_NODE_URL || 'https://node.sovroute.com',
    sub: 'preflight-guard',
    nodeId,
    verdict: report.verdict,
    targetProtocol: report.protocol,
    riskScore: report.riskScore,
    reportHash,
    inspectedAt: report.inspectedAt,
    iat: Math.floor(timestamp / 1000),
  });

  report.attestation = {
    nodeId,
    verdict: report.verdict,
    targetProtocol: report.protocol,
    riskScore: report.riskScore,
    reportHash,
    timestamp,
    signature,
    asymmetric,
  };

  report.sla = {
    tier: 'SERVICE_CREDIT_10X',
    coverage:
      'Eligible for 10x API service credit in the event of an unpredicted on-chain simulation divergence under ALLOW status.',
    remedy: '10x API service credit issued upon cryptographically verifiable simulation divergence proof.',
    termsUrl: 'https://sovroute.com/#sla',
    disclaimer:
      'Technical node attestation only. Strictly non-custodial and not financial insurance or warranty.',
  };

  return report;
}

export interface AttestationVerificationResult {
  valid: boolean;
  signatureValid: boolean;
  asymmetricValid: boolean | null;
  reportHashMatches: boolean | null;
  nodeId: string;
  verdict: string;
  targetProtocol: 'evm' | 'btc';
  riskScore: number;
  verifiedAt: string;
}

export function verifyPreflightAttestation(
  input: PreflightAttestationVerifyRequest
): AttestationVerificationResult {
  const secret = resolveAttestationSecret();
  const { attestation, inspectedAt } = input;

  const expectedSigHex = createHmac('sha256', secret).update(attestation.reportHash).digest('hex');
  const actualBuf = Buffer.from(attestation.signature.toLowerCase(), 'hex');
  const expectedBuf = Buffer.from(expectedSigHex.toLowerCase(), 'hex');

  const signatureValid =
    actualBuf.length === expectedBuf.length && timingSafeEqual(actualBuf, expectedBuf);

  let asymmetricValid: boolean | null = null;
  if (attestation.asymmetric?.jws) {
    asymmetricValid = verifyEd25519JwsSync(attestation.asymmetric.jws);
  }

  let reportHashMatches: boolean | null = null;
  if (inspectedAt) {
    const reconstructedPayload = `${attestation.nodeId}:${attestation.targetProtocol}:${attestation.verdict}:${attestation.riskScore}:${inspectedAt}:${attestation.timestamp}`;
    const expectedHash = createHash('sha256').update(reconstructedPayload).digest('hex');
    reportHashMatches = expectedHash.toLowerCase() === attestation.reportHash.toLowerCase();
  }

  const valid =
    signatureValid &&
    (asymmetricValid === null || asymmetricValid) &&
    (reportHashMatches === null || reportHashMatches);

  return {
    valid,
    signatureValid,
    asymmetricValid,
    reportHashMatches,
    nodeId: attestation.nodeId,
    verdict: attestation.verdict,
    targetProtocol: attestation.targetProtocol,
    riskScore: attestation.riskScore,
    verifiedAt: new Date().toISOString(),
  };
}

export function buildPreflightSandboxReport(scenario: PreflightSandboxScenario): PreflightGuardReport {
  const inspectedAt = new Date().toISOString();

  if (scenario === 'clean-base-usdc') {
    return attachPreflightAttestationAndSla({
      verdict: 'ALLOW',
      riskScore: 4,
      protocol: 'evm',
      checksExecuted: ['evm_simulate_tx', 'evm_address_safety', 'stablecoin_peg'],
      findings: [],
      details: {
        chainId: 8453,
        network: 'Base Mainnet',
        estimatedGas: 21000,
        revertDetected: false,
        stablecoinPeg: { symbol: 'USDC', deviationBps: 1, depegRiskScore: 4 },
      },
      summary: 'ALLOW (EVM): All 3 pre-flight guardrail checks passed with no critical risk signals.',
      inspectedAt,
    });
  }

  if (scenario === 'eip7702-drainer') {
    return attachPreflightAttestationAndSla({
      verdict: 'BLOCK',
      riskScore: 96,
      protocol: 'evm',
      checksExecuted: ['evm_simulate_tx', 'evm_address_safety', 'eip7702_shield', 'bytecode_risk_ml'],
      findings: [
        {
          source: 'eip7702_shield',
          code: 'EIP7702_CRITICAL_DRAIN_RISK',
          severity: 'CRITICAL',
          message:
            'Pectra EIP-7702 delegation targets unverified contract containing DELEGATECALL + transferFrom sweep pattern with chainId=0 cross-chain wildcard.',
        },
        {
          source: 'evm_address_safety',
          code: 'DRAINER_BYTECODE_SIGNATURE',
          severity: 'CRITICAL',
          message: 'ONNX bytecode classifier flagged target delegate (score=0.96, class=DRAINER_ML_DETECTED).',
        },
      ],
      details: {
        chainId: 8453,
        delegateAddress: '0xdead000000000000000000000000000000007702',
        wildcardReplay: true,
        onnxDrainerProbability: 0.96,
      },
      summary:
        'BLOCK (EVM): Critical risk detected across 4 pre-flight guardrail checks. Do not sign or broadcast.',
      inspectedAt,
    });
  }

  return attachPreflightAttestationAndSla({
    verdict: 'WARN',
    riskScore: 55,
    protocol: 'btc',
    checksExecuted: ['btc_rbf_shield', 'btc_mempool_xray'],
    findings: [
      {
        source: 'btc_rbf_shield',
        code: 'HIGH_RISK_RBF_ENABLED',
        severity: 'WARN',
        message:
          'Unconfirmed Bitcoin transaction signals BIP-125 replaceability (nSequence < 0xfffffffe). Wait for 1 block confirmation before releasing goods or HTLC preimage.',
      },
    ],
    details: {
      network: 'bitcoin-mainnet',
      bip125Replaceable: true,
      feeRateSatPerVb: 4.2,
      recommendedAction: 'HOLD_FOR_1_CONFIRMATION',
    },
    summary:
      'WARN (BTC): Elevated risk signals detected across 2 pre-flight checks. Review findings before proceeding.',
    inspectedAt,
  });
}
