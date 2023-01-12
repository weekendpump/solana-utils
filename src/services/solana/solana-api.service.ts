import { ReplaySubject } from 'rxjs';
import {
  Commitment,
  ComputeBudgetProgram,
  Connection,
  ContactInfo,
  EpochInfo,
  Finality,
  GetAccountInfoConfig,
  GetProgramAccountsFilter,
  GetSlotConfig,
  GetVersionedTransactionConfig,
  Keypair,
  Logs,
  PerfSample,
  PublicKey,
  SignatureResult,
  SignatureSubscriptionCallback,
  SignatureSubscriptionOptions,
  Signer,
  SimulateTransactionConfig,
  SlotChangeCallback,
  SlotInfo,
  SlotUpdate,
  SlotUpdateCallback,
  StakeActivationData,
  SystemProgram,
  Transaction,
  TransactionConfirmationStrategy,
  TransactionInstruction,
  TransactionResponse,
  TransactionSignature,
  VersionedTransaction,
  VoteAccountStatus,
} from '@solana/web3.js';

import { Buffer } from 'buffer';
import { ISolanaAccountUpdate, ISolanaRecentHash, ISolanaSimulationBalances } from '../../interfaces';
import { CompatibleTransaction, IMap, SolanaConnection, SolanaRpcTag } from '../../types';
import { BaseLoggerService } from '../base-logger.service';
import { MEMO_PROGRAM_ID } from '../../consts';
import { SolanaKey, toKey, LazySolanaKey, toKeyString, chunks, sleep, stringify } from '../../utils';
import { SolanaRpcService } from './solana-rpc.service';

export class SolanaApiService {
  readonly logPrefix = '[SolanaApi]';
  readonly MAX_TRANSACTION_BATCH_SIZE = 100;
  readonly RESOLVE_QUEUE_INTERVAL_MS = 300;
  readonly UPDATE_QUEUE_INTERVAL_MS = 300;
  readonly accountUpdates$: IMap<ReplaySubject<ISolanaAccountUpdate>> = {};
  readonly accountUpdatesMaxSlots: IMap<number> = {};
  readonly logUpdates$: IMap<ReplaySubject<Logs>> = {};

  readonly resolvedAccounts: IMap<boolean> = {};

  private readonly slotChanges$ = new ReplaySubject<SlotInfo>(1);
  readonly slotInfo$ = this.slotChanges$.asObservable();

  private readonly slotUpdates$ = new ReplaySubject<SlotUpdate>(1);
  readonly slotUpdate$ = this.slotUpdates$.asObservable();

  constructor(protected readonly logger: BaseLoggerService, protected readonly solanaRpc: SolanaRpcService) {}

  connect(commitment: Commitment = 'processed', tag: SolanaRpcTag = 'default') {
    return this.solanaRpc.connect(commitment, tag);
  }

  async getClusterNodes(): Promise<ContactInfo[]> {
    const c = this.connect();
    return await c.getClusterNodes();
  }

  async getStakeActivation(key: SolanaKey): Promise<StakeActivationData> {
    if (!key) {
      throw 'Missing key argument';
    }
    const c = this.connect();
    return await c.getStakeActivation(toKey(key));
  }

  async getVoteAccounts(): Promise<VoteAccountStatus> {
    const c = this.connect();
    return await c.getVoteAccounts();
  }

  async getMinBalanceForRentExemption(n: number): Promise<number> {
    const c = this.connect();
    const rentExemption = await c.getMinimumBalanceForRentExemption(n);
    return rentExemption;
  }

  async getBalance(accountKey: SolanaKey): Promise<number> {
    const account = accountKey instanceof PublicKey ? accountKey : new PublicKey(accountKey);
    const c = this.connect();
    return await c.getBalance(account);
  }

  async getSlot(connection?: Connection, commitmentOrConfig?: Commitment | GetSlotConfig): Promise<number> {
    const c = connection ?? this.connect();
    return await c.getSlot(commitmentOrConfig);
  }

  async getPerformanceSamples(connection?: Connection, limit = 1): Promise<PerfSample[]> {
    const c = connection ?? this.connect();
    return await c.getRecentPerformanceSamples(limit);
  }

  /** Updated to include the context and account id for convenience */
  async getAccount(
    accountKey: SolanaKey,
    connection?: Connection,
    commitmentOrConfig?: Commitment | GetAccountInfoConfig
  ): Promise<ISolanaAccountUpdate | null> {
    if (!accountKey) {
      this.logger.logAt(4, `${this.logPrefix} getAccount: missing account`);
      return null;
    }
    try {
      const accountId = toKey(accountKey);
      if (!accountId) {
        return null;
      }
      const c = connection ?? this.connect();
      const response = await c.getAccountInfoAndContext(accountId, commitmentOrConfig);
      if (!response || !response.value || !response.value.lamports) {
        return null;
      }
      const update: ISolanaAccountUpdate = {
        accountId: LazySolanaKey.from(accountId),
        accountInfo: response.value,
        programId: LazySolanaKey.from(response.value.owner),
        slot: response.context?.slot,
        rpcEndpoint: c.rpcEndpoint,
      };
      return update;
    } catch (err) {
      this.logger.logAt(4, `${this.logPrefix} getAccount: error getting account ${toKeyString(accountKey)}:\n${err}`);
      return null;
    }
  }

  async getMultipleAccounts(
    keys: SolanaKey[],
    connection?: Connection,
    chunkSize = 99,
    delayMs = 0
  ): Promise<IMap<ISolanaAccountUpdate>> {
    let accountChunks: IMap<ISolanaAccountUpdate>[] = [];

    if (delayMs > 0) {
      const keyChunks = chunks(keys, chunkSize);
      for (const chunk of keyChunks) {
        const accounts = await this.getMultipleAccountsCore(chunk, connection);
        if (accounts) {
          accountChunks.push(accounts);
        }
        await sleep(delayMs);
      }
    } else {
      accountChunks = await Promise.all(
        chunks(keys, chunkSize).map((chunk) => this.getMultipleAccountsCore(chunk, connection))
      );
    }

    const results: IMap<ISolanaAccountUpdate> = {};
    accountChunks.forEach((a) => Object.assign(results, a));

    return results;
  }

  /** This should be preferred due to static return type for AccountInfo<Buffer> */
  async getFilteredProgramAccounts(
    programId: SolanaKey,
    filters?: GetProgramAccountsFilter[],
    commitment: Commitment = 'confirmed',
    dataSlice?: { offset: number; length: number },
    connection?: SolanaConnection
  ): Promise<ISolanaAccountUpdate[]> {
    try {
      const c: SolanaConnection = connection ?? this.connect(commitment, 'programAccounts');
      if (!c) {
        throw 'Unable to get Solana connection';
      }
      const params = { dataSlice, commitment, filters };
      this.logger.logAt(
        5,
        `${this.logPrefix} Sending getFilteredProgramAccounts for ${toKeyString(programId)} to ${
          c.rpcEndpoint
        }: ${JSON.stringify(params)}`
      );
      const programAccounts = await c.getProgramAccounts(toKey(programId), params);
      return programAccounts.map((x) => ({
        accountId: LazySolanaKey.from(x.pubkey),
        rpcEndpoint: c.rpcEndpoint,
        accountInfo: x.account,
      }));
    } catch (err) {
      this.logger.logAt(5, `${this.logPrefix} Error getFilteredProgramAccounts for ${toKeyString(programId)}`, err);
      throw err;
    }
  }
  async getRentExcemptionBalance(dataLength: number, connection?: Connection): Promise<number> {
    const c = connection ?? this.connect();
    return await c.getMinimumBalanceForRentExemption(dataLength);
  }

  /** check if confirmed is enough */
  async getLatestBlockhash(
    commitment: Commitment = 'finalized',
    connection?: Connection,
    withBlockHeight = false
  ): Promise<ISolanaRecentHash | null> {
    try {
      const c = connection ?? this.connect();
      const response = await c.getLatestBlockhashAndContext(commitment);
      let blockHeight = 0;
      if (withBlockHeight) {
        blockHeight = await c.getBlockHeight({
          commitment,
          minContextSlot: response?.context?.slot - 5,
        });
      }
      return response
        ? {
            ...response.context,
            ...response.value,
            added: new Date(),
            blockHeight,
          }
        : null;
    } catch (err) {
      this.logger.logAt(4, `${this.logPrefix} getLatestBlockhash exception`, err);
      return null;
    }
  }

  async sendRawTransaction(
    rawTransaction: Buffer | Uint8Array | Array<number>,
    connection: Connection,
    skipPreflight = true,
    minContextSlot?: number
  ): Promise<TransactionSignature> {
    const txid: TransactionSignature = await connection.sendRawTransaction(rawTransaction, {
      skipPreflight,
      preflightCommitment: connection.commitment,
      minContextSlot,
      maxRetries: 3,
    });
    // this.logger.logAt(
    //   8,
    //   `${this.logPrefix} sent raw transaction: ${rawTransaction.toString('hex')}, tx id: ${txid} with commitment: ${
    //     connection.commitment
    //   }`
    // );
    return txid;
  }

  async simulateTransactionV2(
    transaction: VersionedTransaction,
    config?: SimulateTransactionConfig,
    connection?: Connection
  ): Promise<ISolanaSimulationBalances> {
    const c = connection ?? this.connect();
    this.logger.logAt(5, `${this.logPrefix} Simulating v2 @ ${c.rpcEndpoint}`, stringify({ config }));
    const response = await c.simulateTransaction(transaction, config);
    return response?.value;
  }

  /** Send signed transaction with optional connection override */
  async sendSignedTransaction(
    signedTransaction: CompatibleTransaction,
    connection?: Connection,
    skipPreflight = true,
    minContextSlot?: number
  ): Promise<TransactionSignature> {
    const c = connection ?? this.connect();
    try {
      const rawTransaction = signedTransaction.serialize();
      const txId = await this.sendRawTransaction(rawTransaction, c, skipPreflight, minContextSlot);
      this.logger.logAt(
        6,
        `${this.logPrefix} Sent signed transaction to ${c.rpcEndpoint} @ minContextSlot ${minContextSlot}
        Tx Id: ${txId}
        skipPreflight: ${skipPreflight}
        Length: ${rawTransaction.length}/${rawTransaction.byteLength}`
      );
      return txId;
    } catch (err) {
      this.logger.logAt(
        4,
        `${this.logPrefix} Exception sending tx to ${c.rpcEndpoint} @ minContextSlot ${minContextSlot}`,
        err
      );
      return '';
    }
  }

  async confirmTransaction(
    config: TransactionConfirmationStrategy,
    commitment: Finality = 'confirmed',
    connection?: SolanaConnection
  ): Promise<SignatureResult | null> {
    const c = connection ?? this.connect(commitment);
    const response = await c.confirmTransaction(config);
    return response?.value;
  }

  /** New way of getting Transaction details  */
  async getTransaction(
    txId: string,
    commitment: Finality = 'confirmed',
    connection?: SolanaConnection
  ): Promise<TransactionResponse | null> {
    const c = connection ?? this.connect();
    const response = await c.getTransaction(txId, { commitment });
    return response;
  }

  /** New way of getting multiple Transaction details  */
  async getTransactions(
    txIds: string[],
    commitmentOrConfig: GetVersionedTransactionConfig | Finality,
    connection?: SolanaConnection,
    batchDelayMs = 500
  ): Promise<(TransactionResponse | null)[]> {
    const c = connection ?? this.connect();
    const ids = [...txIds];
    const result: (TransactionResponse | null)[] = [];
    this.logger.logAt(5, `${this.logPrefix} Fetching ${txIds.length} transactions from signatures.`);

    while (ids.length > 0) {
      const signatures = ids.splice(0, this.MAX_TRANSACTION_BATCH_SIZE);
      const fetched = await c.getTransactions(signatures, commitmentOrConfig);
      result.push(...fetched);
      this.logger.logAt(5, `${this.logPrefix} Got batch ${fetched?.length}/${result?.length}`);
      await sleep(batchDelayMs);
    }
    return result;
  }

  async getFirstAvailableBlock(connection?: SolanaConnection): Promise<number> {
    const c: SolanaConnection = connection ?? this.connect('processed');
    const response = await c.getFirstAvailableBlock();
    this.logger.logAt(8, `${this.logPrefix} Got first available block`, response);
    return response;
  }

  async getBlockHeight(
    connection?: SolanaConnection,
    commitment: Commitment = 'processed',
    minContextSlot?: number
  ): Promise<number> {
    const c = connection ?? this.connect();
    return c.getBlockHeight({ commitment, minContextSlot });
  }

  async getMinimumLedgerSlot(connection?: SolanaConnection): Promise<number> {
    const c: SolanaConnection = connection ?? this.connect('processed');
    const response = await c.getMinimumLedgerSlot();
    this.logger.logAt(8, `${this.logPrefix} Got minimum ledger slot`, response);
    return response;
  }

  async getBlockTime(slot: number, connection?: SolanaConnection): Promise<number | null> {
    const c: SolanaConnection = connection ?? this.connect('processed');
    const response = await c.getBlockTime(slot);
    return response;
  }

  async getEpochInfo(connection?: SolanaConnection, commitment: Finality = 'confirmed'): Promise<EpochInfo> {
    const c: SolanaConnection = connection ?? this.connect('processed');
    const response = await c.getEpochInfo(commitment);
    return response;
  }

  subscribeToSlotChanges(connection?: SolanaConnection, callback?: SlotChangeCallback) {
    const c: SolanaConnection = connection ?? this.connect('processed', 'slotUpdate');
    c.onSlotChange((info) => (callback ? callback(info) : this.handleSlotChange(info)));
  }

  subscribeToSlotUpdates(connection?: SolanaConnection, callback?: SlotUpdateCallback) {
    const c: SolanaConnection = connection ?? this.connect('processed', 'slotUpdate');
    c.onSlotUpdate((update) => (callback ? callback(update) : this.handleSlotUpdate(update)));
  }

  subscribeToSignatureChanges(
    signature: string,
    callback: SignatureSubscriptionCallback,
    options?: SignatureSubscriptionOptions,
    connection?: Connection
  ) {
    const c = connection ?? this.connect();
    c.onSignatureWithOptions(signature, callback, options);
  }

  private handleSlotChange(slotInfo: SlotInfo) {
    this.slotChanges$.next(slotInfo);
  }

  private handleSlotUpdate(slotUpdate: SlotUpdate) {
    this.slotUpdates$.next(slotUpdate);
  }

  createMemoInstruction(memo: string, signerPubkeys?: Array<PublicKey>): TransactionInstruction {
    const keys =
      signerPubkeys == null
        ? []
        : signerPubkeys.map(function (key) {
            return { pubkey: key, isSigner: true, isWritable: false };
          });

    return new TransactionInstruction({
      keys: keys,
      programId: toKey(MEMO_PROGRAM_ID),
      data: Buffer.from(memo, 'utf8'),
    });
  }

  async createAccountIx(
    payer: SolanaKey,
    owner: SolanaKey,
    space: number,
    signer?: Signer
  ): Promise<[TransactionInstruction, Signer]> {
    const lamports = await this.getRentExcemptionBalance(space);
    if (!signer) {
      signer = Keypair.generate();
    }
    const ix = SystemProgram.createAccount({
      fromPubkey: toKey(payer),
      programId: toKey(owner),
      newAccountPubkey: signer.publicKey,
      lamports,
      space,
    });

    return [ix, signer];
  }

  additionalComputeBudgetInstruction(units: number, microLamports: number): TransactionInstruction[] {
    const ixs: TransactionInstruction[] = [];
    if (units > 0) {
      const unitIx = ComputeBudgetProgram.setComputeUnitLimit({ units });
      ixs.push(unitIx);
    }
    if (microLamports > 0) {
      const feeIx = ComputeBudgetProgram.setComputeUnitPrice({ microLamports });
      ixs.push(feeIx);
    }
    // this.logger.logAt(5, `${this.logPrefix} compute ixs`, stringify({ ixs }));
    return ixs;
  }

  mergeTransactions(transactions: (Transaction | undefined)[]) {
    const transaction = new Transaction();
    transactions
      .filter((t): t is Transaction => t !== undefined)
      .forEach((t) => {
        transaction.add(t);
      });
    return transaction;
  }

  /** TODO: Same as above but merge all signers as well */
  mergeTransactionsWithSigners(transactions: (Transaction | undefined)[]) {
    const transaction = new Transaction();
    transactions
      .filter((t): t is Transaction => t !== undefined)
      .forEach((t) => {
        transaction.add(t);
      });
    return transaction;
  }

  private async getMultipleAccountsCore(
    keys: SolanaKey[],
    connection?: Connection,
    commitmentOrConfig?: Commitment | GetAccountInfoConfig
  ): Promise<IMap<ISolanaAccountUpdate>> {
    const c = connection ?? this.connect(undefined, 'multipleAccounts');
    const keys2 = keys.filter((k) => Boolean(k));
    if (keys2.length === 0) {
      return {};
    }
    const keyStrings = keys2.map((k) => toKeyString(k));
    const publicKeys = keys2.map((k) => toKey(k));

    const response = await c.getMultipleAccountsInfoAndContext(publicKeys, commitmentOrConfig);
    if (!response?.value) {
      this.logger.logAt(4, `${this.logPrefix} failed to get info about ${keyStrings.length} accounts`, keyStrings);
      return {};
    }
    const results: IMap<ISolanaAccountUpdate> = {};

    for (let i = 0; i < publicKeys.length; i++) {
      if (!response.value[i]) {
        continue;
      }
      const account: ISolanaAccountUpdate = {
        accountId: LazySolanaKey.from(publicKeys[i]),
        accountInfo: response.value[i],
        slot: response.context.slot,
        rpcEndpoint: c.rpcEndpoint,
      };
      results[keyStrings[i]] = account;
    }
    return results;
  }
}
