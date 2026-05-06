import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  {
    ignores: ["public/vendor/chili3d/**"],
  },
  ...nextVitals,
];

export default eslintConfig;
