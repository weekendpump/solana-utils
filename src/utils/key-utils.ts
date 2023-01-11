import { Keypair, PublicKey } from "@solana/web3.js";
import { decode, encode } from "bs58";
import { IMapNumber } from "../types";
import { LazySolanaKey, SolanaKey } from "./lazy-solana-key";
import * as bip39 from "bip39";

export const SOLANA_TEXT_ENCODER = new TextEncoder();

export function isPublicKey(obj: any): obj is PublicKey {
  return obj.toBase58 !== undefined;
}

export function isValidPublicKeyString(key: string): boolean {
  try {
    return Boolean(key) && Boolean(new PublicKey(key));
  } catch (err) {
    return false;
  }
}

export function isSolanaKey(obj: SolanaKey): obj is SolanaKey {
  if (!obj) {
    return false;
  }
  if (isPublicKey(obj)) {
    return true;
  }
  if (obj instanceof LazySolanaKey) {
    return true;
  }
  if (typeof obj === "string") {
    return (
      obj.length === 44 ||
      obj.length === 43 ||
      obj === "11111111111111111111111111111111"
    );
  }
  return Boolean(new PublicKey(obj));
}

export function toShortKeyString(key: SolanaKey, showChars = 4): string {
  const r = toKeyString(key);
  if (r.length < showChars + 7) {
    return r;
  }
  const prefix = r.substring(0, showChars);
  const suffix = r.substring(r.length - showChars);
  return `${prefix}...${suffix}`;
}

export function toKey(key: SolanaKey): PublicKey {
  if (!key) {
    throw "Missing key argument";
  }
  if (key instanceof PublicKey) {
    return key;
  }
  if (key instanceof LazySolanaKey) {
    return key.key;
  }
  return new PublicKey(key);
}

export function toKeyString(key: SolanaKey): string {
  if (key === null || key === undefined) {
    return "";
  }
  if (typeof key === "string") {
    return key;
  }
  if (key instanceof LazySolanaKey) {
    return key.keyString;
  }
  if (key instanceof PublicKey) {
    return key.toBase58();
  }
  return new PublicKey(key).toBase58();
}

export function arrayToPrivateKey(
  key: number[] | Buffer | Uint8Array
): string | null {
  if (!key) {
    return null;
  }
  return encode(key);
}

export function privateKeyToBuffer(key: string): Buffer | null {
  if (!key) {
    return null;
  }
  return Buffer.from(decode(key));
}

export function bip39MnemonicToEntropy(mnemonic: string): string | null {
  if (!mnemonic) {
    return null;
  }
  return bip39.mnemonicToEntropy(mnemonic);
}

export function bip39EntropyToMnemonic(
  entropy: Buffer | string
): string | null {
  if (!entropy) {
    return null;
  }
  return bip39.entropyToMnemonic(entropy);
}

export function bip39Words() {
  bip39.setDefaultWordlist("english");
  const words = bip39.wordlists["english"];
  const wordsByLetters: IMapNumber<string[]> = [];
  for (let i = 1; i < 12; i++) {
    wordsByLetters[i] = words.filter((x) => x.length == i);
  }
  const wordsCount = Object.keys(wordsByLetters).map(
    (x) => `${x}: ${wordsByLetters[Number(x)].length}`
  );

  return { words, wordsByLetters, wordsCount };
}

export function getPdaKey(
  programId: SolanaKey,
  args: (SolanaKey | Buffer | string)[]
): PublicKey | null {
  const programKey = toKey(programId);
  if (!programKey) {
    return null;
  }
  const seeds: (Uint8Array | Buffer)[] = [];
  for (const a of args) {
    if (isSolanaKey(a)) {
      const key = toKey(a);
      if (!key) {
        return null;
      }
      seeds.push(key.toBuffer());
    } else {
      seeds.push(SOLANA_TEXT_ENCODER.encode(a));
    }
  }
  const pda = PublicKey.findProgramAddressSync(seeds, programKey);
  return pda[0];
}

export function randomPubkey(): string {
  return Keypair.generate().publicKey.toBase58();
}

export function randomLazyKey(): LazySolanaKey {
  return LazySolanaKey.from(Keypair.generate().publicKey, true);
}

/** used to generate stable but unique mix of 2 keys */
export function doubleLazyKey(
  a: SolanaKey,
  b: SolanaKey
): LazySolanaKey | null {
  const aBytes = toKey(a)?.toBytes();
  const bBytes = toKey(b)?.toBytes();
  if (!aBytes || !bBytes) {
    return null;
  }
  const cBytes = aBytes?.map((x, i) => x ^ bBytes[i]);
  return LazySolanaKey.from(cBytes, true);
}
