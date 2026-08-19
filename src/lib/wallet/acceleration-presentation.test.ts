import { describe, expect, it } from 'vitest';
import { accelerationUnavailableTitle } from './acceleration-presentation';

describe('acceleration presentation', () => {
  it('names the acceleration method instead of implying that the wallet failed to load', () => {
    expect(accelerationUnavailableTitle('cpfp')).toBe('CPFP unavailable');
    expect(accelerationUnavailableTitle('rbf')).toBe('RBF unavailable');
  });
});
