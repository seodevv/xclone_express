import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  preset: 'ts-jest', // TypeScript용 preset
  testEnvironment: 'node', // Node 환경
  testMatch: ['**/__tests__/**/*.test.ts'], // 테스트 파일 위치
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};

export default config;
