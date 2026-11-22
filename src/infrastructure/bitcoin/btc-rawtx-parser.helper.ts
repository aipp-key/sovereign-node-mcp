import { createHash } from 'node:crypto';

export interface ParsedRawBitcoinTx {
  txid: string;
  totalOutputSats: bigint;
  totalOutputBtc: number;
  outputCount: number;
  inputCount: number;
  vsize: number;
  segwit: boolean;
}

interface VarIntRead {
  value: number;
  next: number;
}

function readVarInt(buf: Buffer, offset: number): VarIntRead | null {
  if (offset >= buf.length) return null;
  const first = buf[offset]!;
  if (first < 0xfd) return { value: first, next: offset + 1 };
  if (first === 0xfd) {
    if (offset + 3 > buf.length) return null;
    return { value: buf.readUInt16LE(offset + 1), next: offset + 3 };
  }
  if (first === 0xfe) {
    if (offset + 5 > buf.length) return null;
    return { value: buf.readUInt32LE(offset + 1), next: offset + 5 };
  }
  if (offset + 9 > buf.length) return null;
  const big = buf.readBigUInt64LE(offset + 1);
  if (big > 2_000_000n) return null;
  return { value: Number(big), next: offset + 9 };
}

function doubleSha256Reversed(buf: Buffer): string {
  const first = createHash('sha256').update(buf).digest();
  const second = createHash('sha256').update(first).digest();
  return Buffer.from(second).reverse().toString('hex');
}

/** Parses raw serialized Bitcoin transaction bytes without invoking bitcoin-cli. */
export function parseRawBitcoinTx(buf: Buffer): ParsedRawBitcoinTx | null {
  if (buf.length < 10 || buf.length > 2_000_000) return null;
  let pos = 4;
  let segwit = false;

  if (buf[pos] === 0x00 && buf[pos + 1] === 0x01) {
    segwit = true;
    pos += 2;
  }

  const bodyStart = pos;
  const vinVar = readVarInt(buf, pos);
  if (!vinVar || vinVar.value === 0) return null;
  const inputCount = vinVar.value;
  pos = vinVar.next;

  for (let i = 0; i < inputCount; i += 1) {
    if (pos + 36 > buf.length) return null;
    pos += 36;
    const scriptLen = readVarInt(buf, pos);
    if (!scriptLen || scriptLen.next + scriptLen.value + 4 > buf.length) return null;
    pos = scriptLen.next + scriptLen.value + 4;
  }

  const voutVar = readVarInt(buf, pos);
  if (!voutVar) return null;
  const outputCount = voutVar.value;
  pos = voutVar.next;

  let totalOutputSats = 0n;
  for (let i = 0; i < outputCount; i += 1) {
    if (pos + 8 > buf.length) return null;
    totalOutputSats += buf.readBigUInt64LE(pos);
    pos += 8;
    const pkLen = readVarInt(buf, pos);
    if (!pkLen || pkLen.next + pkLen.value > buf.length) return null;
    pos = pkLen.next + pkLen.value;
  }

  const bodyEnd = pos;
  if (segwit) {
    for (let i = 0; i < inputCount; i += 1) {
      const stackVar = readVarInt(buf, pos);
      if (!stackVar) return null;
      pos = stackVar.next;
      for (let j = 0; j < stackVar.value; j += 1) {
        const itemLen = readVarInt(buf, pos);
        if (!itemLen || itemLen.next + itemLen.value > buf.length) return null;
        pos = itemLen.next + itemLen.value;
      }
    }
  }

  if (pos + 4 > buf.length) return null;
  const locktimeBuf = buf.subarray(pos, pos + 4);
  const nonWitnessBuf = segwit
    ? Buffer.concat([buf.subarray(0, 4), buf.subarray(bodyStart, bodyEnd), locktimeBuf])
    : buf.subarray(0, pos + 4);

  const txLen = pos + 4;
  const weight = nonWitnessBuf.length * 3 + txLen;
  const vsize = Math.max(1, Math.ceil(weight / 4));
  const wholeBtc = totalOutputSats / 100_000_000n;
  const remSats = totalOutputSats % 100_000_000n;
  const totalOutputBtc = Number(wholeBtc) + Number(remSats) / 100_000_000;

  return {
    txid: doubleSha256Reversed(nonWitnessBuf),
    totalOutputSats,
    totalOutputBtc: Math.round(totalOutputBtc * 100_000_000) / 100_000_000,
    outputCount,
    inputCount,
    vsize,
    segwit,
  };
}
