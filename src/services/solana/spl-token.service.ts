import { u64 } from '@solana/buffer-layout-utils';
import { BufferOrParsedAccount, IMap, SolanaConnection } from '../../types';
import { LazySolanaKey, SolanaKey, stringify, toKey, toKeyString } from '../../utils';
import { BaseLoggerService } from '../base-logger.service';
import { SolanaApiService } from './solana-api.service';
import {
  AccountLayout,
  createApproveInstruction,
  createAssociatedTokenAccountInstruction,
  createCloseAccountInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  createTransferCheckedInstruction,
  createBurnInstruction,
  MintLayout,
  MINT_SIZE,
  createRevokeInstruction,
} from '@solana/spl-token';
import {
  AccountInfo,
  ParsedAccountData,
  PublicKey,
  Signer,
  TokenAccountBalancePair,
  TokenAmount,
  TransactionInstruction,
} from '@solana/web3.js';
import { IMintInfo, ITokenAccountInfo, ITokenAccountMini } from '../../interfaces';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from '../../consts';
import { SolanaUpdateService } from './solana-update.service';
import { combineLatest, filter, map, Observable, shareReplay } from 'rxjs';
import { BN } from '@coral-xyz/anchor';

export class SplTokenService {
  readonly logPrefix = '[SplToken]';
  readonly cachedMints: IMap<IMintInfo> = {};
  readonly tokenProgramId: LazySolanaKey;
  readonly associatedTokenProgramId: LazySolanaKey;

  constructor(
    protected readonly logger: BaseLoggerService,
    protected readonly solanaApi: SolanaApiService,
    protected readonly solanaUpdate: SolanaUpdateService
  ) {
    this.tokenProgramId = LazySolanaKey.from(TOKEN_PROGRAM_ID, true);
    this.associatedTokenProgramId = LazySolanaKey.from(ASSOCIATED_TOKEN_PROGRAM_ID, true);
  }

  /** Returns token balance stream without decimals */
  getTokenBalance$(accountId: SolanaKey, getInitial = true, skipEmpty = true): Observable<bigint> {
    const update$ = this.solanaUpdate.safeAccountUpdate(accountId, undefined, true, getInitial);
    return update$.pipe(
      filter((u) => Boolean(u?.accountInfo?.data) || !skipEmpty),
      map((u) => {
        if (!u) {
          return BigInt(-1);
        }
        const account = u.accountInfo ? this.toAccountInfoMini(u.accountInfo.data) : null;
        return account?.amount ?? BigInt(-1);
      }),
      shareReplay(1)
    );
  }

  getTokenBalanceRawStream(accountId: SolanaKey, getInitial = true, skipEmpty = true): Observable<BN> {
    const update$ = this.solanaUpdate.safeAccountUpdate(accountId, undefined, true, getInitial);
    return update$.pipe(
      filter((u) => !skipEmpty || Boolean(u)),
      map((u) => {
        if (!u || !u.accountInfo) {
          return new BN(0);
        }
        const account = this.toAccountInfo(u.accountInfo);
        if (!account) {
          return new BN(0);
        }
        return new BN(account.amountString);
      }),
      shareReplay(1)
    );
  }

  getTokenBalanceStream(accountId: SolanaKey, mintId: SolanaKey, getInitial = true): Observable<number | null> {
    this.logger.logAt(
      7,
      `${this.logPrefix} Getting token balance stream for ${toKeyString(accountId)} and mint ${toKeyString(mintId)}`
    );
    const account$ = this.solanaUpdate.safeAccountUpdate(accountId, undefined, true, getInitial);
    const mint$ = this.solanaUpdate.safeAccountUpdate(mintId, undefined, false, getInitial);
    return combineLatest([account$, mint$]).pipe(
      map(([a, b]) => {
        if (!a?.accountInfo || !b?.accountInfo) {
          return null;
        }
        const account = this.toAccountInfo(a.accountInfo);
        const mint = this.toMintInfo(b.accountInfo);
        if (!account || !mint) {
          this.logger.logAt(
            4,
            `${this.logPrefix} Missing mint/account in balance stream.
            Account: ${JSON.stringify(a)}
            Mint: ${toKeyString(mintId)}`
          );
          return null;
        }
        const precision = Math.pow(10, mint?.decimals || 0);
        // const balance = account.amount.toNumber() / precision;
        const balance = Number(account.amountString) / precision;
        return balance;
      }),
      shareReplay(1)
    );
  }

  getTokenMintStream(mintId: SolanaKey): Observable<IMintInfo | null> {
    return this.solanaUpdate.safeAccountUpdate(mintId).pipe(
      map((a) => (a.accountInfo ? this.toMintInfo(a.accountInfo) : null))
      // shareReplay(1)
    );
  }

  getTokenSupplyStream(mintId: SolanaKey): Observable<number | null> {
    this.logger.logAt(5, `${this.logPrefix} Getting supply stream for ${toKeyString(mintId)}`);
    return this.getTokenMintStream(mintId).pipe(
      map((mint) => {
        if (!mint) {
          return null;
        }
        const precision = Math.pow(10, mint.decimals || 0);
        const supply = Number(mint.supplyString) / precision;
        return supply;
      })
    );
  }

  async getMint(mint: SolanaKey, force = false, cacheOnly = false): Promise<IMintInfo | null> {
    const mintKey = toKeyString(mint);
    if (!force && this.cachedMints[mintKey]) {
      return this.cachedMints[mintKey];
    }

    if (cacheOnly) {
      return null;
    }

    const mintAccount = await this.solanaApi.getAccount(mint);
    if (!mintAccount || !mintAccount.accountInfo) {
      return null;
    }
    const mintInfo = this.toMintInfo(mintAccount.accountInfo, mintAccount.accountId);
    if (!mintInfo) {
      return null;
    }
    this.cachedMints[mintKey] = mintInfo;
    return mintInfo;
  }

  async getMultipleMintAccounts(
    keys: SolanaKey[],
    force = false,
    connection?: SolanaConnection
  ): Promise<IMap<IMintInfo>> {
    const cachedMintsAll = await Promise.all(keys.map((x) => this.getMint(x, force, true)));
    const cachedMints = cachedMintsAll.filter((x) => Boolean(x));
    const result: IMap<IMintInfo> = {};
    for (const m of cachedMints) {
      if (m) {
        result[m.id] = m;
      }
    }

    const keysNeeded = keys.filter((x) => !result[toKeyString(x)]);
    if (keysNeeded.length) {
      this.logger.logAt(8, `${this.logPrefix} Got ${keysNeeded.length} extra mints to resolve`, stringify(keysNeeded));
      const accounts = await this.solanaApi.getMultipleAccounts(keysNeeded, connection, 99, 300);

      Object.values(accounts).forEach((a) => {
        if (!a || !a.accountInfo) {
          return;
        }
        const info = this.toMintInfo(a.accountInfo, a.accountId);
        if (info) {
          result[info.id] = info;
          this.cachedMints[info.id] = info;
        }
      });
    }

    return result;
  }

  async getMultipleTokenAccounts(keys: SolanaKey[], connection?: SolanaConnection): Promise<ITokenAccountInfo[]> {
    const accounts = await this.solanaApi.getMultipleAccounts(keys, connection);
    const result: ITokenAccountInfo[] = [];
    Object.values(accounts).forEach((a) => {
      if (!a || !a.accountInfo) {
        return;
      }
      const info = this.toAccountInfo(a.accountInfo, a.accountId);
      if (info) {
        result.push(info);
      }
    });
    return result;
  }

  /** Gets a map of owner tokens by mint with account keys as values */
  async getOwnerTokenMap(ownerKey: SolanaKey, connection?: SolanaConnection): Promise<IMap<string>> {
    const result: IMap<string> = {};
    this.logger.logAt(
      8,
      `${this.logPrefix} getOwnerTokenMap`,
      stringify({ ownerKey, rpcEndpoint: connection?.rpcEndpoint })
    );
    const accounts = await this.getOwnerTokens(ownerKey, connection);
    for (const key of Object.keys(accounts)) {
      const mint = accounts[key]?.data?.parsed?.info?.mint?.toString();
      result[mint] = key;
    }
    return result;
  }

  async getOwnerTokens(
    ownerKey: SolanaKey,
    connection?: SolanaConnection
  ): Promise<IMap<AccountInfo<ParsedAccountData>>> {
    const c = connection ?? this.solanaApi.connect('processed', 'tokens');
    const filter = { programId: TOKEN_PROGRAM_ID };
    const tokenAccounts = await c.getParsedTokenAccountsByOwner(toKey(ownerKey), filter);
    if (!tokenAccounts) {
      return {};
    }
    const result: IMap<AccountInfo<ParsedAccountData>> = {};
    tokenAccounts.value.forEach((tk) => {
      result[tk.pubkey.toBase58()] = tk.account;
    });
    return result;
  }

  async getTokenBalances(ownerKey: SolanaKey, connection?: SolanaConnection): Promise<IMap<ITokenAccountInfo>> {
    const c = connection ?? this.solanaApi.connect();
    const result: { [key: string]: ITokenAccountInfo } = {};
    if (!ownerKey) {
      return result;
    }
    const accountsResponse = await c.getTokenAccountsByOwner(toKey(ownerKey), {
      programId: this.tokenProgramId.key,
    });

    for (const a of accountsResponse.value) {
      const decoded = this.toAccountInfoFromBuffer(a.account.data, a.pubkey);
      if (decoded) {
        result[toKeyString(decoded.mint)] = decoded;
      }
    }
    return result;
  }

  async getUserTokensByMints(
    ownerKey: SolanaKey,
    mintKeys: SolanaKey[],
    connection?: SolanaConnection
  ): Promise<IMap<ITokenAccountInfo> | null> {
    if (!ownerKey || !mintKeys) {
      this.logger.logAt(
        4,
        `${this.logPrefix} getUserTokensByMints: missing ownerKey(${toKeyString(ownerKey)}) or mintKeys(${mintKeys})`
      );
      return null;
    }
    const addresses = this.getUserTokenAddressesByMints(ownerKey, mintKeys);
    if (!addresses) {
      return null;
    }
    const accounts = await this.getMultipleTokenAccounts(Object.values(addresses), connection);
    const result: IMap<ITokenAccountInfo> = {};
    for (const acc of accounts) {
      if (!acc) {
        this.logger.logAt(4, `${this.logPrefix} getUserTokensByMints: missing account in array`);
        continue;
      }
      const key = toKeyString(acc.mint);
      result[key] = acc;
    }
    return result;
  }

  async fetchTokenBalance(tokenKey: SolanaKey, connection?: SolanaConnection): Promise<TokenAmount> {
    const token = tokenKey instanceof PublicKey ? tokenKey : new PublicKey(tokenKey);
    const c = connection ?? this.solanaApi.connect();
    const balance = await c.getTokenAccountBalance(token);
    this.logger.logAt(9, 'fetching balance for', token.toBase58(), balance?.value.uiAmount);
    return balance?.value;
  }

  async fetchTokenSupply(mintKey: SolanaKey, connection?: SolanaConnection): Promise<TokenAmount> {
    const mint = toKey(mintKey);
    const c = connection ?? this.solanaApi.connect();
    const balance = await c.getTokenSupply(mint);
    this.logger.logAt(9, 'fetching supply for', toKeyString(mintKey), balance?.value.uiAmount);
    return balance?.value;
  }

  toMintInfo(info: AccountInfo<BufferOrParsedAccount>, mintKey: SolanaKey = ''): IMintInfo | null {
    if (info === null) {
      throw new Error('Failed to find mint account');
    }
    if (!Buffer.isBuffer(info.data)) {
      throw new Error('Got parsed account data already');
    }

    const mintInfo = this.toMintInfoFromBuffer(info.data, info.owner, mintKey);
    return mintInfo;
  }

  toMintInfoFromBuffer(buf: Buffer, owner: SolanaKey, mintKey: SolanaKey = ''): IMintInfo | null {
    if (buf.length !== MintLayout.span) {
      this.logger.logAt(7, `Invalid mint size`, toKeyString(mintKey), buf.length, MintLayout.span);
      return null;
    }

    const data = Buffer.from(buf);
    const mintInfo = MintLayout.decode(data) as IMintInfo;
    mintInfo.owner = owner;
    mintInfo.id = toKeyString(mintKey);
    mintInfo.supplyString = mintInfo.supply.toString();
    return mintInfo;
  }

  toAccountInfo(info: AccountInfo<BufferOrParsedAccount>, tokenKey: SolanaKey = ''): ITokenAccountInfo | null {
    if (info === null || !info.data) {
      this.logger.logAt(4, `Account data missing for ${toKeyString(tokenKey)}`);
      return null;
    }

    if (!Buffer.isBuffer(info.data)) {
      this.logger.logAt(4, `Got parsed account data already for ${toKeyString(tokenKey)}`);
      return null;
    }

    const tokenInfo = this.toAccountInfoFromBuffer(info.data, tokenKey);
    return tokenInfo;
  }

  /**
   * TODO: fix the whole decimals mess
   * @param decimals -1 -> unresolved
   */
  toAccountInfoFromBuffer(buf: Buffer, id: SolanaKey = '', decimals = -1): ITokenAccountInfo | null {
    try {
      if (buf?.length !== AccountLayout.span) {
        this.logger.logAt(4, `toAccountInfoFromBuffer: invalid account data for ${toKeyString(id)}`);
        return null;
      }
      const accountInfo = AccountLayout.decode(buf);
      const amountString = accountInfo.amount.toString();
      let amountNumber = 0;
      if (decimals >= 0) {
        const multiplier = Math.pow(10, decimals);
        amountNumber = Number(accountInfo.amount) / multiplier;
      }
      return { ...accountInfo, id, amountString, amountNumber, decimals };
    } catch (err) {
      this.logger.logAt(4, `Error parsing token account ${toKeyString(id)}`, err);
      return null;
    }
  }

  toAccountInfoMini(buf: Buffer, id: SolanaKey = ''): ITokenAccountMini | null {
    try {
      const amountOffset = 64;
      if (!buf || buf.length < amountOffset) {
        return null;
      }
      const amount = u64().decode(buf, amountOffset);
      const mint = LazySolanaKey.from(buf.subarray(0, 32), false);
      return { id, amount, mint };
    } catch (err) {
      this.logger.logAt(
        4,
        `${this.logPrefix} toAccountInfoMini: Exception parsing token account ${toKeyString(id)}`,
        err
      );
      return null;
    }
  }

  /** create transfer ix, resolving ATAs for sender and receiver  */
  createTransferIx(
    sender: SolanaKey,
    mint: SolanaKey,
    receiver: SolanaKey,
    decimals: number,
    amount: number | bigint
  ): TransactionInstruction | null {
    const source = this.getATA(sender, mint);
    const destination = this.getATA(receiver, mint);
    this.logger.logAt(
      8,
      `${this.logPrefix} createTransferIx`,
      stringify({ sender, source, receiver, destination, mint, amount, decimals })
    );
    if (!source || !destination || decimals < 0 || amount <= 0) {
      this.logger.logAt(4, `${this.logPrefix} createTransferIx: invalid arguments`);
      return null;
    }

    const instruction = createTransferCheckedInstruction(
      toKey(source),
      toKey(mint),
      toKey(destination),
      toKey(sender),
      amount,
      decimals
    );
    return instruction;
  }

  async createBurnIx(
    account: SolanaKey,
    mint: SolanaKey,
    owner: SolanaKey,
    amount: number | bigint
  ): Promise<TransactionInstruction> {
    const burnIx = createBurnInstruction(toKey(account), toKey(mint), toKey(owner), amount);
    return burnIx;
  }

  async createInitMintIxs(
    mint: SolanaKey,
    decimals: number,
    mintAuthority: SolanaKey,
    freezeAuthority?: SolanaKey,
    signer?: Signer
  ): Promise<TransactionInstruction[]> {
    const result: TransactionInstruction[] = [];
    if (signer) {
      const initAccount = await this.solanaApi.createAccountIx(mintAuthority, TOKEN_PROGRAM_ID, MINT_SIZE, signer);
      result.push(initAccount[0]);
    }

    const initMintIx = createInitializeMint2Instruction(
      toKey(mint),
      decimals,
      toKey(mintAuthority),
      freezeAuthority ? toKey(freezeAuthority) : null
    );
    result.push(initMintIx);
    return result;
  }

  createMintToIxs(
    mint: SolanaKey,
    destination: SolanaKey,
    mintAuthority: SolanaKey,
    amount: number | bigint
  ): TransactionInstruction[] {
    const ix = createMintToInstruction(toKey(mint), toKey(destination), toKey(mintAuthority), amount);
    return [ix];
  }

  createApproveIx(account: SolanaKey, delegate: SolanaKey, owner: SolanaKey, amount: number | bigint) {
    this.logger.logAt(
      8,
      `${this.logPrefix} createApproveInstruction`,
      stringify({ account, delegate, owner, amount: amount?.toString() })
    );
    const instruction = createApproveInstruction(toKey(account), toKey(delegate), toKey(owner), amount);
    return instruction;
  }

  createRevokeIx(account: SolanaKey, owner: SolanaKey) {
    this.logger.logAt(8, `${this.logPrefix} createRevokeInstruction`, stringify({ account, owner }));
    const instruction = createRevokeInstruction(toKey(account), toKey(owner));
    return instruction;
  }

  createCloseIx(account: SolanaKey, authority: SolanaKey, destination?: SolanaKey): TransactionInstruction {
    if (!destination) {
      destination = authority;
    }
    return createCloseAccountInstruction(toKey(account), toKey(destination), toKey(authority));
  }

  createATAIx(owner: SolanaKey, mint: SolanaKey, payer?: SolanaKey): TransactionInstruction | null {
    const ataId = this.getATA(owner, mint);
    if (!ataId) {
      this.logger.logAt(4, `${this.logPrefix} createATAIx: cannot get ATA for mint ${toKeyString(mint)}`);
      return null;
    }
    if (!payer) {
      payer = owner;
    }
    const ix = createAssociatedTokenAccountInstruction(toKey(payer), toKey(ataId), toKey(owner), toKey(mint));
    return ix;
  }

  async ensureAtaIxs(
    owner: SolanaKey,
    mints: SolanaKey[],
    payer?: SolanaKey,
    connection?: SolanaConnection
  ): Promise<TransactionInstruction[]> {
    const c = connection ?? this.solanaApi.connect();
    if (!payer) {
      payer = owner;
    }

    const atas: IMap<string> = {};
    for (const m of mints) {
      const ata = this.getATA(owner, m);
      if (ata) {
        atas[toKeyString(m)] = toKeyString(ata);
      }
    }
    const accountMap = await this.solanaApi.getMultipleAccounts(Object.values(atas), c);

    const createATAIxs: TransactionInstruction[] = [];
    for (const m of Object.keys(atas)) {
      const ata = atas[m];
      if (!accountMap[ata]) {
        const ix = this.createATAIx(owner, m);
        if (ix) {
          createATAIxs.push(ix);
        }
      }
    }

    this.logger.logAt(
      8,
      `${this.logPrefix} ensureAtaIxs: returning ${createATAIxs?.length} ixs`,
      stringify({ owner, mints, payer })
    );
    return createATAIxs;
  }

  async getTokenLargestAccounts(mintKey: SolanaKey, connection?: SolanaConnection): Promise<TokenAccountBalancePair[]> {
    const c = connection ?? this.solanaApi.connect();
    const results = await c.getTokenLargestAccounts(toKey(mintKey));
    return results ? results.value : [];
  }

  /** Wrapper around getAssociatedTokenAddress to make calls shorter */
  getATA(owner: SolanaKey, mint: SolanaKey): SolanaKey | null {
    const tokenAddress = this.getAssociatedTokenAddress(owner, mint);
    return tokenAddress ? tokenAddress[0] : null;
  }

  getAssociatedTokenAddress(owner: SolanaKey, mint: SolanaKey): [SolanaKey, number] | null {
    if (!owner || !mint) {
      this.logger.logAt(
        4,
        `${this.logPrefix} getAssociatedTokenAddress: missing owner ${toKeyString(owner)} or mint ${toKeyString(
          mint
        )} for associated address.`
      );
      return null;
    }

    const walletKey = toKey(owner);
    const result = PublicKey.findProgramAddressSync(
      [walletKey.toBuffer(), this.tokenProgramId.key.toBuffer(), toKey(mint).toBuffer()],
      this.associatedTokenProgramId.key
    );
    return [toKeyString(result[0]), result[1]];
  }

  getUserTokenAddressesByMints(ownerKey: SolanaKey, mintKeys: SolanaKey[]): IMap<SolanaKey> | null {
    if (!ownerKey || !mintKeys) {
      this.logger.logAt(
        4,
        `${this.logPrefix} getUserTokenAddressesByMints: missing ownerKey(${toKeyString(
          ownerKey
        )}) or mintKeys(${mintKeys})`
      );
      return null;
    }
    const result: IMap<SolanaKey> = {};
    for (const mint of mintKeys) {
      if (!mint) {
        this.logger.logAt(4, `${this.logPrefix} getUserTokenAddressesByMints: empty mintKey in array`);
        continue;
      }
      const ata = this.getATA(ownerKey, mint);
      if (ata) {
        result[toKeyString(mint)] = ata;
      }
    }
    return result;
  }
}
