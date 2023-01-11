import { RawAccount } from '@solana/spl-token';
import { SolanaKey } from '../utils';

/** My version of AccountInfo type */
export interface ITokenAccountInfo extends RawAccount {
  id: SolanaKey;
  /** string version of the bigint, no decimals */
  amountString: string;
  /** number version of the bigint, includes decimals */
  amountNumber?: number;
  decimals: number;
}
