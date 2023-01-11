import { TokenAmount } from "@solana/web3.js";

/** Parsed transferChecked instruction returned by RPC  */
export interface ISolanaParsedTokenInstruction {
  info: {
    authority: string;
    destination: string;
    mint: string;
    source: string;
    tokenAmount: TokenAmount;
  };
  type: "transferChecked";
}
