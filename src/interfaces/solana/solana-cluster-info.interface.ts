import { ContactInfo } from '@solana/web3.js';

export interface ISolanaClusterInfo extends ContactInfo {
  stake: number;
}
