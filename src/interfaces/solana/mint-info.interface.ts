import { AccountInfo } from '@solana/web3.js';
import { SolanaKey } from '../../utils';

/** Old, custom version of MintInfo type, probably redundant at this point */
export interface IMintInfo {
  id: string;
  owner: SolanaKey;
  mintAuthority: null | SolanaKey;
  freezeAuthority: null | SolanaKey;
  supply: bigint;
  supplyString: string;
  readonly decimals: number;
  isInitialized: boolean;
  mintAuthorityOption?: number;
  freezeAuthorityOption?: number;
  raw?: AccountInfo<Buffer>;
}
