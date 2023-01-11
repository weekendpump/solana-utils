import { IMap } from "../types";
import { SolanaKey } from "../utils";
import { IAnchorIdlFluffyType } from "./anchor-idl.interface";

export interface IAnchorIdlDecodedInstruction {
  name: string;
  accounts: IAnchorInstructionDecodedAccount[];
  args?: IAnchorIdlDecodedInstructionArg[];
  decodedArgs?: IMap<any>;
}

export interface IAnchorInstructionDecodedAccount {
  name: string;
  isMut: boolean;
  isSigner: boolean;
  value: SolanaKey;
}

export interface IAnchorIdlDecodedInstructionArg {
  name: string;
  type: IAnchorIdlFluffyType | string;
  value: any;
}
