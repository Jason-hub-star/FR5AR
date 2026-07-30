// 검증용 스텁 — 우리 FR5 메시는 전부 STL이라 Collada 경로는 실행되지 않는다.
// urdf-loader가 정적 import 하므로 존재만 시켜준다.
export class ColladaLoader {
  constructor(manager) { this.manager = manager; }
  load() { throw new Error('ColladaLoader stub — 이 테스트에서는 사용되지 않음'); }
}
