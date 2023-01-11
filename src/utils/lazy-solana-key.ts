import { PublicKey } from "@solana/web3.js";

export type SolanaKey =
  | LazySolanaKey
  | Uint8Array
  | Buffer
  | Array<number>
  | string
  | PublicKey;

export class LazySolanaKey {
  private _keyString?: string;
  private _key?: PublicKey;
  private _raw?: Uint8Array | Buffer | Array<number>;

  get key(): PublicKey {
    if (!this._key) {
      if (this._keyString) {
        this._key = new PublicKey(this._keyString);
      }
      if (this._raw) {
        this._key = new PublicKey(this._raw);
      }
      throw "Undefined key";
    }
    return this._key;
  }

  get keyString(): string {
    if (!this._keyString) {
      if (!this.key) {
        throw "Undefined key";
      }
      this._keyString = this.key.toBase58();
    }
    return this._keyString;
  }

  constructor(key: SolanaKey, fill = false) {
    if (key instanceof LazySolanaKey) {
      this._key = key.key;
    } else if (key instanceof PublicKey) {
      this._key = key;
    } else if (typeof key === "string") {
      this._keyString = key;
    } else {
      this._raw = key;
    }

    if (fill) {
      this.key && this.keyString;
    }
  }

  static from(k: SolanaKey, fill = false) {
    return new LazySolanaKey(k, fill);
  }

  eq(x: SolanaKey): boolean {
    if (typeof x === "string") {
      return x === this.keyString;
    }
    if (x instanceof PublicKey) {
      return x.equals(this.key);
    }
    if (x instanceof LazySolanaKey) {
      return x.key.equals(this.key);
    }
    return this.key.equals(new PublicKey(x));
  }

  toBase58(): string {
    return this.keyString;
  }

  toString(): string {
    return this.keyString;
  }
}
