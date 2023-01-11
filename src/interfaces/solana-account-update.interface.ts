import { AccountInfo } from "@solana/web3.js";
import { LazySolanaKey } from "../utils";

export interface ISolanaAccountUpdate {
  accountId: LazySolanaKey;
  accountInfo: AccountInfo<Buffer> | null;
  slot?: number;
  rpcEndpoint?: string;
  programId?: LazySolanaKey;
}
