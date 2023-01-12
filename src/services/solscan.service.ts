import { ISolScanListResponse, ISolScanTokenHolders } from '../interfaces';
import { IMap } from '../types';
import { SolanaKey, toKeyString } from '../utils';
import { BaseHttpService } from './base-http.service';
import { BaseLoggerService } from './base-logger.service';

/** Default Limit: 150 requests/ 30 seconds, 100k requests / day */
export class SolscanService {
  readonly apiRoot = 'https://public-api.solscan.io';
  tokenHoldersCache: IMap<ISolScanTokenHolders[]> = {};

  constructor(protected readonly logger: BaseLoggerService, protected readonly http: BaseHttpService) {}

  async getTokenHolders(tokenKey: SolanaKey, offset = 0, limit = 10): Promise<ISolScanTokenHolders[]> {
    // TODO: re-enable when working again or find a better way
    return [];
    const key = toKeyString(`${toKeyString(tokenKey)}_${offset}_${limit}`);
    if (this.tokenHoldersCache[key]) {
      return this.tokenHoldersCache[key];
    }

    const url = `${this.apiRoot}/token/holders?tokenAddress=${toKeyString(tokenKey)}&offset=${offset}&limit=${limit}`;
    const response = await this.http.get<ISolScanListResponse<ISolScanTokenHolders>>(url);
    this.tokenHoldersCache[key] = response?.data?.data;

    return this.tokenHoldersCache[key];
  }
}
