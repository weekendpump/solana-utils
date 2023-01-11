import { BlockhashWithExpiryBlockHeight } from "@solana/web3.js";

export interface ISolanaRecentHash extends BlockhashWithExpiryBlockHeight {
  slot: number;
  /** bloch height at the moment of retrieving the hash, more or less */
  blockHeight: number;
  added: Date;
}
