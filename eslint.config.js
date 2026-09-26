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
  // Plain JS (scripts/*.mjs, src/sw/sw.js, e2e/support/*.mjs) is not in the TS project service.
  { files: ['**/*.mjs', '**/*.js'], ...tseslint.configs.disableTypeChecked },
);
