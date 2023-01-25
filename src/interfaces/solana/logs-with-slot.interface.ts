import { Logs } from '@solana/web3.js';

export interface ILogsWithSlot extends Logs {
  slot: number;
}
