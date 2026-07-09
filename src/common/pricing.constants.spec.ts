import {
  calculateChauffeurQuotedPrice,
  CHAUFFEUR_AVG_MPH,
  RATE_PER_MILE,
} from 'src/common/pricing.constants';

describe('pricing.constants', () => {
  describe('calculateChauffeurQuotedPrice', () => {
    it('charges minimum 1 hour at estimated miles × mile rate', () => {
      const start = new Date('2026-07-01T10:00:00Z');
      const end = new Date('2026-07-01T10:30:00Z');

      const result = calculateChauffeurQuotedPrice(start, end);

      expect(result.billableHours).toBe(1);
      expect(result.estimatedMiles).toBe(CHAUFFEUR_AVG_MPH);
      expect(result.quotedPrice).toBe(CHAUFFEUR_AVG_MPH * RATE_PER_MILE);
    });

    it('scales with booked duration (2 hours)', () => {
      const start = new Date('2026-07-01T10:00:00Z');
      const end = new Date('2026-07-01T12:00:00Z');

      const result = calculateChauffeurQuotedPrice(start, end);

      expect(result.billableHours).toBe(2);
      expect(result.quotedPrice).toBe(2 * CHAUFFEUR_AVG_MPH * RATE_PER_MILE);
    });
  });
});
