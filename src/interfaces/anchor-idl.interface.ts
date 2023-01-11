import { SolanaKey } from "../utils";

/** Probably obsolete now */
export interface IAnchorIdl {
  programId: SolanaKey;
  idlId?: SolanaKey;
  version: string;
  name: string;
  instructions: IAnchorIdlInstruction[];
  accounts: IAnchorIdlAccount[];
  types: IAnchorIdlTypeElement[];
  errors: IAnchorIdlError[];
  events: IAnchorIdlEvent[];
}

export interface IAnchorIdlEvent {
  name: string;
  fields: IAnchorIdlEventField[];
}

export interface IAnchorIdlEventField {
  name: string;
  type: string;
  index: boolean;
}

export interface IAnchorIdlAccount {
  name: string;
  type: IAnchorIdlAccountType;
}

export interface IAnchorIdlAccountType {
  kind: string;
  fields: IAnchorIdlPurpleField[];
}

export interface IAnchorIdlPurpleField {
  name: string;
  type: IAnchorIdlPurpleType | string;
}

export interface IAnchorIdlPurpleType {
  option?: string;
  defined?: string;
}

export interface IAnchorIdlError {
  code: number;
  name: string;
  msg: string;
}

export interface IAnchorIdlInstruction {
  name: string;
  accounts: IAnchorInstructionAccount[];
  args: IAnchorIdlInstructionArg[];
}

export interface IAnchorInstructionAccount {
  name: string;
  isMut: boolean;
  isSigner: boolean;
}

export interface IAnchorIdlInstructionArg {
  name: string;
  type: IAnchorIdlFluffyType | string;
}

export interface IAnchorIdlFluffyType {
  option?: string;
  defined?: string;
  vec?: IAnchorIdlVec;
}

export interface IAnchorIdlVec {
  defined: string;
}

export interface IAnchorIdlTypeElement {
  name: string;
  type: IAnchorTentacledType;
}

export interface IAnchorTentacledType {
  kind: string;
  fields: IAnchorIdlFluffyField[];
}

export interface IAnchorIdlFluffyField {
  name: string;
  type: IAnchorIdlStickyType | string;
}

export interface IAnchorIdlStickyType {
  option?: string;
  vec?: IAnchorIdlVec;
}
