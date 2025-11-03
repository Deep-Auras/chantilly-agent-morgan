module.exports = {
  env: {
    node: true,
    es2022: true,
    jest: true
  },
  extends: [
    'eslint:recommended'
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  rules: {
    // Security best practices
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-script-url': 'error',

    // Code quality
    // SECURITY: Prevent console.log in production code (allow warn/error for scripts)
    'no-console': ['error', {
      allow: ['warn', 'error', 'info'] // Allow for scripts/* directory only via overrides below
    }],
    'no-debugger': 'error',
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'prefer-const': 'error',
    'no-var': 'error',

    // Error prevention
    'no-undef': 'error',
    'no-unreachable': 'error',
    'valid-typeof': 'error',

    // Best practices
    'eqeqeq': ['error', 'always'],
    'curly': ['error', 'all'],
    'no-throw-literal': 'error',
    'no-return-await': 'error',

    // Style consistency
    'indent': ['error', 2],
    'quotes': ['error', 'single'],
    'semi': ['error', 'always'],
    'comma-dangle': ['error', 'never'],
    'object-curly-spacing': ['error', 'always'],
    'array-bracket-spacing': ['error', 'never'],

    // Node.js specific
    'no-process-exit': 'warn',
    'handle-callback-err': 'error'
  },
  ignorePatterns: [
    'node_modules/',
    'coverage/',
    'dist/',
    '*.min.js'
  ],
  overrides: [
    {
      // SECURITY: Allow console in scripts directory for CLI tools
      files: ['scripts/**/*.js', '*.test.js', '*.spec.js'],
      rules: {
        'no-console': 'off'
      }
    }
  ]
};