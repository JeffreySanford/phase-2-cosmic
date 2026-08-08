import type { StorybookConfig } from "@storybook/angular";

const config: StorybookConfig = {
  stories: ["../apps/frontend/src/**/*.stories.@(ts|tsx|js|jsx|mdx)"],
  addons: [],
  framework: {
    name: "@storybook/angular",
    options: {},
  },
};

export default config;
