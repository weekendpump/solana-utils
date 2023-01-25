import { Connection, Commitment, Logs, SlotInfo, SlotUpdate, Context, AccountInfo } from '@solana/web3.js';
import { combineLatest, filter, interval, map, Observable, ReplaySubject } from 'rxjs';
import { ILogsWithSlot, ISolanaAccountUpdate } from '../../interfaces';
import { IMap, SolanaConnection } from '../../types';
import { SolanaKey, sleep, toKeyString, toKey, LazySolanaKey } from '../../utils';
import { BaseLoggerService } from '../base-logger.service';
import { SolanaApiService } from './solana-api.service';

export class SolanaUpdateService {
  readonly logPrefix = '[SolanaUpdate]';
  readonly RESOLVE_QUEUE_INTERVAL_MS = 1000;
  readonly UPDATE_QUEUE_INTERVAL_MS = 1000;

  readonly accountUpdates$: IMap<ReplaySubject<ISolanaAccountUpdate>> = {};
  readonly accountUpdatesMaxSlots: IMap<number> = {};
  readonly logUpdates$: IMap<ReplaySubject<ILogsWithSlot>> = {};
  readonly slotChanges$ = new ReplaySubject<SlotInfo>(1);
  readonly slotInfo$ = this.slotChanges$.asObservable();

  readonly slotUpdates$ = new ReplaySubject<SlotUpdate>(1);
  readonly slotUpdate$ = this.slotUpdates$.asObservable();
  readonly resolvedAccounts: IMap<boolean> = {};
  readonly resolveQueue: SolanaKey[] = [];

  readonly resolvedSubscriptions: IMap<boolean> = {};
  readonly subscriptionQueue: IMap<{ account: SolanaKey; connection: SolanaConnection }> = {};

  constructor(protected readonly logger: BaseLoggerService, protected readonly solanaApi: SolanaApiService) {
    interval(this.RESOLVE_QUEUE_INTERVAL_MS)
      .pipe(filter(() => Boolean(this.resolveQueue.length)))
      .subscribe(async () => {
        const queue = this.resolveQueue.splice(0, this.solanaApi.MAX_TRANSACTION_BATCH_SIZE);
        const accounts = await this.solanaApi.getMultipleAccounts(queue);
        this.logger.logAt(
          8,
          `${this.logPrefix} Resolving ${queue.length} accounts, ${this.resolveQueue.length} remaining`
        );
        Object.values(accounts).forEach((a) => {
          this.updateCache(a);
        });
      });
    this.handleUpdateQueue();
  }

  private async handleUpdateQueue(always = true) {
    while (always) {
      const keys = Object.keys(this.subscriptionQueue);
      if (!keys || keys.length === 0) {
        await sleep(this.UPDATE_QUEUE_INTERVAL_MS);
        continue;
      }
      const key = keys[0];
      if (this.resolvedSubscriptions[key]) {
        delete this.subscriptionQueue[key];
        continue;
      }

      const c = this.subscriptionQueue[key].connection;
      this.subscribeToAccountChanges([this.subscriptionQueue[key].account], c);
      delete this.subscriptionQueue[key];
      await sleep(this.UPDATE_QUEUE_INTERVAL_MS);
      if (Object.keys(this.subscriptionQueue)?.length === 0) {
        this.logger.logAt(
          8,
          `${this.logPrefix} handleUpdateQueue: queue clean, resolved: ${
            Object.keys(this.resolvedSubscriptions)?.length
          }`
        );
      }
    }
  }

  safeAccountUpdate(
    accountKey: SolanaKey,
    connection?: SolanaConnection,
    autoSubscribe = true,
    getInitial = true,
    poolingMs = 0
  ): Observable<ISolanaAccountUpdate> {
    const accountString = toKeyString(accountKey);
    this.ensureAccountUpdates(accountString);

    if (autoSubscribe) {
      const c = connection ?? this.solanaApi.connect('processed', 'update');
      this.addToSubscribeQueue(accountString, c);
    }

    if (getInitial) {
      this.addToResolveQueue([accountKey]);
    }

    if (poolingMs > 0) {
      interval(poolingMs).subscribe(() => {
        this.logger.logAt(8, `${this.logPrefix} Adding ${toKeyString(accountKey)} for pooling`);
        this.addToResolveQueue([accountKey], true);
      });
    }
    return this.accountUpdates$[accountString]?.asObservable();
  }

  safeAccountUpdates(
    accountKeys: SolanaKey[],
    connection?: SolanaConnection,
    autoSubscribe = true,
    getInitial = true,
    poolingMs = 0
  ): Observable<IMap<ISolanaAccountUpdate>> {
    const updates$ = accountKeys.map((x) =>
      this.safeAccountUpdate(x, connection, autoSubscribe, getInitial, poolingMs)
    );
    return combineLatest([...updates$]).pipe(
      map((x) => {
        const r: IMap<ISolanaAccountUpdate> = {};
        for (let i = 0; i < x.length; i++) {
          const key = toKeyString(accountKeys[i]);
          const value = x[i];
          r[key] = value;
        }
        return r;
      })
    );
  }

  safeLogUpdate(accountKey: SolanaKey | 'all', connection?: SolanaConnection, commitment: Commitment = 'processed') {
    const key = toKeyString(accountKey);
    if (!this.logUpdates$[key]) {
      this.subscribeToLogChanges(key, connection, commitment);
    }
    return this.logUpdates$[key] ? this.logUpdates$[key].asObservable() : null;
  }

  subscribeToLogChanges(
    accountKey: SolanaKey | 'all',
    connection?: Connection,
    commitment: Commitment = 'processed'
  ): number {
    const c = connection ?? this.solanaApi.connect(commitment, 'update');
    const key = toKeyString(accountKey);
    this.logger.logAt(8, `${this.logPrefix} subscribing to logs for ${key}`);
    if (!this.logUpdates$[key]) {
      this.logUpdates$[key] = new ReplaySubject<ILogsWithSlot>(1);
    }

    const filterParam = key === 'all' ? 'all' : toKey(accountKey);
    const listener = c.onLogs(
      filterParam,
      (info: Logs, ctx: Context) => this.handleLogChange(key, info, ctx),
      commitment
    );
    return listener;
  }

  async unsubscribeFromLogChanges(listener: number, connection?: Connection) {
    const c = connection ?? this.solanaApi.connect();
    await c.removeOnLogsListener(listener);
  }

  subscribeToAccountChanges(
    accounts: SolanaKey[],
    connection?: Connection,
    commitment: Commitment = 'processed',
    callback?: (
      accountId: SolanaKey,
      accountInfo: AccountInfo<Buffer>,
      context: Context,
      connection: SolanaConnection
    ) => void
  ) {
    const c = connection ?? this.solanaApi.connect(commitment, 'update');
    try {
      accounts.forEach((a) => {
        const accountKey = toKeyString(a);
        if (!accountKey) {
          this.logger.logAt(4, `${this.logPrefix} subscribeToAccountChanges: missing account`);
          return;
        }
        this.ensureAccountUpdates(accountKey);
        const key = `${toKeyString(accountKey)}-${c.rpcEndpoint}`;
        c.onAccountChange(
          toKey(a),
          (info, context) => (callback ? callback(a, info, context, c) : this.handleAccountChange(a, info, context, c)),
          commitment
        );
        this.resolvedSubscriptions[key] = true;
      });
    } catch (err) {
      this.logger.logAt(
        4,
        `${this.logPrefix} subscribeToAccountChanges exception for ${c?.rpcEndpoint}`,
        accounts?.map((x) => toKeyString(x))
      );
    }
  }

  resubscribeToAccountChanges() {
    const keys = Object.keys(this.accountUpdates$);
    this.subscribeToAccountChanges(keys);
  }

  private ensureAccountUpdates(accountKey: string) {
    if (!this.accountUpdates$[accountKey]) {
      this.accountUpdates$[accountKey] = new ReplaySubject<ISolanaAccountUpdate>(1);
    }
  }

  private handleAccountChange(
    accountId: SolanaKey,
    accountInfo: AccountInfo<Buffer>,
    context: Context,
    connection: SolanaConnection
  ): void {
    this.updateCache({
      accountId: LazySolanaKey.from(accountId),
      accountInfo,
      slot: context?.slot,
      rpcEndpoint: connection.rpcEndpoint,
    });
  }

  private handleLogChange(key: string, logs: Logs, ctx: Context): void {
    if (!this.logUpdates$[key]) {
      this.logUpdates$[key] = new ReplaySubject<ILogsWithSlot>(1);
    }
    this.logUpdates$[key].next({ ...logs, slot: ctx.slot });
  }

  //   private handleSlotChange(slotInfo: SlotInfo, c: SolanaConnection) {
  //     this.slotChanges$.next(slotInfo);
  //   }

  //   private handleSlotUpdate(slotUpdate: SlotUpdate, c: SolanaConnection) {
  //     this.slotUpdates$.next(slotUpdate);
  //   }

  private addToResolveQueue(accountKeys: SolanaKey[], force = false) {
    const accountsToAdd = accountKeys
      .map((a) => toKeyString(a))
      .filter((a) => this.resolveQueue.indexOf(a) === -1 && (force || !this.resolvedAccounts[a]));
    this.resolveQueue.push(...accountsToAdd);
  }

  private addToSubscribeQueue(account: SolanaKey, connection?: SolanaConnection) {
    const c = connection ?? this.solanaApi.connect();
    const key = `${toKeyString(account)}-${c.rpcEndpoint}`;
    if (this.resolvedSubscriptions[key] || this.subscriptionQueue[key]) {
      return;
    }
    this.subscriptionQueue[key] = { account, connection: c };
  }

  private updateCache(u: ISolanaAccountUpdate) {
    const key = toKeyString(u.accountId);
    this.ensureAccountUpdates(key);

    const slot = Number(u.slot);

    if (!slot) {
      return;
    }

    if (this.accountUpdatesMaxSlots[key] && this.accountUpdatesMaxSlots[key] >= slot) {
      return;
    }
    this.accountUpdatesMaxSlots[key] = slot;

    this.resolvedAccounts[key] = true;
    this.accountUpdates$[key].next(u);
  }
}
