import { ISolanaRecentHash } from '../interfaces';
import { IMap } from '../types';
import { sleep, stringify } from '../utils';
import { BaseLoggerService } from './base-logger.service';
import { SolanaApiService } from './solana-api.service';

/** Resolve recent block hashes */
export class SolanaHashService {
  recentHashes: ISolanaRecentHash[] = [];
  hashHistory: IMap<ISolanaRecentHash> = {};
  readonly logPrefix = '[SolanaHash]';

  private isInitialized = false;
  private isActive = false;
  private readonly loopDelayMs = 10000;
  private readonly fastDelayMs = 2000;
  private readonly fastDelaySize = 2;
  private readonly maxSize = 100;

  constructor(protected readonly logger: BaseLoggerService, protected readonly solanaApi: SolanaApiService) {}

  async init(): Promise<boolean> {
    if (this.isInitialized) {
      // this.logger.logAt(6, `${this.logPrefix} already initialized`);
      return false;
    }
    this.logger.logAt(7, `${this.logPrefix} initialized`);
    this.isInitialized = true;
    this.isActive = true;
    this.addHashLoop();
    return true;
  }

  async setLoopState(state: boolean) {
    const needsRestart = !this.isActive && state;
    this.isActive = state;
    if (needsRestart) {
      this.addHashLoop();
    }
  }

  async getHashCount(): Promise<number> {
    const count = this.recentHashes.length;
    const firstDate = this.recentHashes[0].added;
    const lastDate = this.recentHashes[count - 1].added;
    this.logger.logAt(
      5,
      `${this.logPrefix} getting hash count: ${count}. From: ${firstDate.toJSON()} to ${lastDate.toJSON()}`
    );
    return Promise.resolve(count);
  }

  async addHashLoop() {
    while (this.isActive) {
      let hash: ISolanaRecentHash | null = null;
      try {
        hash = await this.getHash();
      } catch (error) {
        this.logger.logAt(3, '[SolanaHash] error getting the hash', error);
        continue;
      }
      if (!hash) {
        continue;
      }

      const lastBlockHash = this.recentHashes.length
        ? this.recentHashes[this.recentHashes.length - 1]?.blockhash
        : null;
      if (hash?.blockhash !== lastBlockHash) {
        this.recentHashes.push(hash);
        if (this.recentHashes.length > this.maxSize) {
          this.logger.logAt(
            7,
            `${this.logPrefix} max size reached, removing the oldest element ${JSON.stringify(this.recentHashes[0])}`
          );
          this.recentHashes.shift();
        }
      } else {
        this.logger.logAt(7, `${this.logPrefix} got the same hash as the last one: ${hash}`);
      }
      const delay = this.recentHashes.length > this.fastDelaySize ? this.loopDelayMs : this.fastDelayMs;
      await sleep(delay);
    }
  }

  async peekHash(): Promise<string> {
    if (!this.recentHashes.length) {
      const hash = await this.getHash();
      return hash?.blockhash ?? '';
    }
    const result = this.recentHashes[this.recentHashes.length - 1];
    return result?.blockhash;
  }

  async popHash(retries = 4): Promise<string> {
    const result = this.recentHashes.pop();
    if (result) {
      return result?.blockhash;
    }

    this.logger.logAt(4, `${this.logPrefix} no hashes left to pop, getting a new one`, this.isActive);
    let count = 0;
    while (count++ < retries) {
      const hash = await this.getHash();
      if (hash) {
        return hash?.blockhash;
      } else {
        await sleep(200);
      }
    }
    return '';
  }

  /** Main method to get a quickly expiring hash */
  async popHashFront(minValidBlockHeight: number): Promise<ISolanaRecentHash | null> {
    while (this.recentHashes.length) {
      const current = this.recentHashes.shift();
      if (!current) {
        continue;
      }

      if (current.lastValidBlockHeight >= minValidBlockHeight) {
        this.logger.logAt(
          5,
          `${this.logPrefix} Found hash for ${current?.lastValidBlockHeight} >= ${minValidBlockHeight}`,
          stringify(current)
        );
        return current;
      }
    }
    this.logger.logAt(5, `${this.logPrefix} Could not find a hash for minValidBlockHeight: ${minValidBlockHeight}`);
    return null;
  }

  /** Gets the oldest hash that's still valid at a given slot */
  async popHashFrontBySlot(minSlot: number): Promise<ISolanaRecentHash | null> {
    // this.logger.logAt(5, `${this.logPrefix} popHashFront for ${minSlot}`, stringify(this.recentHashes));
    while (this.recentHashes.length) {
      const current = this.recentHashes.shift();
      if (!current) {
        continue;
      }

      if (current?.slot >= minSlot) {
        this.logger.logAt(5, `${this.logPrefix} Found hash for ${current?.slot} >= ${minSlot}`, stringify(current));
        return current;
      }
    }
    this.logger.logAt(5, `${this.logPrefix} Could not find a hash for minSlot: ${minSlot}`);
    return null;
  }

  private getHashPromise: Promise<ISolanaRecentHash | null> | null = null;

  private async getHash(): Promise<ISolanaRecentHash | null> {
    if (this.getHashPromise) {
      return this.getHashPromise;
    }

    // TODO: use multiple connections
    this.getHashPromise = this.solanaApi.getLatestBlockhash();
    const hash = await this.getHashPromise;
    if (!hash) {
      return null;
    }
    if (!this.hashHistory[hash?.blockhash] && hash?.blockhash) {
      this.hashHistory[hash?.blockhash] = hash;
    }
    this.getHashPromise = null;
    return hash;
  }
}
