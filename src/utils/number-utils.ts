import { nu64 } from '@solana/buffer-layout';
import BN from 'bn.js';

export function parseAmountString(amount: string, decimals: number): BN {
  const divider = new BN(10).pow(new BN(decimals || 0));
  return new BN(amount).div(divider);
}

export function toNumber(n: any): number {
  if (Number(n)) {
    return n;
  }
  if (BN.isBN(n)) {
    return n.toNumber();
  }
  return Number(n);
}

export function toBN(n: any): BN {
  if (BN.isBN(n)) {
    return n;
  }
  const result = new BN(n);
  return result;
}

export function bnToBigInt(n: BN): bigint {
  return BigInt(n.toString());
}

export function removeDecimals(n: BN, decimals: number): number {
  const divider = new BN(10).pow(new BN(decimals));
  return n.divRound(divider).toNumber();
}

export function removeDecimalsBigInt(n: bigint, decimals: number): number {
  const divider = Math.pow(10, decimals);
  // TODO: add tests
  return (n as unknown as number) / divider;
}

export function getPossibleNumbers(buf: Buffer): string[] {
  const length = 8;
  const results: string[] = [];

  for (let i = 0; i + length <= buf.length; i++) {
    const slice = buf.subarray(i, i + length);
    const decoded = nu64().decode(slice);
    const result = decoded;
    results.push(result.toString());
  }
  return results;
}

export function divideBnToNumber(numerator: BN, denominator: BN): number {
  const quotient = numerator.div(denominator).toNumber();
  const rem = numerator.umod(denominator);
  const gcd = rem.gcd(denominator);
  return quotient + rem.div(gcd).toNumber() / denominator.div(gcd).toNumber();
}

export function minBn(a: BN, b: BN): BN {
  return a.lte(b) ? a : b;
}

export function maxBn(a: BN, b: BN): BN {
  return a.lte(b) ? b : a;
}
