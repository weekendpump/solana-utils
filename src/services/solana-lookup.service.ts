import { SolanaApiService } from './solana-api.service';
import {
  AddressLookupTableAccount,
  AddressLookupTableProgram,
  PublicKey,
  TransactionInstruction,
} from '@solana/web3.js';
import { BaseLoggerService } from './base-logger.service';
import { SolanaKey, toKey } from '../utils';
import { SolanaConnection } from '../types';

/** Basic wrapper around AddressLookupTableProgram  */
export class SolanaLookupService {
  private isInitialized = false;
  protected readonly logPrefix = '[SolanaLookup]';

  constructor(protected readonly logger: BaseLoggerService, protected readonly solanaApi: SolanaApiService) {}

  async init(): Promise<boolean> {
    if (this.isInitialized) {
      return false;
    }
    this.isInitialized = true;
    return true;
  }

  async createLookupTableIx(
    authority: SolanaKey,
    payer?: SolanaKey,
    slot?: number,
    connection?: SolanaConnection
  ): Promise<[TransactionInstruction, PublicKey]> {
    if (!payer) {
      payer = authority;
    }
    if (!slot) {
      const c = connection ?? this.solanaApi.connect();
      slot = await c.getSlot();
    }

    const [lookupTableIx, lookupTableAddress] = AddressLookupTableProgram.createLookupTable({
      authority: toKey(authority),
      payer: toKey(payer),
      recentSlot: slot,
    });

    return [lookupTableIx, lookupTableAddress];
  }

  async extendLookupTableIx(
    lookupTable: SolanaKey,
    authority: SolanaKey,
    addresses: SolanaKey[],
    payer?: SolanaKey
  ): Promise<TransactionInstruction> {
    const extendIx = AddressLookupTableProgram.extendLookupTable({
      lookupTable: toKey(lookupTable),
      authority: toKey(authority),
      payer: payer ? toKey(payer) : undefined,
      addresses: addresses.map((x) => toKey(x)),
    });

    return extendIx;
  }

  async deactivateLookupTableIx(lookupTable: SolanaKey, authority: SolanaKey): Promise<TransactionInstruction> {
    const closeIx = AddressLookupTableProgram.deactivateLookupTable({
      lookupTable: toKey(lookupTable),
      authority: toKey(authority),
    });

    return closeIx;
  }

  async closeLookupTableIx(
    lookupTable: SolanaKey,
    authority: SolanaKey,
    recipient?: SolanaKey
  ): Promise<TransactionInstruction> {
    if (!recipient) {
      recipient = authority;
    }
    const closeIx = AddressLookupTableProgram.closeLookupTable({
      lookupTable: toKey(lookupTable),
      authority: toKey(authority),
      recipient: toKey(recipient),
    });

    return closeIx;
  }

  async fetchLookupTable(
    lookupTable: SolanaKey,
    connection?: SolanaConnection
  ): Promise<AddressLookupTableAccount | null> {
    const c = connection ?? this.solanaApi.connect();
    const response = await c.getAddressLookupTable(toKey(lookupTable));
    return response?.value;
  }

  async fetchLookupTables(
    lookupTables: SolanaKey[],
    connection?: SolanaConnection
  ): Promise<AddressLookupTableAccount[]> {
    const results: AddressLookupTableAccount[] = [];
    const accounts = await this.solanaApi.getMultipleAccounts(lookupTables, connection);
    for (const key of Object.keys(accounts)) {
      const accountInfo = accounts[key]?.accountInfo;
      if (!accountInfo) {
        this.logger.logAt(5, `${this.logPrefix} Unable to resolve ${key}`);
        continue;
      }
      const state = AddressLookupTableAccount.deserialize(accountInfo.data);
      const table = new AddressLookupTableAccount({ key: toKey(key), state });
      results.push(table);
    }
    return results;
  }
}
