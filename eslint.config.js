// ESLint: erros comuns de JavaScript e regras dos hooks (useEffect, useMemo…).
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['dist/', 'dev-dist/', 'node_modules/', 'tests/e2e/output/'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      // __APP_VERSION__: versão do package.json, definida no vite.config.js.
      globals: { ...globals.browser, __APP_VERSION__: 'readonly' },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true, varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['scripts/**', 'tests/**', '*.config.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
