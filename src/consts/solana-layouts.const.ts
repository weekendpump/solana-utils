import * as borsh from '@project-serum/borsh';
import { PublicKey } from '@solana/web3.js';

export interface IIDL_AccountLayout {
  authority: PublicKey;
  data: Buffer;
}

export const IDL_ACCOUNT_LAYOUT: borsh.Layout<IIDL_AccountLayout> = borsh.struct([
  borsh.publicKey('authority'),
  borsh.vecU8('data'),
]);
