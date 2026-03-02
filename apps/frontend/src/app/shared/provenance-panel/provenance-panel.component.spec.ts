import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProvenancePanelComponent, ProvenanceInfo } from './provenance-panel.component';
import { CommonModule } from '@angular/common';
import { RouterTestingModule } from '@angular/router/testing';

describe('ProvenancePanelComponent', () => {
  let component: ProvenancePanelComponent;
  let fixture: ComponentFixture<ProvenancePanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ProvenancePanelComponent],
      imports: [CommonModule, RouterTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(ProvenancePanelComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('hasProvenance', () => {
    it('should return true when workflow is provided', () => {
      component.provenance = { workflow: 'test-workflow' };
      expect(component.hasProvenance).toBe(true);
    });

    it('should return true when jobId is provided', () => {
      component.provenance = { jobId: 'job-123' };
      expect(component.hasProvenance).toBe(true);
    });

    it('should return false when no provenance data', () => {
      component.provenance = {};
      expect(component.hasProvenance).toBe(false);
    });

    it('should return false when provenance is undefined', () => {
      component.provenance = undefined;
      expect(component.hasProvenance).toBe(false);
    });
  });

  describe('hasNgvlaParams', () => {
    it('should return true when arraySegment is provided', () => {
      component.provenance = {
        ngvlaParams: {
          arraySegment: 'Main',
        },
      };
      expect(component.hasNgvlaParams).toBe(true);
    });

    it('should return false when ngvlaParams is undefined', () => {
      component.provenance = {};
      expect(component.hasNgvlaParams).toBe(false);
    });

    it('should return false when arraySegment is not provided', () => {
      component.provenance = {
        ngvlaParams: {
          antennaClass: '18m',
        },
      };
      expect(component.hasNgvlaParams).toBe(false);
    });
  });

  describe('rendering', () => {
    it('should not render when no provenance data', () => {
      component.provenance = undefined;
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      const panel = compiled.querySelector('.provenance-panel');
      expect(panel).toBeFalsy();
    });

    it('should render when provenance data exists', () => {
      component.provenance = { workflow: 'test-workflow' };
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      const panel = compiled.querySelector('.provenance-panel');
      expect(panel).toBeTruthy();
    });

    it('should display workflow when provided', () => {
      component.provenance = { workflow: 'imaging-pipeline' };
      component.expanded = true;
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      const workflowValue = compiled.textContent;
      expect(workflowValue).toContain('imaging-pipeline');
    });

    it('should display jobId with link when provided', () => {
      component.provenance = { jobId: 'job-456' };
      component.expanded = true;
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      const link = compiled.querySelector('a[href*="jobs"]');
      expect(link).toBeTruthy();
      expect(link?.textContent).toContain('job-456');
    });

    it('should display sourceDatasetId when provided', () => {
      component.provenance = { workflow: 'test-workflow', sourceDatasetId: 'dataset-789' };
      component.expanded = true;
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent).toContain('dataset-789');
    });

    it('should display processing timestamp when provided', () => {
      component.provenance = { workflow: 'test-workflow', processingTimestamp: '2026-03-01T10:00:00Z' };
      component.expanded = true;
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      const timestamp = compiled.querySelector('.provenance-panel__value');
      expect(timestamp).toBeTruthy();
    });
  });

  describe('ngVLA parameters', () => {
    const ngvlaProvenance: ProvenanceInfo = {
      workflow: 'ngvla-observation',
      jobId: 'job-ngvla-001',
      ngvlaParams: {
        arraySegment: 'Main',
        antennaClass: '18m',
        frequencyBandGHz: { min: 1.2, max: 8.0 },
      },
    };

    beforeEach(() => {
      component.provenance = ngvlaProvenance;
      component.expanded = true;
      fixture.detectChanges();
    });

    it('should display ngVLA parameters section when hasNgvlaParams is true', () => {
      const compiled = fixture.nativeElement as HTMLElement;
      const section = compiled.querySelector('.provenance-panel__section');
      expect(section?.textContent).toContain('ngVLA Observation Parameters');
    });

    it('should display arraySegment badge', () => {
      const compiled = fixture.nativeElement as HTMLElement;
      const badges = compiled.querySelectorAll('.provenance-panel__badge');
      const arraySegmentBadge = Array.from(badges).find(b => b.textContent?.includes('Main'));
      expect(arraySegmentBadge).toBeTruthy();
    });

    it('should display antennaClass badge', () => {
      const compiled = fixture.nativeElement as HTMLElement;
      const badges = compiled.querySelectorAll('.provenance-panel__badge');
      const antennaClassBadge = Array.from(badges).find(b => b.textContent?.includes('18m'));
      expect(antennaClassBadge).toBeTruthy();
    });

    it('should display frequency range', () => {
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent).toContain('1.2 - 8 GHz');
    });
  });

  describe('toggle functionality', () => {
    beforeEach(() => {
      component.provenance = { workflow: 'test-workflow' };
      fixture.detectChanges();
    });

    it('should start collapsed', () => {
      expect(component.expanded).toBe(false);
      const compiled = fixture.nativeElement as HTMLElement;
      const content = compiled.querySelector('.provenance-panel__content');
      expect(content).toBeFalsy();
    });

    it('should expand when header is clicked', () => {
      const compiled = fixture.nativeElement as HTMLElement;
      const header = compiled.querySelector('.provenance-panel__header') as HTMLElement;
      
      header.click();
      fixture.detectChanges();
      
      expect(component.expanded).toBe(true);
      const content = compiled.querySelector('.provenance-panel__content');
      expect(content).toBeTruthy();
    });

    it('should collapse when expanded header is clicked', () => {
      component.expanded = true;
      fixture.detectChanges();
      
      const compiled = fixture.nativeElement as HTMLElement;
      const header = compiled.querySelector('.provenance-panel__header') as HTMLElement;
      
      header.click();
      fixture.detectChanges();
      
      expect(component.expanded).toBe(false);
    });

    it('should toggle chevron icon class', () => {
      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;
      const chevron = compiled.querySelector('.provenance-panel__chevron');
      
      expect(chevron?.classList.contains('provenance-panel__chevron--expanded')).toBe(false);
      
      component.expanded = true;
      fixture.detectChanges();
      
      expect(chevron?.classList.contains('provenance-panel__chevron--expanded')).toBe(true);
    });
  });

  describe('utility methods', () => {
    it('should format frequency range correctly', () => {
      const range = { min: 4.0, max: 8.0 };
      expect(component.formatFrequencyRange(range)).toBe('4 - 8 GHz');
    });

    it('should return N/A for undefined frequency range', () => {
      expect(component.formatFrequencyRange(undefined)).toBe('N/A');
    });

    it('should format parameters as JSON', () => {
      const params = { key1: 'value1', key2: 42 };
      const formatted = component.formatParameters(params);
      expect(formatted).toContain('key1');
      expect(formatted).toContain('value1');
    });

    it('should return "None" for empty parameters', () => {
      expect(component.formatParameters({})).toBe('None');
      expect(component.formatParameters(undefined)).toBe('None');
    });
  });

  describe('complete provenance example', () => {
    const completeProvenance: ProvenanceInfo = {
      workflow: 'imaging-pipeline',
      jobId: 'job-123',
      sourceDatasetId: 'dataset-456',
      processingTimestamp: '2026-03-01T10:00:00Z',
      parameters: {
        resolution: '0.1arcsec',
        threshold: '5sigma',
      },
      ngvlaParams: {
        arraySegment: 'Long Baseline',
        antennaClass: '6m',
        frequencyBandGHz: { min: 70, max: 116 },
      },
    };

    beforeEach(() => {
      component.provenance = completeProvenance;
      component.expanded = true;
      fixture.detectChanges();
    });

    it('should render all provenance fields', () => {
      const compiled = fixture.nativeElement as HTMLElement;
      const text = compiled.textContent || '';
      
      expect(text).toContain('imaging-pipeline');
      expect(text).toContain('job-123');
      expect(text).toContain('dataset-456');
      expect(text).toContain('Long Baseline');
      expect(text).toContain('6m');
      expect(text).toContain('70 - 116 GHz');
    });

    it('should display processing parameters', () => {
      const compiled = fixture.nativeElement as HTMLElement;
      const paramsCode = compiled.querySelector('.provenance-panel__code');
      expect(paramsCode?.textContent).toContain('resolution');
      expect(paramsCode?.textContent).toContain('threshold');
    });

    it('should show reproducible science note in footer', () => {
      const compiled = fixture.nativeElement as HTMLElement;
      const footer = compiled.querySelector('.provenance-panel__footer');
      expect(footer?.textContent).toContain('reproducible science');
    });
  });

  describe('mission linkage validation', () => {
    it('should support mission outcome: Reproducible science', () => {
      component.provenance = {
        workflow: 'test',
        jobId: 'job-1',
      };
      component.expanded = true;
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent).toContain('reproducible science');
    });
  });
});
