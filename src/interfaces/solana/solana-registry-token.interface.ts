import { TokenInfo } from '@solana/spl-token-registry';

export interface ISolanaRegistryToken extends TokenInfo {
  metadata?: unknown;
}
