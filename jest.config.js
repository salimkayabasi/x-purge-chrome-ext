module.exports = {
  testEnvironment: "jsdom",
  testEnvironmentOptions: {
    url: "https://x.com/"
  },

  collectCoverageFrom: [
    "src/**/*.js"
  ],
  coverageDirectory: "coverage",
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80
    },
    "./src/**/*.js": {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};
