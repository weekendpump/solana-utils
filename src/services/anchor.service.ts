import {
  AccountNamespace,
  AnchorProvider,
  BorshInstructionCoder,
  EventParser,
  Idl,
  Program,
  Wallet,
  Native,
} from '@coral-xyz/anchor';
import { CompiledInstruction, PublicKey, MemcmpFilter, Connection, TransactionResponse } from '@solana/web3.js';
import { decode, encode } from 'bs58';
import { sha256 } from 'js-sha256';
import { snakeCase } from 'snake-case';
import { inflate } from 'pako';
import { IAnchorIdl, IAnchorIdlDecodedInstruction } from '../interfaces';
import { IMap } from '../types';
import { SolanaKey, toKey, toKeyString } from '../utils';
import { SolanaApiService } from './solana-api.service';
import { BaseLoggerService } from './base-logger.service';
import { IDL_ACCOUNT_LAYOUT } from '../consts';

/** Various Anchor related helpers */
export class AnchorService {
  private isInitialized = false;
  readonly logPrefix = '[Anchor]';
  readonly SIGHASH_STATE_NAMESPACE = 'state';
  readonly SIGHASH_GLOBAL_NAMESPACE = 'global';
  // TODO: narrow the type
  readonly programCache: IMap<Promise<Program<any> | null> | null> = {};
  connection?: Connection;
  wallet?: Wallet;

  constructor(protected readonly logger: BaseLoggerService, protected readonly solanaApi: SolanaApiService) {}

  async init(wallet?: Wallet, connection?: Connection): Promise<boolean> {
    if (this.isInitialized) {
      return false;
    }
    this.wallet = wallet;
    this.connection = connection;
    await this.loadCorePrograms();
    this.isInitialized = true;
    return true;
  }

  async decodeInstruction(
    tx: TransactionResponse,
    ix: CompiledInstruction
  ): Promise<IAnchorIdlDecodedInstruction | null> {
    const programId = tx.transaction.message.accountKeys[ix.programIdIndex];
    const program = await this.getProgram(programId);
    if (!program) {
      this.logger.logAt(5, `${this.logPrefix} Missing program for ${programId}, ${ix.programIdIndex}`);
      return null;
    }

    // const name = await this.getNameFromIxData(program, ix.data);
    // const programMethod = program.methods[name];

    this.logger.logAt(
      5,
      `${this.logPrefix} Decoding ix with program id ${toKeyString(programId)} for ${tx?.transaction?.signatures[0]}`,
      program.idl
    );
    const coder = new BorshInstructionCoder(program.idl);
    const decoded = coder.decode(ix.data, 'base58');
    if (!decoded) {
      return null;
    }
    const result: IAnchorIdlDecodedInstruction = {
      name: decoded.name,
      decodedArgs: decoded.data,
      args: [],
      accounts: [],
    };

    return result;
  }

  async getNameFromIxData(program: Program<Idl>, data: string): Promise<string> {
    const methods = Object.keys(program.methods);
    const ixData = decode(data);
    const ixDisc = ixData.slice(0, 8);
    this.logger.logAt(7, `Disc slice: ${Buffer.from(ixDisc).toString('hex')}`);

    for (const m of methods) {
      const d = await this.getProgramInstructionDiscriminator(program.programId, m);
      if (!d) {
        continue;
      }

      const ixDataHex = Buffer.from(ixDisc).toString('hex');
      const mDataHex = Buffer.from(d[1], 'hex').toString('hex');
      this.logger.logAt(7, `Comparing ${ixDataHex} === ${mDataHex}`);

      const match = ixDataHex === mDataHex;
      if (match) {
        return m;
      }
    }
    return '';
  }

  async getDiscriminators(programId: SolanaKey): Promise<IMap<string>> {
    const program = await this.getProgram(programId);
    if (!program) {
      throw 'Incorrect programId';
    }
    const methods = Object.keys(program.methods);
    const accounts = Object.keys(program.account);

    const result: IMap<string> = {};

    for (const m of methods) {
      const d = await this.getProgramInstructionDiscriminator(programId, m);
      if (!d) {
        continue;
      }
      result[`ix: ${m}`] = `${d[0]} (${d[1]})}`;
    }

    for (const a of accounts) {
      result[`acc: ${a}`] = this.accountDiscriminator(a).toString('hex');
      const len = await this.getAccountLength(programId, a);
      result[`acc_len: ${a}`] = len.toString();
    }
    return result;
  }

  async getProgramIdlString(programId: SolanaKey): Promise<string | null> {
    const idlAddress = await this.getProgramIdlAddress(programId);
    this.logger.logAt(
      7,
      `${this.logPrefix} getProgramIdlString for ${toKeyString(programId)}: ${toKeyString(idlAddress)}`
    );

    const account = await this.solanaApi.getAccount(idlAddress);
    if (!account) {
      this.logger.logAt(7, `${this.logPrefix} getProgramIdlString could not find on-chain IDL account`);
      return null;
    }

    const slice = account.accountInfo?.data.subarray(7, 15);
    if (!slice) {
      return null;
    }
    const idlAccount = IDL_ACCOUNT_LAYOUT.decode(slice);
    this.logger.logAt(7, `${this.logPrefix} got idl: ${JSON.stringify(idlAccount)}`);

    const inflatedIdl = inflate(idlAccount.data);
    return new TextDecoder('utf-8').decode(inflatedIdl);
  }

  async getProgramIdl(programId: SolanaKey): Promise<IAnchorIdl | null> {
    const idlString = await this.getProgramIdlString(programId);
    if (!idlString) {
      return null;
    }
    const idl = JSON.parse(idlString) as IAnchorIdl;
    if (!idl) {
      return null;
    }
    idl.programId = programId;
    idl.idlId = await this.getProgramIdlAddress(programId);
    return idl;
  }

  async getProgramIdlAddress(programId: SolanaKey): Promise<SolanaKey> {
    const key = toKey(programId);
    const base = (await PublicKey.findProgramAddress([], key))[0];
    return await PublicKey.createWithSeed(base, 'anchor:idl', key);
  }

  async getProgramInstructionDiscriminator(
    programId: SolanaKey,
    instructionName: string
  ): Promise<[string, string] | null> {
    const program = await this.getProgram(programId);
    if (!program) {
      throw 'Unable to get program';
    }
    const idlInstruction = program.idl.instructions.find((x) => x.name.toLowerCase() === instructionName.toLowerCase());
    if (!idlInstruction) {
      return null;
    }
    const sh = this.sighash(this.SIGHASH_GLOBAL_NAMESPACE, instructionName);
    const discriminator = encode(sh);
    this.logger.logAt(
      7,
      `${this.logPrefix} ix discriminator for ${toKeyString(
        programId
      )}->${instructionName}: ${discriminator}(${sh.toString('hex')})`
    );
    return [discriminator, sh.toString('hex')];
  }

  async loadCorePrograms() {
    const provider = this.getProvider();
    // const splProgram = Spl.token(provider);
    const systemProgram = Native.system(provider);

    // this.programCache[toKeyString(splProgram.programId)] = Promise.resolve(splProgram);
    this.programCache[toKeyString(systemProgram.programId)] = Promise.resolve(systemProgram);

    this.logger.logAt(5, `${this.logPrefix} Loaded ${Object.keys(this.programCache).length} core programs`);
  }

  /** Used to load IDL that hasn't been uploaded to Solana, like Star Atlas */
  async loadProgram<IDL extends Idl = Idl>(
    programId: SolanaKey,
    idl: IDL,
    wallet?: Wallet,
    connection?: Connection
  ): Promise<Program<IDL>> {
    const programKey = toKeyString(programId);
    const provider = this.getProvider(wallet, connection);
    const program = new Program(idl, programKey, provider);
    this.programCache[programKey] = Promise.resolve(program);
    this.logger.logAt(5, `${this.logPrefix} Loaded program ${programKey} from IDL.`);
    return program;
  }

  async getProgram<IDL extends Idl = Idl>(
    programId: SolanaKey,
    wallet?: Wallet,
    connection?: Connection
  ): Promise<Program<IDL> | null> {
    const programKey = toKeyString(programId);
    if (!programKey || !wallet) {
      throw 'Missing programId or wallet';
    }

    if (!this.programCache[programKey]) {
      this.programCache[programKey] = this.getProgramPromise<IDL>(programId, wallet, connection);
    }

    return this.programCache[programKey];
  }

  /** accountName should be camel case */
  async decodeProgramAccount<T>(
    programId: SolanaKey,
    accountName: string,
    accountNameDecode: string,
    data: Buffer
  ): Promise<T> {
    const program = await this.getProgram(programId);
    if (!program) {
      throw 'Unable to get program';
    }
    const client = program.account[accountName];
    const decoded = client.coder.accounts.decode<T>(accountNameDecode, data);
    return decoded;
  }

  /** new simpler decode that's also sync */
  decodeProgramAccountSync<T, IDL extends Idl = Idl>(
    program: Program<IDL>,
    name: keyof AccountNamespace<IDL>,
    data: Buffer
  ): T {
    const client = program.account[name];
    const decoded = client.coder.accounts.decode<T>(name, data);
    return decoded;
  }

  async encodeProgramAccount<T>(programId: SolanaKey, accountName: string, data: T): Promise<Buffer> {
    const program = await this.getProgram(programId);
    if (!program) {
      throw 'Unable to get program';
    }
    this.logger.logAt(6, `${this.logPrefix} Got program with accounts: ${Object.keys(program.account)}`);
    const client = program.account[accountName];
    const encoded = client.coder.accounts.encode<T>(accountName, data);
    return encoded;
  }

  accountDiscriminator(name: string): Buffer {
    const preimage = `account:${name}`;
    return Buffer.from(sha256.digest(preimage)).slice(0, 8);
  }

  accountMemCmp<IDL extends Idl = Idl>(program: Program<IDL>, name: keyof AccountNamespace<IDL>): MemcmpFilter {
    const client = program.account[name];
    return {
      memcmp: client.coder.accounts.memcmp(name),
    };
  }

  // accountPropetyOffset<IDL extends Idl = Idl>(program: Program<IDL>, name: keyof AccountNamespace, property: string): number {
  //   const accountClient: AccountClient<IDL> =  program.account[name];
  //   accountClient.coder.accounts.memcmp()
  //   return 0;
  // }

  /** accountName should be camel case */
  async getAccountLength(programId: SolanaKey, accountName: string): Promise<number> {
    const program = await this.getProgram(programId);
    if (!program) {
      throw 'Unable to get program';
    }
    const client = program.account[accountName];
    this.logger.logAt(
      7,
      `${this.logPrefix} Getting account length for ${accountName}. Existing: ${Object.keys(program.account)}`
    );
    return client?.size;
  }

  getProvider(wallet?: Wallet, connection?: Connection): AnchorProvider {
    const c = connection ?? this.connection;
    if (!c) {
      throw 'Missing connection';
    }
    const w = wallet ?? this.wallet;
    if (!w) {
      throw 'Missing wallet';
    }
    const provider = new AnchorProvider(c, w, {
      preflightCommitment: 'confirmed',
    });
    return provider;
  }

  async getParser<IDL extends Idl = Idl>(programId: SolanaKey): Promise<EventParser> {
    const program = await this.getProgram<IDL>(programId);
    if (!program) {
      throw 'Unable to get program';
    }
    const parser = new EventParser(toKey(programId), program.coder);
    return parser;
  }

  private sighash(nameSpace: string, ixName: string): Buffer {
    const name = snakeCase(ixName);
    const preimage = `${nameSpace}:${name}`;
    return Buffer.from(sha256.digest(preimage)).slice(0, 8);
  }

  private async getProgramPromise<IDL extends Idl = Idl>(
    programId: SolanaKey,
    wallet: Wallet,
    connection?: Connection
  ): Promise<Program<IDL> | null> {
    const programKey = toKeyString(programId);
    const provider = this.getProvider(wallet, connection);
    const idl = await Program.fetchIdl<IDL>(programKey, provider);
    if (!idl) {
      const idlAddress = await this.getProgramIdlAddress(programId);
      this.logger.logAt(4, `${this.logPrefix} Unable to fetch IDL for ${programKey} at ${toKeyString(idlAddress)}`);
      return null;
    }
    const program = new Program<IDL>(idl, programKey, provider);
    return program;
  }
}
