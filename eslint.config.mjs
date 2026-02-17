import nextPlugin from "eslint-config-next";

const config = [
  ...nextPlugin,
  {
    rules: {
      "@next/next/no-html-link-for-pages": "off"
    }
  }
];

export default config;
