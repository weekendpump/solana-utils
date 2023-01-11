import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import nodePolyfills from 'rollup-plugin-polyfill-node';

const name = 'solana-utils';

export default {
  input: 'src/index.ts',
  output: [
    {
      file: `dist/${name}.min.js`,
      format: 'cjs',
      sourcemap: true,
    },
    {
      file: `dist/${name}.min.mjs`,
      format: 'es',
      sourcemap: true,
    },
  ],
  plugins: [
    nodePolyfills(),
    commonjs(),
    nodeResolve({
      resolveOnly: [
        '@solana/*',
        '@coral-xyz/*',
        'bn.js',
        'decimal.js',
        'bs58',
        'pako',
        'rxjs',
        'snake-case',
      ],
      preferBuiltins: false,
    }),
    typescript(),
    terser(),
  ],
};
