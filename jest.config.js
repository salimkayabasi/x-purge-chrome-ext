module.exports = {
  testEnvironment: "jsdom",
  collectCoverageFrom: [
    "src/**/*.js"
  ],
  coverageDirectory: "coverage",
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    },
    "./src/**/*.js": {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    }
  }
};
