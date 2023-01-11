export type SolanaEndpointNetwork = 'mainnet-beta' | 'testnet' | 'devnet' | 'localnet';

/** Set of endpoint configs divided by network type */
export type SolanaEndpointsConfig = {
  [key in SolanaEndpointNetwork]: SolanaEndpointConfig[];
};

export type SolanaEndpointDefinition = { [key in SolanaEndpointNetwork]: (string | [string, number])[] };

/** Internal config describing everything related to an endpoint */
export type SolanaEndpointConfig = SolanaEndpointConfigExtraOptions & {
  url: string;
  /** if different from url, specify websocket address */
  wsUrl?: string;
  network: SolanaEndpointNetwork;
  /** maximum number of accounts to retrieve in one request */
  maxAccounts?: number;
};

export type SolanaEndpointConfigExtraOptions = {
  /** Is this a premium node or public */
  isPaid?: boolean;

  /** Extra credentials to use, probably stored separately */
  credentials?: string;

  /** Minimum delay between requests */
  minRequestDelay?: number;

  /** Lower is better. Average speed, used when selecting for fastest/slowest nodes. */
  speedIndex?: number;

  /** Lower is better. Average delay from the fastest server in terms of latest blockhash */
  blockhashIndex?: number;

  /** can subscribe to program logs and parse events */
  logsEnabled?: boolean;

  /** can bundle multiple requests */
  batchEnabled?: boolean;

  /** big data enabled, can retrieve old blocks and transactions */
  hasLongHistory?: boolean;

  txBatchSize?: number;

  /** various tags allowing grouping and quick selection */
  tags?: string[];
};
