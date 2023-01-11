import {
  AccountMeta,
  AddressLookupTableAccount,
  KeyedAccountInfo,
  Keypair,
  Transaction,
  TransactionInstruction,
  TransactionResponse,
  VersionedTransaction,
} from '@solana/web3.js';
import { ISolanaAccountUpdate, ISolanaTokenChange } from '../interfaces';
import { SolanaEndpointConfig, SolanaEndpointNetwork, SolanaRpcTag } from '../types';
import { publicKey } from '@project-serum/borsh';
import { SolanaKey } from './lazy-solana-key';
import { toKey, toKeyString } from './key-utils';

export const DUMMY_BLOCKHASH = 'FnLUYsGmNt5LUJTjeryn7TcmsD4585k3zBb1ETwbqfoJ';

export function solanaBasicEndpoint(
  url: string,
  tags?: SolanaRpcTag[],
  wsUrl?: string,
  network: SolanaEndpointNetwork = 'mainnet-beta',
  maxAccounts = 100
): SolanaEndpointConfig {
  if (!url.startsWith('http')) {
    url = `http://${url}`;
  }

  return { url, network, tags, wsUrl, maxAccounts };
}

export function toKeyedAccountInfo(account: ISolanaAccountUpdate): KeyedAccountInfo {
  if (!account || !account.accountInfo) {
    throw 'Incorrect account';
  }
  return {
    accountId: account.accountId.key,
    accountInfo: account?.accountInfo,
  };
}

export function toAccountMeta(key: SolanaKey, isWritable = false, isSigner = false): AccountMeta {
  const metaKey = toKey(key);
  if (!metaKey) {
    throw 'Incorrect key';
  }
  return { pubkey: metaKey, isWritable, isSigner };
}

export function getPossibleAccounts(buf: Buffer): SolanaKey[] {
  const length = 32;
  const results: SolanaKey[] = [];

  for (let i = 0; i + length <= buf.length; i++) {
    const slice = buf.slice(i, i + length);
    const decoded = publicKey('data').decode(slice);
    const result = decoded.toBase58();
    results.push(result);
  }
  return results;
}

export function getTokenAccountChanges(tx: TransactionResponse, skipZero = true): ISolanaTokenChange[] | null {
  if (
    !tx ||
    !tx.transaction ||
    !tx.transaction.message ||
    !tx.meta ||
    !tx.meta.preTokenBalances ||
    !tx.meta.postTokenBalances
  ) {
    return null;
  }

  const result: ISolanaTokenChange[] = [];
  const keysLen = tx.transaction.message.accountKeys.length;

  for (let i = 0; i < keysLen; i++) {
    // const a = tx.transaction.message.accountKeys[i];
    const c = getTokenAccountChange(tx, i);
    if (skipZero && c?.balanceDiff === 0) {
      continue;
    }
    if (c) {
      result.push(c);
    }
  }
  return result;
}

export function getTokenAccountChange(tx: TransactionResponse, accountIndex: number): ISolanaTokenChange | null {
  if (
    !tx ||
    !tx.transaction ||
    !tx.transaction.message ||
    !tx.meta ||
    !tx.meta.preTokenBalances ||
    !tx.meta.postTokenBalances
  ) {
    return null;
  }
  const accountKey = toKeyString(tx.transaction.message.accountKeys[accountIndex]);
  const balancePre = tx.meta.preTokenBalances.find((b) => b.accountIndex === accountIndex);
  const balancePost = tx.meta.postTokenBalances.find((b) => b.accountIndex === accountIndex);
  const accountMint = tx.meta.preTokenBalances.find((b) => b.accountIndex === accountIndex);

  const balancePreSafe = balancePre && balancePre.uiTokenAmount ? Number(balancePre.uiTokenAmount.uiAmountString) : 0;
  const balancePostSafe =
    balancePost && balancePost.uiTokenAmount ? Number(balancePost.uiTokenAmount.uiAmountString) : 0;
  const balanceDiff = balancePostSafe - balancePreSafe;

  return {
    accountKey,
    accountMint: accountMint ? accountMint.mint : '',
    balancePre: balancePreSafe,
    balancePost: balancePostSafe,
    balanceDiff,
  };
}

export function getSerializedTxMessageLength(feePayer: SolanaKey, ixs: TransactionInstruction[]): number {
  const tx = new Transaction();
  tx.feePayer = toKey(feePayer);
  tx.recentBlockhash = DUMMY_BLOCKHASH;
  tx.add(...ixs);
  const serializedMessage = tx.serializeMessage();
  return serializedMessage.length;
}

export function getSerializedTxLength(feePayer: SolanaKey, ixs: TransactionInstruction[]): number {
  try {
    const dummySigner = Keypair.generate();
    const tx = new Transaction();
    tx.feePayer = toKey(feePayer);
    tx.recentBlockhash = DUMMY_BLOCKHASH;
    tx.add(...ixs);
    tx.partialSign(dummySigner);
    const serializedTx = tx.serialize({ verifySignatures: false });
    return serializedTx.length;
  } catch (err) {
    console.log('getSerializedTxLength exception', err);
    return -1;
  }
}

export function getWritableAccounts(tx: Transaction): SolanaKey[] {
  const writableKeys: SolanaKey[] = [];
  const txMessage = tx.compileMessage();
  for (let i = 0; i < txMessage.accountKeys.length; i++) {
    const key = toKey(txMessage.accountKeys[i]);
    if (key && txMessage.isAccountWritable(i)) {
      writableKeys.push(key);
    }
  }
  return writableKeys;
}

export function getWritableAccountsVersioned(
  tx: VersionedTransaction,
  addressLookupTableAccounts?: AddressLookupTableAccount[]
): SolanaKey[] {
  const writableKeys: SolanaKey[] = [];
  const accountKeys = tx.message.getAccountKeys({ addressLookupTableAccounts });
  for (let i = 0; i < accountKeys.length; i++) {
    const key = accountKeys.get(i);
    if (key && tx.message.isAccountWritable(i)) {
      writableKeys.push(key);
    }
  }
  return writableKeys;
}
