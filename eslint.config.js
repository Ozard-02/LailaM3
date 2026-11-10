const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.expo/**',
      'references/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  {
    rules: {
      'no-console': 'off',
      'import/order': 'off',
      // The barrel bundles every lucide icon (~2.3 MB on web); see src/ui/icons.ts.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'lucide-react-native',
              message: "Import icons from '@/ui/icons' (one module per icon).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/ui/icons.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
]);
