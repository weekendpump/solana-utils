import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import nodePolyfills from 'rollup-plugin-polyfill-node';

const name = 'index';

export default {
  input: 'src/index.ts',
  output: [
    {
      file: `dist/${name}.js`,
      format: 'cjs',
      sourcemap: true,
    },
    {
      file: `dist/${name}.mjs`,
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
      ],
      preferBuiltins: false,
    }),
    typescript(),
    terser(),
  ],
};
