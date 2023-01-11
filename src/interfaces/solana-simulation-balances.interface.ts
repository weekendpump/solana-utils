import { SimulatedTransactionResponse } from '@solana/web3.js';
import { IMap } from '../types';
import { ISolanaTokenChange } from './solana-token-change.interface';
import { ITokenAccountInfo } from './token-account-info.interface';

// Omit<SimulatedTransactionResponse, 'accounts'>
export interface ISolanaSimulationBalances extends SimulatedTransactionResponse {
  balances?: IMap<ITokenAccountInfo>;
  changes?: IMap<ISolanaTokenChange>;
  errorCode?: 'ProgramFailedToComplete' | string | number;
}
