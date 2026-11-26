import cloudflare from '@cloudflare/oxlint-config'
import { defineConfig } from 'oxlint'
import core from 'ultracite/oxlint/core'
import vitest from 'ultracite/oxlint/vitest'

const cloudflareWithoutTestExemptions = {
  ...cloudflare,
  overrides: cloudflare.overrides.filter(({ rules }) => rules?.['typescript/no-explicit-any'] !== 'off'),
}

const baseRestrictedProperties = [
  { object: 'Reflect', property: 'apply', message: 'Call the function directly.' },
  { object: 'Reflect', property: 'get', message: 'Read the property directly from a parsed, typed value.' },
]

const objectHelpers = ['keys', 'values', 'entries', 'fromEntries'].map((property) => ({
  object: 'Object',
  property,
  message: 'Use Effect Record or typed Schema helpers instead of Object helpers.',
}))

const effectProperties = [
  ...['runSync', 'runPromise', 'runFork'].map((property) => ({
    object: 'Effect',
    property,
    message: 'Run Effects through Foldkit Runtime/Commands, not direct Effect.run* calls.',
  })),
  {
    object: 'Effect',
    property: 'promise',
    message: 'Use Effect.tryPromise so rejections stay in the typed error channel.',
  },
  {
    property: 'getOrThrow',
    message: 'Use Option.match, Option.getOrElse, or yield* the Option instead of throwing.',
  },
]

export default defineConfig({
  extends: [cloudflareWithoutTestExemptions, core, vitest],
  options: { typeAware: false },
  ignorePatterns: ['**/dist/**', '**/coverage/**'],
  overrides: [
    { files: ['**/*'], env: cloudflare.env },
    {
      files: ['**/*.{test,spec}.{ts,tsx}', '**/test/**/*.{ts,tsx}'],
      plugins: ['vitest'],
      rules: {
        'vitest/prefer-importing-vitest-globals': 'error',
        'vitest/prefer-to-be-truthy': 'off',
        'vitest/prefer-to-be-falsy': 'off',
        'vitest/valid-title': 'error',
        'vitest/prefer-strict-boolean-matchers': 'error',
        'vitest/max-expects': ['error', { max: 20 }],
        'vitest/prefer-strict-equal': 'off',
        'no-restricted-properties': ['error', ...baseRestrictedProperties, ...effectProperties],
        'vitest/no-restricted-vi-methods': [
          'error',
          {
            mock: 'Provide a test Layer or pass the dependency instead of replacing a module.',
            doMock: 'Provide a test Layer or pass the dependency instead of replacing a module.',
          },
        ],
      },
    },
  ],
  rules: {
    'typescript/return-await': ['error', 'error-handling-correctness-only'],
    'typescript/switch-exhaustiveness-check': [
      'error',
      { allowDefaultCaseForExhaustiveSwitch: true, considerDefaultExhaustiveForUnions: true },
    ],
    'typescript/await-thenable': ['error', { allowMixedPromiseArrays: true }],
    'prefer-arrow-callback': ['error', { allowNamedFunctions: true }],
    'no-warning-comments': ['error', { terms: ['todo', 'fixme', 'xxx', '@todo', '@nocommit'], decoration: ['*'] }],
    'unicorn/text-encoding-identifier-case': ['error', { withDash: true }],
    'import/no-namespace': ['error', { ignore: ['effect', 'effect/**', '@effect/**'] }],
    'import/no-nodejs-modules': 'error',
    'quality/no-reflect-apply': 'off',
    'quality/no-reflect-get': 'off',
    'unicorn/no-immediate-mutation': 'error',
    'oxc/no-accumulating-spread': 'error',
    'no-restricted-properties': ['error', ...baseRestrictedProperties, ...objectHelpers, ...effectProperties],
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: 'effect',
            allowTypeImports: true,
            message: 'Import the module namespace, for example import * as Effect from "effect/Effect".',
          },
        ],
      },
    ],
    'no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        fix: { imports: 'safe-fix', variables: 'off' },
      },
    ],
    'import/export': 'error',
    'import/no-default-export': 'error',
    'import/no-unassigned-import': 'error',
    'typescript/no-require-imports': 'error',
    'typescript/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
    'typescript/explicit-module-boundary-types': 'error',
    'typescript/ban-ts-comment': ['error', { 'ts-expect-error': true, 'ts-ignore': true, 'ts-nocheck': true }],
    'prefer-as-const': 'error',
    'new-cap': ['error', { capIsNew: false, newIsCap: true }],
    'unicorn/no-array-for-each': 'off',
    'unicorn/no-array-method-this-argument': 'off',
    'unicorn/no-array-callback-reference': 'off',
    'unicorn/throw-new-error': 'off',
  },
})
