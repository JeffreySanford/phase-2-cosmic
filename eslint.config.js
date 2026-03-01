const nx = require('@nx/eslint-plugin');

module.exports = [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: ['**/dist'],
  },
  {
    files: ['**/*.spec.ts', '**/*.spec.tsx'],
    rules: {
      // Allow async/await in tests for clarity and simplicity
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?js$'],
          depConstraints: [
            {
              sourceTag: '*',
              onlyDependOnLibsWithTags: ['*'],
            },
          ],
        },
      ],
    },
  },
  {
    // Apply UI-focused rules only to frontend app sources and library source files
    files: ['apps/frontend/src/**/*.ts', 'apps/frontend/src/**/*.tsx', 'libs/**/src/**/*.ts', 'libs/**/src/**/*.tsx'],
    // Override or add rules here
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@angular/core',
              importNames: ['signal', 'Signal'],
              message: 'Signals are disallowed by coding standards. Use RxJS Observables instead.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "Property[key.name='standalone'][value.value=true]",
          message: 'Standalone components are disallowed. Use module-declared components with `standalone: false`.',
        },
        {
          selector: 'AwaitExpression',
          message: 'Prefer RxJS Observable streams over async/await patterns in UI code; prefer `firstValueFrom` or Observables with subscription patterns where appropriate.',
        },
      ],
      'no-await-in-loop': 'warn',
    },
  },
  // Test files: allow async/await and relax restricted-syntax rules
  {
    files: ['**/*.spec.ts', '**/*.spec.tsx'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
];
