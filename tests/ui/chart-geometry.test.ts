import { describe, expect, it } from 'vitest';
import { growthChartGeometry } from '../../src/ui/summary/chartGeometry';

// 320 × 200 with 24 on every side: the plot spans x 24–296 and y 24–176.
describe('growthChartGeometry', () => {
  it('has nothing to draw without points', () => {
    expect(growthChartGeometry([], 320, 200, 24)).toEqual({ dots: [], polyline: null, yMax: 0, yMin: 0, firstAt: null, lastAt: null });
  });

  it('puts a single point in the middle and draws no line', () => {
    expect(growthChartGeometry([{ at: 1000, value: 3450 }], 320, 200, 24)).toEqual({
      dots: [{ x: 160, y: 100 }],
      polyline: null,
      yMax: 3450,
      yMin: 3450,
      firstAt: 1000,
      lastAt: 1000,
    });
  });

  it('runs a flat series along the middle', () => {
    const geometry = growthChartGeometry(
      [
        { at: 0, value: 3000 },
        { at: 100, value: 3000 },
        { at: 200, value: 3000 },
      ],
      320,
      200,
      24,
    );
    expect(geometry.polyline).toBe('24,100 160,100 296,100');
  });

  it('goes from bottom left to top right, with x proportional to time', () => {
    const geometry = growthChartGeometry(
      [
        { at: 1200, value: 4000 },
        { at: 0, value: 3000 },
        { at: 300, value: 3500 },
      ],
      320,
      200,
      24,
    );
    expect(geometry).toEqual({
      dots: [
        { x: 24, y: 176 },
        { x: 92, y: 100 },
        { x: 296, y: 24 },
      ],
      polyline: '24,176 92,100 296,24',
      yMax: 4000,
      yMin: 3000,
      firstAt: 0,
      lastAt: 1200,
    });
  });
});
