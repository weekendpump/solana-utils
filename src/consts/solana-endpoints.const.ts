import { clusterApiUrl } from '@solana/web3.js';
import { SolanaEndpointConfig, SolanaEndpointsConfig } from '../types';
import { solanaBasicEndpoint } from '../utils';

export const SOLANA_MAINNET_ENDPOINTS_CONFIG: SolanaEndpointConfig[] = [
  // Access forbidden
  // solanaBasicEndpoint(
  //   'https://mainnet.rpcpool.com',
  //   [
  //     'default',
  //     'test',
  //     'send',
  //     'update',
  //     'programUpdate',
  //     'tokens',
  //     // 'programAccounts'
  //   ],
  //   'wss://mainnet.rpcpool.com',
  //   'mainnet-beta',
  //   5
  // ),

  solanaBasicEndpoint(
    'https://api.mainnet-beta.solana.com',
    [
      'default',
      'history',
      'test',
      'send',
      'update',
      'programUpdate',
      'slotUpdate',
      'tokens',
      // 'programAccounts',
      'multipleAccounts',
    ],
    undefined,
    'mainnet-beta',
    5
  ),
  // solanaBasicEndpoint('https://ssc-dao.genesysgo.net', ['h1', 'test', 'update', 'send', 'index']),
  // solanaBasicEndpoint('https://solana-api.projectserum.com', ['h3', 'batch', 'send']),
  // solanaBasicEndpoint('https://free.rpcpool.com', []),
];

export const SOLANA_ENDPOINTS_CONFIG: SolanaEndpointsConfig = {
  'mainnet-beta': SOLANA_MAINNET_ENDPOINTS_CONFIG,
  testnet: [{ url: clusterApiUrl('testnet'), network: 'testnet' }],
  devnet: [{ url: clusterApiUrl('devnet'), network: 'devnet' }],
  localnet: [{ url: 'http://127.0.0.1:8899', network: 'localnet' }],
};
