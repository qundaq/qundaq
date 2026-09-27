import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist/', 'dist-e2e/', 'coverage/', 'test-results/', 'playwright-report/'] },
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ['**/*.tsx', 'src/ui/**/*.ts'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ['src/ui/**/*.tsx'],
    ignores: ['src/ui/shared/**', 'src/ui/app/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='className'] > Literal",
          message: "Compose a shared component or use this screen's CSS Module.",
        },
        {
          selector: "JSXAttribute[name.name='className'] > JSXExpressionContainer > Literal",
          message: "Compose a shared component or use this screen's CSS Module.",
        },
        {
          selector:
            "JSXAttribute[name.name='className'] > JSXExpressionContainer > TemplateLiteral",
          message: 'Join module classes with an array and filter(Boolean), not a template string.',
        },
      ],
    },
  },
  // Plain JS (scripts/*.mjs, src/sw/sw.js, e2e/support/*.mjs) is not in the TS project service.
  { files: ['**/*.mjs', '**/*.js'], ...tseslint.configs.disableTypeChecked },
);
