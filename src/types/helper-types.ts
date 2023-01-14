import {
  AccountInfo,
  Connection,
  KeyedAccountInfo,
  ParsedAccountData,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from '@solana/web3.js';
import BN from 'bn.js';

export type SolanaConnection = Connection;
export type GenericKeyAccount = KeyedAccountInfo;

export type TransactionLike = Transaction | Buffer | string | VersionedTransaction;
export type CompatibleTransaction = Transaction | VersionedTransaction;

export type BufferOrParsedAccount = Buffer | ParsedAccountData;

export type ParsedAccountPair = {
  pubkey: PublicKey;
  account: AccountInfo<BufferOrParsedAccount>;
};

export interface IMap<T> {
  [key: string]: T;
}

export interface IMapNumber<T> {
  [key: number]: T;
}

export type SortableTypes = string | number | Date | bigint | BN;

export type PickByTypeShort<T, TVal> = {
  [P in keyof T as T[P] extends TVal ? P : never]: T[P];
};

export type KeysOfType<T, U, B = true> = {
  [P in keyof T]: B extends true ? (T[P] extends U ? (U extends T[P] ? P : never) : never) : T[P] extends U ? P : never;
}[keyof T];

export type PickByType<T, U, B = true> = Pick<T, KeysOfType<T, U, B>>;
