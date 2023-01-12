export interface IBirdeyeTokenListResponse {
  data: IBirdeyeTokenList;
  success: boolean;
}

export interface IBirdeyeTokenList {
  updateUnixTime: number;
  updateTime: Date;
  tokens: IBirdeyeToken[];
  total: number;
}

export interface IBirdeyeToken {
  symbol: null | string;
  name: null | string;
  logoURI: null | string;
  mc: number | null;
  v24hUSD: number;
  v24hChangePercent: number;
  address: string;
  decimals: number;
}
