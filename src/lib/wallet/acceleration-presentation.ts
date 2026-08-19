import type { AccelerationMethod } from './contracts';

export function accelerationUnavailableTitle(method: AccelerationMethod): string {
  return method === 'cpfp' ? 'CPFP unavailable' : 'RBF unavailable';
}
