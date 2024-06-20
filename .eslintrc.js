module.exports = {
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended", "plugin:prettier/recommended"],
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  root: true,
  ignorePatterns: ["dist/index.js"],
  rules: {
    "@typescript-eslint/no-explicit-any": "off",
  },
};
