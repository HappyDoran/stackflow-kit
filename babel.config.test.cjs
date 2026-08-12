// jest 전용 transform 설정. 배포 산출물은 tsconfig.build.json의 tsc가 만든다.
module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    ['@babel/preset-react', { runtime: 'automatic' }],
    '@babel/preset-typescript',
  ],
};
