import {
  TransactionSignature,
  Keypair,
  TransactionInstruction,
  VersionedTransaction,
  SimulateTransactionConfig,
  TransactionMessage,
  AddressLookupTableAccount,
} from '@solana/web3.js';
import { SolanaApiService } from './solana-api.service';
import { SolanaHashService } from './solana-hash.service';
import { Buffer } from 'buffer';
import { SolanaRpcService } from './solana-rpc.service';
import { SplTokenService } from './spl-token.service';
import { BaseLoggerService } from '../base-logger.service';
import { getWritableAccountsVersioned, SolanaKey, stringify, toKey, toKeyString } from '../../utils';
import { ISolanaSimulationBalances } from '../../interfaces';
import { IMap, SolanaConnection } from '../../types';
import { SOLANA_MAX_TX_LENGTH, SPL_TOKEN_LAYOUT_LENGTH } from '../../consts';

/** Helpers for creating transactions quickly and simulation */
export class SolanaTxService {
  readonly logPrefix = '[SolanaTx]';
  accounts: { [key: string]: Keypair } = {};
  txIds: TransactionSignature[] = [];
  endpointIndex = 0;

  constructor(
    protected readonly logger: BaseLoggerService,
    protected readonly solanaApi: SolanaApiService,
    protected readonly solanaHash: SolanaHashService,
    protected readonly solanaRpc: SolanaRpcService,
    protected readonly token: SplTokenService
  ) {}

  /** Create a new VersionedTransaction with defined instructions, should be done when ready to send/sim */
  async createTx(
    payer: SolanaKey,
    instructions: TransactionInstruction[],
    recentBlockhash?: string,
    addressLookupTableAccounts?: AddressLookupTableAccount[],
    peekHash = true
  ): Promise<VersionedTransaction> {
    if (!recentBlockhash) {
      recentBlockhash = peekHash ? await this.solanaHash.peekHash() : await this.solanaHash.popHash();
    }
    const payerKey = toKey(payer);
    const message = new TransactionMessage({
      payerKey,
      recentBlockhash,
      instructions,
    });
    const compiledMessage = message.compileToV0Message(addressLookupTableAccounts);
    const transactionV0 = new VersionedTransaction(compiledMessage);

    return transactionV0;
  }

  /** Tries to pack as many Instructions as possible into a VersionedTransaction, creating subsequent ones when necessary */
  async packIxs(
    payer: SolanaKey,
    ixs: TransactionInstruction[][],
    addressLookupTableAccounts?: AddressLookupTableAccount[],
    recentBlockhash?: string,
    peekHash = true
  ): Promise<VersionedTransaction[]> {
    const results: VersionedTransaction[] = [];
    if (!ixs) {
      return results;
    }

    if (!recentBlockhash) {
      recentBlockhash = peekHash ? await this.solanaHash.peekHash() : await this.solanaHash.popHash();
    }
    const payerKey = toKey(payer);

    let batch: TransactionInstruction[] = [];
    let tx: VersionedTransaction | null = null;

    for (const chunk of ixs) {
      try {
        const instructions = [...batch, ...chunk];

        const message = new TransactionMessage({
          payerKey,
          recentBlockhash,
          instructions,
        });
        const msg = message.compileToV0Message(addressLookupTableAccounts);
        const serialized = msg.serialize();
        // TODO: improve for edge cases
        if (serialized && serialized.length < SOLANA_MAX_TX_LENGTH - 32) {
          batch = instructions;
          tx = new VersionedTransaction(msg);
          this.logger.logAt(
            8,
            `${this.logPrefix} Serialization to ${serialized.length} bytes ok, trying to pack more than ${batch?.length} ixs`
          );
        } else {
          throw Error('Tx too long or cannot be serialized');
        }
      } catch (err) {
        this.logger.logAt(8, `${this.logPrefix} Serialization error, closing with ${batch.length} ixs`);
        if (tx) {
          results.push(tx);
          batch = [];
          tx = null;
        } else {
          throw new Error('Cannot pack ix batch into single tx');
        }
      }
    }

    if (tx) {
      results.push(tx);
    }

    this.logger.logAt(5, `${this.logPrefix} Done packing with ${results?.length} txs`);

    return results;
  }

  /** Versioned Wrapper around solanaApi method with extra balance checks */
  async simTxVersioned(
    tx: VersionedTransaction,
    config?: SimulateTransactionConfig,
    includeBalances = true,
    addressLookupTableAccounts?: AddressLookupTableAccount[],
    showSize = false,
    connection?: SolanaConnection
  ): Promise<ISolanaSimulationBalances | null> {
    if (!tx || !tx.message) {
      return null;
    }

    if (showSize) {
      const serialized = tx.serialize();
      this.logger.logAt(
        5,
        `${this.logPrefix} Serialized size: ${serialized.length}, ix: ${tx.message.compiledInstructions?.length}`
      );
    }

    const writableKeys = includeBalances ? getWritableAccountsVersioned(tx, addressLookupTableAccounts) : [];
    this.logger.logAt(8, `${this.logPrefix} Writable keys for simulation`, stringify(writableKeys));

    const balances: IMap<bigint | number> = {};
    if (includeBalances) {
      const accounts = await this.token.getMultipleTokenAccounts(writableKeys, connection);
      for (const a of accounts) {
        balances[toKeyString(a.id)] = a.amount;
      }
    }

    this.logger.logAt(8, `${this.logPrefix} Balances before simulation`, stringify(balances));

    if (!config) {
      config = {};
    }
    if (!config.accounts) {
      config.accounts = {
        encoding: 'base64',
        addresses: writableKeys.map((x) => toKeyString(x)),
      };
    }
    const simulation = await this.solanaApi.simulateTransactionV2(tx, config, connection);

    // simulation.balances = {};
    simulation.changes = {};
    if (includeBalances && simulation && simulation.accounts) {
      for (let i = 0; i < writableKeys.length; i++) {
        try {
          const accountKey = toKeyString(writableKeys[i]);
          const acc = simulation.accounts[i];
          if (!acc || !acc.data || !acc.data[0]) {
            continue;
          }
          const accData = Buffer.from(acc.data[0], 'base64');
          if (accData.length !== SPL_TOKEN_LAYOUT_LENGTH) {
            continue;
          }
          const decodedAcc = this.token.toAccountInfoFromBuffer(accData, accountKey);
          if (!decodedAcc) {
            continue;
          }
          const accountMint = toKeyString(decodedAcc.mint);
          const accountOwner = toKeyString(decodedAcc.owner);

          simulation.changes[accountKey] = {
            accountKey,
            accountMint,
            accountOwner,
            balancePre: balances[accountKey],
            balancePost: decodedAcc.amount,
            balanceDiff: BigInt(decodedAcc.amount) - BigInt(balances[accountKey] ?? 0),
          };
        } catch (err) {
          this.logger.logAt(4, `${this.logPrefix} Error decoding sim account ${toKeyString(writableKeys[i])}`, err);
        }
      }
    }
    simulation.accounts = undefined;

    if (simulation.err) {
      const instructionError = (simulation?.err as any)?.InstructionError as [number, string | { Custom: number }];
      const ixError = instructionError && instructionError.length ? instructionError[1] : '';
      simulation.errorCode = typeof ixError === 'string' ? ixError : ixError?.Custom;
    }

    return simulation;
  }
}
