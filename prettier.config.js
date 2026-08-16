/** @type {import('prettier').Config} */
export default {
  plugins: ['prettier-plugin-svelte'],
  printWidth: 100,
  singleQuote: true,
  trailingComma: 'none',
  endOfLine: 'lf',
  overrides: [
    {
      files: '*.svelte',
      options: { parser: 'svelte' }
    }
  ]
};
