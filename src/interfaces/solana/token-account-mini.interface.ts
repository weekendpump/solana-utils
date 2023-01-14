import { SolanaKey } from '../../utils';

export interface ITokenAccountMini {
  id: SolanaKey;
  mint: SolanaKey;
  amount: bigint;
}
