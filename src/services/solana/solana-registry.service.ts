import { TokenInfo, TokenListProvider } from '@solana/spl-token-registry';
import { USDC_MINT } from '../../consts';
import { ISolanaRegistryToken } from '../../interfaces';
import { IMap, SolanaEndpointNetwork } from '../../types';
import { SolanaKey, toKeyString, LazySolanaKey, stringify } from '../../utils';
import { BaseLoggerService } from '../base-logger.service';
import { SolanaApiService } from './solana-api.service';

export class SolanaRegistryService {
  readonly logPrefix = '[SolanaRegistry]';
  tokensByMint: IMap<IMap<ISolanaRegistryToken>> = {};
  tokensBySymbol: IMap<IMap<ISolanaRegistryToken[]>> = {};
  private isInitialized = false;

  constructor(protected readonly logger: BaseLoggerService, protected readonly solanaApi: SolanaApiService) {}

  async init(force = false): Promise<boolean> {
    if (this.isInitialized && !force) {
      return false;
    }
    this.isInitialized = true;
    await this.generateLibTokenMaps();
    return true;
  }

  async resolveMints(
    mints: SolanaKey[],
    env: SolanaEndpointNetwork = 'mainnet-beta'
  ): Promise<IMap<ISolanaRegistryToken>> {
    const results: IMap<ISolanaRegistryToken> = {};

    for (const m of mints) {
      const token = this.findByMint(m, env);
      if (token) {
        results[toKeyString(m)] = token;
      }
    }

    /** TODO: resolve new metaplex metadata */

    return results;
  }

  async getAllRegisteredTokens(env: SolanaEndpointNetwork = 'mainnet-beta'): Promise<IMap<ISolanaRegistryToken>> {
    return Promise.resolve(this.tokensByMint[env]);
  }

  findBySymbolMint(
    symbolMint: SolanaKey,
    env: SolanaEndpointNetwork = 'mainnet-beta',
    toUpperCase = false
  ): ISolanaRegistryToken | null {
    const symbolMintString = toKeyString(symbolMint);
    if (symbolMintString.length === 0) {
      return null;
    }
    if (symbolMintString.length < 10) {
      return this.findBySymbol(symbolMintString, env, toUpperCase);
    }
    return this.findByMint(symbolMintString);
  }

  findByMint(mint: SolanaKey, env: SolanaEndpointNetwork = 'mainnet-beta'): ISolanaRegistryToken | null {
    const mintString = toKeyString(mint);
    const envTokens = this.tokensByMint[env];
    if (!envTokens) {
      return null;
    }
    return envTokens[mintString];
  }

  findBySymbol(
    symbol: string,
    env: SolanaEndpointNetwork = 'mainnet-beta',
    toUpperCase = false,
    index = 0
  ): ISolanaRegistryToken | null {
    const envTokens = this.tokensBySymbol[env];
    if (!envTokens || !symbol) {
      return null;
    }
    const key = toUpperCase ? symbol.toUpperCase() : symbol;
    if (!envTokens[key]) {
      this.logger.logAt(
        4,
        `${this.logPrefix} findBySymbol for ${symbol}, env: ${env}, toUpper: ${toUpperCase} not found`
      );
      return null;
    }
    return envTokens[key][index];
  }

  symbolByMint(mint: SolanaKey, env: SolanaEndpointNetwork = 'mainnet-beta'): string {
    const token = this.findByMint(mint, env);
    return token ? token.symbol : '';
  }

  nameByMint(mint: SolanaKey, env: SolanaEndpointNetwork = 'mainnet-beta'): string {
    const token = this.findByMint(mint, env);
    return token ? token.name : '';
  }

  /** find mint by symbol or mint */
  mintBySymbol(symbolMint: SolanaKey, env: SolanaEndpointNetwork = 'mainnet-beta', fill = true): LazySolanaKey | null {
    if (typeof symbolMint !== 'string' || symbolMint.length > 20) {
      return LazySolanaKey.from(symbolMint, fill);
    }
    const token = this.findBySymbolMint(symbolMint, env);
    return token ? LazySolanaKey.from(token.address) : null;
  }

  decimalsByMint(mint: SolanaKey, env: SolanaEndpointNetwork = 'mainnet-beta'): number {
    const token = this.findByMint(mint, env);
    return token ? token.decimals : -1;
  }

  decimalsBySymbol(symbol: string, env: SolanaEndpointNetwork = 'mainnet-beta'): number {
    const token = this.findBySymbol(symbol, env);
    return token ? token.decimals : -1;
  }

  private async generateLibTokenMaps(env: SolanaEndpointNetwork = 'mainnet-beta') {
    const tokens = await new TokenListProvider().resolve();
    const tokenList = tokens.filterByClusterSlug(env).getList();
    this.processOverrides(tokenList);
    this.logger.logAt(5, `${this.logPrefix} generateLibTokenMaps importing ${tokenList.length} tokens from library`);
    this.addTokens(tokenList, env);
  }

  /** TODO: improve overrides to ensure all core mints are returned correctly */
  private processOverrides(tokenList: TokenInfo[]) {
    const wusdc = tokenList.filter((x) => x.symbol === 'USDC' && x.address !== USDC_MINT);
    wusdc.forEach((w) => {
      const token = w as any;
      token.symbol = 'WUSDC';
    });

    const wusdt = tokenList.filter((x) => x.symbol === 'USDC' && x.address !== USDC_MINT);
    wusdt.forEach((w) => {
      const token = w as any;
      token.symbol = 'WUSDT';
    });
  }

  addTokens(tokens: ISolanaRegistryToken[], env: SolanaEndpointNetwork = 'mainnet-beta') {
    if (!this.tokensByMint[env]) {
      this.tokensByMint[env] = {};
    }
    if (!this.tokensBySymbol[env]) {
      this.tokensBySymbol[env] = {};
    }
    this.logger.logAt(8, `${this.logPrefix} Adding ${tokens.length} new tokens for ${env}`);

    tokens.forEach((token) => {
      if (this.tokensByMint[env][token.address]) {
        this.logger.logAt(
          7,
          `${this.logPrefix} Warning: multiple tokens with the same mint found!`,
          stringify({ previous: this.tokensByMint[env][token.address], new: token })
        );
      }
      this.tokensByMint[env][token.address] = token;
      if (!this.tokensBySymbol[env][token.symbol]) {
        this.tokensBySymbol[env][token.symbol] = [];
      }
      this.tokensBySymbol[env][token.symbol].push(token);
    });
  }
}
