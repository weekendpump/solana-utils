import BN from 'bn.js';

/** Useful info on token balance change */
export interface ISolanaTokenChange {
  accountKey: string;
  accountMint: string;
  accountOwner?: string;
  balancePre: number | BN | bigint;
  balancePost: number | BN | bigint;
  balanceDiff: number | bigint;
}
