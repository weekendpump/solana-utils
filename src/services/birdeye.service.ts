import { IBirdeyeToken, IBirdeyeTokenListResponse } from '../interfaces/birdeye';
import { BaseHttpService } from './base-http.service';
import { BaseLoggerService } from './base-logger.service';

export class BirdeyeService {
  readonly apiRoot = 'https://public-api.birdeye.so';

  constructor(protected readonly logger: BaseLoggerService, protected readonly http: BaseHttpService) {}

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
