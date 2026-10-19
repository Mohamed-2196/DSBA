import { describe, expect, it } from 'vitest';
import { COVER_W, FIGURE_HEIGHT, MARGIN, MEASURE, fitTitle, numeralBox } from './covers';

describe('numeralBox', () => {
  it('runs a wide numeral from margin to margin', () => {
    const { size, x } = numeralBox('08', 1000);
    // "0" starts its ink 0.028em in; "8" ends it 0.583em into its advance, after the "0"'s 0.594em.
    expect(x + 0.028 * size).toBeCloseTo(MARGIN, 0);
    expect(x + (0.594 + 0.583) * size).toBeCloseTo(COVER_W - MARGIN, 0);
  });

  it('stops a narrow numeral at the height it may take', () => {
    const { size } = numeralBox('11', 150);
    expect(size * FIGURE_HEIGHT).toBeLessThanOrEqual(150.1);
  });
});

describe('fitTitle', () => {
  it('keeps a short cover line at its size', () => {
    expect(fitTitle('Exam week', 28.5)).toBe(28.5);
  });

  it('shrinks a long one to the measure', () => {
    const size = fitTitle('Revision week special', 28.5);
    expect(size).toBeLessThan(28.5);
    expect('Revision week special'.length * 0.52 * size).toBeLessThanOrEqual(MEASURE);
  });
});
