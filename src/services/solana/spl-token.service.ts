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
  MintLayout,
  MINT_SIZE,
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

export class SplTokenService {
  readonly logPrefix = '[SplToken]';
  readonly cachedMints: IMap<Promise<IMintInfo>> = {};
  cacheInitialized = false;
  readonly tokenProgramId: LazySolanaKey;
  readonly associatedTokenProgramId: LazySolanaKey;

  constructor(protected readonly logger: BaseLoggerService, protected readonly solanaApi: SolanaApiService) {
    this.tokenProgramId = LazySolanaKey.from(TOKEN_PROGRAM_ID, true);
    this.associatedTokenProgramId = LazySolanaKey.from(ASSOCIATED_TOKEN_PROGRAM_ID, true);
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
      5,
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
      const accountInfo = AccountLayout.decode(buf);
      const amountString = accountInfo.amount.toString();
      let amountNumber = 0;
      if (decimals >= 0) {
        const multiplier = Math.pow(10, decimals);
        amountNumber = Number(accountInfo.amount) / multiplier;
      }
      return { ...accountInfo, id, amountString, amountNumber, decimals };
    } catch (err) {
      this.logger.logAt(7, `Error parsing token account ${toKeyString(id)}`, err);
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
    this.logger.logAt(5, `${this.logPrefix} createApproveInstruction`, account, delegate, owner, amount?.toString());
    const instruction = createApproveInstruction(toKey(account), toKey(delegate), toKey(owner), amount);
    return instruction;
  }

  createCloseIx(account: SolanaKey, destination: SolanaKey, authority: SolanaKey): TransactionInstruction {
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

  async ensureAtaIxs(owner: SolanaKey, mints: SolanaKey[], payer?: SolanaKey): Promise<TransactionInstruction[]> {
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
    const accountMap = await this.solanaApi.getMultipleAccounts(Object.values(atas));

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
      5,
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