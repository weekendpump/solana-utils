import { nu64, u16, u32 } from '@solana/buffer-layout';
import { Account, AccountInfo, Keypair, Logs, PublicKey, TransactionInstruction } from '@solana/web3.js';
import BN from 'bn.js';
import { encode } from 'bs58';
import Decimal from 'decimal.js';
import { toKeyString } from './key-utils';
import { LazySolanaKey } from './lazy-solana-key';

export function toSolScanTxLink(txId: string): string {
  return `https://solscan.io/tx/${txId}`;
}

export function toSolScanAccLink(accId: string): string {
  return `https://solscan.io/account/${accId}`;
}

export function toDisplayObject(input: any, depth = 8): any | any[] {
  if (depth < 1) {
    return input;
  }

  if (input === null) {
    return 'null';
  }

  if (input === undefined) {
    return 'undefined';
  }

  if (input instanceof PublicKey) {
    return input.toBase58();
  }

  if (input instanceof Account) {
    return {
      public: input.publicKey.toBase58(),
      private: encode(input.secretKey),
    };
  }

  if (input instanceof Keypair) {
    return {
      public: input.publicKey.toBase58(),
      private: encode(input.secretKey),
    };
  }

  if (Buffer.isBuffer(input) && input.length === 32) {
    return `Key: ${new PublicKey(input).toBase58()}`;
  }

  if (Buffer.isBuffer(input) && input.length === 2) {
    return `U16: ${u16().decode(input).toString()}`;
  }

  if (Buffer.isBuffer(input) && input.length === 4) {
    return `U16: ${u32().decode(input).toString()}`;
  }

  if (Buffer.isBuffer(input) && input.length === 8) {
    return `NU64: ${nu64().decode(input).toString()}`;
  }

  if (Buffer.isBuffer(input)) {
    return `Raw: 0x${input.toString('hex')}`;
  }

  if (input instanceof Number) {
    return `BigNumber: ${input.toString()}`;
  }

  if (BN.isBN(input)) {
    return `BN: ${input.toString()}`;
  }

  if (input instanceof Array) {
    const outputArray: any | any[] = [];
    input.forEach((el) => {
      outputArray.push(toDisplayObject(el, depth - 1));
    });
    return outputArray;
  }

  if (input instanceof Object) {
    const result: { [k: string]: any } = {};
    Object.keys(input).forEach((k) => {
      const v = input[k];
      result[k] = toDisplayObject(v, depth - 1);
    });
    return result;
  }
  return input;
}

export function debugLog(debug = false, ...p: any[] | any) {
  if (debug) {
    console.log(p);
  }
}

export function displayIx(ix: TransactionInstruction): string {
  if (!ix || !ix.programId || !ix.data) {
    return '';
  }
  const keys = ix.keys.map((x) => `${toKeyString(x.pubkey)} [${x.isSigner ? 'S' : ''}${x.isWritable ? 'W' : ''}]`);
  return `${toKeyString(ix.programId)}: 0x${ix.data.toString('hex')}(${encode(ix.data)})\n${keys.join('\n')}`;
}

export function displayAccountInfo(a: AccountInfo<Buffer>): string {
  if (!a || !a.data) {
    return '';
  }

  return `Len: ${a.data.length}, Owner: ${toKeyString(a.owner)}, Lamports: ${a.lamports}`;
}

export function displayProgramLogs(
  logs: Logs,
  ignoreInvoke = true,
  ignoreConsumed = true,
  ignoreSuccess = true
): string {
  if (!logs) {
    return '';
  }

  const logLines = logs.logs.filter(
    (x) =>
      !(ignoreInvoke && x.includes('invoke')) &&
      !(ignoreConsumed && x.includes('consumed')) &&
      !(ignoreSuccess && x.includes('success'))
  );

  const result = `${logs.signature} [${logs.err ? 'error' : 'success'}]:\n${logLines.join('\n')}`;
  return result;
}

export function toObjectWithoutBigInt(obj: unknown) {
  return JSON.parse(
    JSON.stringify(
      obj,
      (_, value) => (typeof value === 'bigint' ? value.toString() : value) // return everything else unchanged
    )
  );
}

export function stringify(obj: unknown): string {
  return JSON.stringify(
    obj,
    (_, value) => {
      if (typeof value === 'bigint') {
        return value.toString();
      }
      if (value instanceof LazySolanaKey) {
        return value.keyString;
      }
      if (value instanceof PublicKey) {
        return value.toBase58();
      }
      if (value instanceof Decimal) {
        return value.toString();
      }
      if (value instanceof BN) {
        return value.toString();
      }
      return value;
    },
    2
  );
}
