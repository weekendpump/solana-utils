export interface ISolScanListResponse<T> {
  data: T[];
  total: number;
}

export interface ISolScanTokenHolders {
  address: string;
  amount: number;
  decimals: number;
  owner: string;
  rank: number;
}
