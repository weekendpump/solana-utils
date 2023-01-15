import { Commitment, Connection, ConnectionConfig } from '@solana/web3.js';
import { SOLANA_ENDPOINTS_CONFIG } from '../../consts';
import { IMap, SolanaConnection, SolanaEndpointConfig, SolanaEndpointNetwork, SolanaRpcTag } from '../../types';
import { BaseLoggerService } from '../base-logger.service';

/** Handles everything related to picking the RPC */
export class SolanaRpcService {
  readonly logPrefix = '[SolanaRpc]';
  readonly connections: IMap<SolanaConnection> = {};

  constructor(protected readonly logger: BaseLoggerService) {}

  connect(commitment: Commitment = 'processed', tag: SolanaRpcTag = 'default'): SolanaConnection {
    const c = this.getRpcConnectionByTag(tag, commitment);
    return c;
  }

  insertConnectionConfig(config: SolanaEndpointConfig, env: SolanaEndpointNetwork = 'mainnet-beta') {
    SOLANA_ENDPOINTS_CONFIG[env].unshift(config);
  }

  /** Get first connection that has a given tag */
  getRpcConnectionByTag(
    tag: SolanaRpcTag,
    commitment: Commitment = 'processed',
    env: SolanaEndpointNetwork = 'mainnet-beta'
  ): SolanaConnection {
    const endpoints = this.getEndpoints(tag, env);
    if (!endpoints || endpoints.length === 0) {
      throw 'Unable to retrieve Solana Connection';
    }
    return this.getRpcConnection(endpoints[0].url, {
      commitment,
      wsEndpoint: endpoints[0].wsUrl,
      disableRetryOnRateLimit: false,
    });
  }

  /** Get all connection that has a given tag */
  getRpcConnectionsByTag(
    tag: SolanaRpcTag,
    commitment: Commitment = 'processed',
    env: SolanaEndpointNetwork = 'mainnet-beta'
  ): SolanaConnection[] {
    const endpoints = this.getEndpoints(tag, env);
    if (!endpoints || endpoints.length === 0) {
      throw 'Unable to retrieve Solana Connection';
    }
    const result = endpoints.map((x) =>
      this.getRpcConnection(x.url, {
        commitment,
        wsEndpoint: x.wsUrl,
        disableRetryOnRateLimit: true,
      })
    );

    return result;
  }

  getMultiSendConnections(commitment: Commitment = 'processed', limit = 3): IMap<Connection> {
    const connections: IMap<Connection> = {};
    let count = 0;
    const conections = this.getRpcConnectionsByTag('send', commitment).slice(0, limit);
    for (const c of conections) {
      const key = `${c?.rpcEndpoint}-${commitment}`;
      connections[key] = this.getRpcConnection(c.rpcEndpoint, commitment);
      count++;
      if (count == limit) {
        break;
      }
    }
    return connections;
  }

  getUpdateMainnetConnections(commitment: Commitment = 'processed', limit = 5): IMap<SolanaConnection> {
    const connections: IMap<Connection> = {};
    let count = 0;
    const endpoints = this.getRpcConnectionsByTag('update', commitment);
    for (const endpoint of endpoints) {
      const key = `${endpoint}-${commitment}`;
      connections[key] = this.getRpcConnection(endpoint.rpcEndpoint, commitment);
      count++;
      if (count == limit) {
        break;
      }
    }
    return connections;
  }

  /** Returns additional info of the max batch size when retrieving multiple tx at the same time */
  getBatchMainnetConnections(commitment: Commitment = 'processed', limit = 7): IMap<[SolanaConnection, number]> {
    const connections: IMap<[Connection, number]> = {};
    let count = 0;
    const endpoints = this.getRpcConnectionsByTag('update', commitment);
    for (const endpoint of endpoints) {
      const key = `${endpoint.rpcEndpoint}-${commitment}`;
      // TODO: get actual batch size for each rpc
      connections[key] = [endpoint, 100];
      count++;
      if (count == limit) {
        break;
      }
    }
    return connections;
  }

  /** New method for rpc endpoints */
  getEndpoints(tag?: SolanaRpcTag, env: SolanaEndpointNetwork = 'mainnet-beta'): SolanaEndpointConfig[] {
    const endpoints = SOLANA_ENDPOINTS_CONFIG[env].filter((x) => !tag || x.tags?.includes(tag));
    return endpoints;
  }

  getNewDevnetConnection(config: Commitment | ConnectionConfig = 'processed'): SolanaConnection {
    const c = new Connection('https://api.devnet.solana.com', config);
    return c;
  }

  getRpcConnection(
    endpoint: string,
    config: Commitment | ConnectionConfig = 'processed',
    force = false
  ): SolanaConnection {
    const commitmentString = typeof config === 'string' ? config : config.commitment;
    const key = `${endpoint}-${commitmentString}`;
    if (!this.connections[key] || force) {
      this.logger.logAt(5, `${this.logPrefix} getRpcConnection to ${endpoint} with '${commitmentString}'`);
      this.connections[key] = new Connection(endpoint, {
        commitment: commitmentString,
      });
    }
    return this.connections[key];
  }
}
