export default {
  moduleNameMapper: {
    // 테스트는 소비자와 같은 public export를 통해 접근한다.
    '^@happydoran/stackflow-kit/navigation-lock$': '<rootDir>/src/navigation-lock.ts',
    '^@happydoran/stackflow-kit$': '<rootDir>/src/index.ts',
    // src는 ESM 규약대로 .js 확장자로 상대 import한다.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/{unit,integration}/**/*.test.{ts,tsx}'],
  transform: {
    '^.+\\.(t|j)sx?$': ['babel-jest', { configFile: './babel.config.test.cjs' }],
  },
};
