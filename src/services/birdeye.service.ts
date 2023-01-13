import { IBirdeyeToken, IBirdeyeTokenListResponse, IBirdeyeTopBottomTokens } from '../interfaces/birdeye';
import { BaseHttpService } from './base-http.service';
import { BaseLoggerService } from './base-logger.service';

export class BirdeyeService {
  readonly apiRoot = 'https://public-api.birdeye.so';

  constructor(protected readonly logger: BaseLoggerService, protected readonly http: BaseHttpService) {}

  /** Selected top and bottom tokens from Birdeye with mcap filter */
  async getTopBottomTokens(minMcap = 100000, maxMcap = 100000000000, limit = 5): Promise<IBirdeyeTopBottomTokens> {
    let [top, bottom] = await Promise.all([
      this.getTokenList('v24hChangePercent', 'desc'),
      this.getTokenList('v24hChangePercent', 'asc'),
    ]);

    if (top) {
      top = top.filter((x) => x.mc && x.mc > minMcap && x.mc < maxMcap).slice(0, limit);
    }
    if (bottom) {
      bottom = bottom.filter((x) => x.mc && x.mc > minMcap && x.mc < maxMcap).slice(0, limit);
    }
    return { top: top ?? [], bottom: [] };
  }

  async getTokenList(
    sortBy: 'v24hChangePercent' | string = 'v24hChangePercent',
    sortType: 'asc' | 'desc' = 'desc',
    offset = 0,
    limit = 50
  ): Promise<IBirdeyeToken[] | null> {
    const url = `${this.apiRoot}/public/tokenlist?sort_by=${sortBy}&sort_type=${sortType}&offset=${offset}&limit=${limit}`;
    const response = await this.http.get<IBirdeyeTokenListResponse>(url);
    return response?.data?.data?.tokens;
  }
}
