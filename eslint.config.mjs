export default [
  {
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "script",
      globals: {
        document: "readonly",
        window: "readonly",
        localStorage: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        crypto: "readonly",
        Date: "readonly",
        Math: "readonly",
        Number: "readonly",
        Array: "readonly",
        Object: "readonly",
        String: "readonly",
        JSON: "readonly",
        console: "readonly",
        navigator: "readonly",
        Float32Array: "readonly",
        Uint32Array: "readonly",
        parseFloat: "readonly",
        isNaN: "readonly"
      }
    },
    rules: {
      "no-var": "error",
      "prefer-const": "error",
      "no-unused-vars": "warn",
      "eqeqeq": ["error", "always"],
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-proto": "error",
      "no-extend-native": "error",
      "no-alert": "warn",
      "curly": "error",
      "no-throw-literal": "error",
      "prefer-template": "warn",
      "no-console": "off",
      "strict": ["error", "global"]
    }
  }
];
