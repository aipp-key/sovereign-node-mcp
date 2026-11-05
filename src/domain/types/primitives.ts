/**
 * Zero-trust Primitive Types for Sovereign Node Intelligence & Settlement
 * Clean Architecture - Pure Domain Layer (No external dependencies)
 */

export type Satoshi = number & { readonly __brand: unique symbol };

export function toSatoshi(amount: number): Satoshi {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error(`Invalid Satoshi value: ${amount}. Satoshis must be non-negative integers.`);
  }
  return amount as Satoshi;
}

export type PaymentHashHex = string & { readonly __brand: unique symbol };
export type PreimageHex = string & { readonly __brand: unique symbol };
export type MacaroonBase64 = string & { readonly __brand: unique symbol };

export function toPaymentHashHex(hex: string): PaymentHashHex {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(`Invalid 32-byte hex payment hash: ${hex}`);
  }
  return hex.toLowerCase() as PaymentHashHex;
}

export function toPreimageHex(hex: string): PreimageHex {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(`Invalid 32-byte hex preimage: ${hex}`);
  }
  return hex.toLowerCase() as PreimageHex;
}
