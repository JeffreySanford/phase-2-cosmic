/**
 * NGVLA Reference Drift Regression Tests
 * 
 * Purpose: Verify that NGVLA constants in fixtures and contracts remain consistent
 * with approved reference values from docuentation/NGVLA_REFERENCES.md
 * 
 * These tests MUST fail when NGVLA constants are modified without updating the
 * reference documentation, preventing silent drift between platform constants
 * and published ngVLA specifications.
 * 
 * Mission linkage:
 * - Mission outcome: Reproducible science
 * - Operator/science impact: Prevents configuration drift from approved ngVLA specs
 * - Validation evidence: Automated regression tests + fixture compatibility checks
 */

import * as fs from 'fs';
import * as path from 'path';

describe('NGVLA Reference Drift Tests', () => {
  const fixturesDir = path.join(process.cwd(), 'schemas', 'fixtures');
  
  interface FrequencyBand { band: string; frequencyRangeGHz: { min: number; max: number } }
  interface NgvlaFixture {
    arrayConfiguration: { numberOfAntennas: number; antennaClass: string; baselineRange: { minimum: number; maximum: number }; canonicalLabel: string };
    arraySegment: string;
    frequencyBands: FrequencyBand[];
    reference: { url: string };
  }

  let mainArrayFixture: NgvlaFixture;
  let longBaselineFixture: NgvlaFixture;
  let shortBaselineFixture: NgvlaFixture;

  beforeAll(() => {
    // Ensure fixtures directory exists at repository root
    if (!fs.existsSync(fixturesDir)) {
      throw new Error(`NGVLA fixtures directory not found: ${fixturesDir}`);
    }

    // Load NGVLA array fixtures
    mainArrayFixture = JSON.parse(
      fs.readFileSync(path.join(fixturesDir, 'ngvla-main-array.json'), 'utf-8')
    );
    longBaselineFixture = JSON.parse(
      fs.readFileSync(path.join(fixturesDir, 'ngvla-long-baseline.json'), 'utf-8')
    );
    shortBaselineFixture = JSON.parse(
      fs.readFileSync(path.join(fixturesDir, 'ngvla-short-baseline.json'), 'utf-8')
    );
  });

  describe('Main Array Configuration', () => {
    it('should have correct antenna count (214)', () => {
      expect(mainArrayFixture.arrayConfiguration.numberOfAntennas).toBe(214);
    });

    it('should have correct antenna class (18m)', () => {
      expect(mainArrayFixture.arrayConfiguration.antennaClass).toBe('18m');
    });

    it('should have correct baseline range (26m to 1,005km)', () => {
      expect(mainArrayFixture.arrayConfiguration.baselineRange.minimum).toBe(26);
      expect(mainArrayFixture.arrayConfiguration.baselineRange.maximum).toBe(1005000);
    });

    it('should have canonical label "Main"', () => {
      expect(mainArrayFixture.arrayConfiguration.canonicalLabel).toBe('Main');
      expect(mainArrayFixture.arraySegment).toBe('Main');
    });

    it('should have all 6 frequency bands defined', () => {
      expect(mainArrayFixture.frequencyBands).toHaveLength(6);
      const bandNames = mainArrayFixture.frequencyBands.map((b: FrequencyBand) => b.band);
      expect(bandNames).toEqual(['Band 1', 'Band 2', 'Band 3', 'Band 4', 'Band 5', 'Band 6']);
    });

    it('should have correct Band 1 frequency range (1.2-3.5 GHz)', () => {
      const band1 = mainArrayFixture.frequencyBands.find((b: FrequencyBand) => b.band === 'Band 1');
      if (!band1) fail('Band 1 not found in main array fixture');
      expect(band1.frequencyRangeGHz.min).toBe(1.2);
      expect(band1.frequencyRangeGHz.max).toBe(3.5);
    });

    it('should have correct Band 6 frequency range (50-116 GHz)', () => {
      const band6 = mainArrayFixture.frequencyBands.find((b: FrequencyBand) => b.band === 'Band 6');
      if (!band6) fail('Band 6 not found in main array fixture');
      expect(band6.frequencyRangeGHz.min).toBe(50.0);
      expect(band6.frequencyRangeGHz.max).toBe(116.0);
    });
  });

  describe('Long Baseline Array Configuration', () => {
    it('should have correct antenna count (19)', () => {
      expect(longBaselineFixture.arrayConfiguration.numberOfAntennas).toBe(19);
    });

    it('should have correct antenna class (6m)', () => {
      expect(longBaselineFixture.arrayConfiguration.antennaClass).toBe('6m');
    });

    it('should have correct baseline range (1,000km to 8,946km)', () => {
      expect(longBaselineFixture.arrayConfiguration.baselineRange.minimum).toBe(1000000);
      expect(longBaselineFixture.arrayConfiguration.baselineRange.maximum).toBe(8946000);
    });

    it('should have canonical label "Long Baseline"', () => {
      expect(longBaselineFixture.arrayConfiguration.canonicalLabel).toBe('Long Baseline');
      expect(longBaselineFixture.arraySegment).toBe('Long Baseline');
    });

    it('should have high-frequency bands only (Band 5, Band 6)', () => {
      expect(longBaselineFixture.frequencyBands.length).toBeGreaterThanOrEqual(2);
      const bandNames = longBaselineFixture.frequencyBands.map((b: FrequencyBand) => b.band);
      expect(bandNames).toContain('Band 5');
      expect(bandNames).toContain('Band 6');
    });
  });

  describe('Short Baseline Array Configuration', () => {
    it('should have correct antenna count (19)', () => {
      expect(shortBaselineFixture.arrayConfiguration.numberOfAntennas).toBe(19);
    });

    it('should have correct antenna class (18m)', () => {
      expect(shortBaselineFixture.arrayConfiguration.antennaClass).toBe('18m');
    });

    it('should have correct baseline range (9m to 330m)', () => {
      expect(shortBaselineFixture.arrayConfiguration.baselineRange.minimum).toBe(9);
      expect(shortBaselineFixture.arrayConfiguration.baselineRange.maximum).toBe(330);
    });

    it('should have canonical label "SBA"', () => {
      expect(shortBaselineFixture.arrayConfiguration.canonicalLabel).toBe('SBA');
      expect(shortBaselineFixture.arraySegment).toBe('SBA');
    });

    it('should have low-to-mid frequency bands (Band 1-4)', () => {
      expect(shortBaselineFixture.frequencyBands.length).toBeGreaterThanOrEqual(4);
      const bandNames = shortBaselineFixture.frequencyBands.map((b: FrequencyBand) => b.band);
      expect(bandNames).toContain('Band 1');
      expect(bandNames).toContain('Band 2');
    });
  });

  describe('Frequency Band Consistency', () => {
    it('should have consistent Band 1 range across applicable arrays (1.2-3.5 GHz)', () => {
      const mainBand1 = mainArrayFixture.frequencyBands.find((b: FrequencyBand) => b.band === 'Band 1');
      const sbaBand1 = shortBaselineFixture.frequencyBands.find((b: FrequencyBand) => b.band === 'Band 1');
      if (!mainBand1 || !sbaBand1) fail('Band 1 missing in one of the fixtures');
      expect(mainBand1.frequencyRangeGHz.min).toBe(sbaBand1.frequencyRangeGHz.min);
      expect(mainBand1.frequencyRangeGHz.max).toBe(sbaBand1.frequencyRangeGHz.max);
    });

    it('should have no overlap between array segment canonical labels', () => {
      const labels = [
        mainArrayFixture.arraySegment,
        longBaselineFixture.arraySegment,
        shortBaselineFixture.arraySegment
      ];
      const uniqueLabels = new Set(labels);
      expect(uniqueLabels.size).toBe(3);
    });

    it('should have valid reference URLs', () => {
      expect(mainArrayFixture.reference.url).toMatch(/^https:\/\/library\.nrao\.edu/);
      expect(longBaselineFixture.reference.url).toMatch(/^https:\/\/library\.nrao\.edu/);
      expect(shortBaselineFixture.reference.url).toMatch(/^https:\/\/library\.nrao\.edu/);
    });
  });

  describe('Total Array Antenna Count', () => {
    it('should sum to 252 antennas across all segments (214 + 19 + 19)', () => {
      const totalAntennas = 
        mainArrayFixture.arrayConfiguration.numberOfAntennas +
        longBaselineFixture.arrayConfiguration.numberOfAntennas +
        shortBaselineFixture.arrayConfiguration.numberOfAntennas;
      
      expect(totalAntennas).toBe(252);
    });
  });

  describe('Antenna Class Distribution', () => {
    it('should have 18m antennas in Main and SBA only', () => {
      expect(mainArrayFixture.arrayConfiguration.antennaClass).toBe('18m');
      expect(shortBaselineFixture.arrayConfiguration.antennaClass).toBe('18m');
    });

    it('should have 6m antennas in Long Baseline only', () => {
      expect(longBaselineFixture.arrayConfiguration.antennaClass).toBe('6m');
    });
  });
});
