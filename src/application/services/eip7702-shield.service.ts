import { Eip7702ShieldReport, Eip7702ShieldRequest } from '../../domain/schemas/eip7702.schema.js';
import { Eip7702ScannerAdapter } from '../../infrastructure/evm/eip7702-scanner.adapter.js';

export class Eip7702ShieldService {
  constructor(private readonly scanner: Eip7702ScannerAdapter = new Eip7702ScannerAdapter()) {}

  /**
   * Inspects an EIP-7702 authorizationList for delegation drain risks,
   * cross-chain replay vectors, and dangerous EVM opcodes.
   */
  async inspectAuthorizations(request: Eip7702ShieldRequest): Promise<Eip7702ShieldReport> {
    return this.scanner.inspectAuthorizationList(request);
  }
}
