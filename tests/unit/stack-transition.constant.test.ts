/**
 * push·pop 곡선과 스와이프 스프링이 같은 물리 모델을 쓰는지 검증:
 * - styles.css의 linear() 곡선은 스프링 상수에서 생성한 값과 같다
 * - linear() 생성식은 임계 감쇠 해이므로 상수가 임계 감쇠를 유지해야 한다
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// styles.css와 상수의 내부 일치 계약이라 public export가 아닌 소스를 직접 본다.
import {
  SPRING_DAMPING,
  SPRING_STIFFNESS,
  springLinearEasing,
} from '../../src/constants/stack-transition.constant.js';

describe('stack transition spring', () => {
  it('styles.css의 전이 곡선은 스프링 상수에서 생성한 값과 같다', () => {
    const css = readFileSync(join(__dirname, '../../styles.css'), 'utf8');
    expect(css).toContain(`--stackflow-kit-easing: ${springLinearEasing()};`);
  });

  it('스프링은 임계 감쇠를 유지한다', () => {
    expect(SPRING_DAMPING ** 2).toBeCloseTo(4 * SPRING_STIFFNESS);
  });

  it('곡선은 0에서 1까지 줄지 않고 올라간다', () => {
    const points = springLinearEasing().slice('linear('.length, -1).split(', ').map(Number);
    expect(points[0]).toBe(0);
    expect(points.at(-1)).toBe(1);
    points.slice(1).forEach((point, i) => expect(point).toBeGreaterThanOrEqual(points[i]!));
  });
});
