import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable, BehaviorSubject } from "rxjs";

export interface VoServices {
  tapUrl?: string;
  dataLinkUrl?: string;
}

@Injectable({ providedIn: "root" })
export class VoService {
  private static readonly DEFAULT_WORKFLOW_SAMPLES: Record<
    string,
    Record<string, unknown>
  > = {
    "vo.cone-search": {
      provider: "SIMBAD",
      serviceUrl: "https://simbad.cds.unistra.fr/simbad/sim-tap/sync",
      target: "M42",
      ra: 83.8221,
      dec: -5.3911,
      radius: 0.5,
      format: "votable",
      liveMode: true,
      _description: "Cone search around Orion Nebula (M42), radius 0.5 deg",
    },
    "vo.adql.query": {
      provider: "HEASARC",
      tapUrl: "https://heasarc.gsfc.nasa.gov/xamin/tap/sync",
      adql: "SELECT TOP 10 target_name, ra, dec, exposure FROM chanmaster ORDER BY exposure DESC",
      limit: 10,
      liveMode: true,
      _description: "Top 10 longest Chandra observations (HEASARC TAP)",
    },
    "vo.obscore.search": {
      provider: "ESO",
      tapUrl: "https://archive.eso.org/tap_obs/sync",
      dataproductType: "image",
      spatialBoundsRa: 187.277915,
      spatialBoundsDec: 2.052389,
      spatialBoundsRadius: 0.5,
      limit: 20,
      liveMode: true,
      _description: "ESO ObsCore image search around quasar 3C 273 (r=0.5 deg)",
    },
    "vo.votable.fetch": {
      provider: "HEASARC",
      votableUrl:
        "https://heasarc.gsfc.nasa.gov/xamin/query?table=chanmaster&position=3c273&format=votable",
      format: "votable",
      liveMode: true,
      _description: "Chandra observations of quasar 3C 273 as VOTable",
    },
    "vo.datalink.resolve": {
      provider: "CADC",
      datalinkUrl:
        "https://ws.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/caom2ops/datalink",
      datasetIdentifier: "ivo://cadc.nrc.ca/CFHT?2459817",
      liveMode: true,
      _description: "DataLink products for CFHT MegaCam observation 2459817",
    },
    "vo.product.fetch": {
      provider: "HEASARC",
      productUrl:
        "https://heasarc.gsfc.nasa.gov/FTP/chandra/data/byobsid/2/21843/primary/acisf21843N002_evt2.fits.gz",
      expectedMimeType: "application/fits",
      liveMode: true,
      _description:
        "Chandra ACIS event file for Cas A supernova remnant (obs 21843)",
    },
    "vo.soda.cutout": {
      provider: "CADC",
      sodaUrl: "https://ws.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/caom2ops/soda",
      datasetIdentifier: "ivo://cadc.nrc.ca/CFHT?2459817",
      spatialBoundsRa: 187.277915,
      spatialBoundsDec: 2.052389,
      spatialBoundsRadius: 0.1,
      outputFormat: "fits",
      liveMode: true,
      _description:
        "CADC SODA cutout centered on 3C 273 (r=0.1 deg, CFHT obs 2459817)",
    },
    "vo.preview.fetch": {
      provider: "ESASky",
      previewUrl:
        "https://sky.esa.int/esasky-tap/tap/sync?REQUEST=doQuery&LANG=ADQL&FORMAT=votable&QUERY=SELECT+TOP+5+*+FROM+mv_xsa_obs+WHERE+target_name+LIKE+%2527%2525Crab%2525%2527",
      liveMode: true,
      _description:
        "ESASky XMM-Newton observations matching 'Crab' target (top 5)",
    },
  };

  // Sparkline samples consumed by TelemetryComponent (populated externally)
  voSamples$ = new BehaviorSubject<
    Array<{ time: string; valueHuman: string; pct: number }>
  >([]);
  voLoading$ = new BehaviorSubject<boolean>(false);

  private _workflowSamples: Record<string, Record<string, unknown>> = {
    ...VoService.DEFAULT_WORKFLOW_SAMPLES,
  };

  constructor(private http: HttpClient) {}

  /** Returns a curated sample payload for the given VO workflow type, or null. */
  getSampleForType(type: string): Record<string, unknown> | null {
    return this._workflowSamples[type] ?? null;
  }

  getServices(): Observable<VoServices> {
    return this.http.get<VoServices>("/api/v1/vo/services");
  }

  // lightweight human-readable formatting reused by service
  private humanRate(v: number) {
    if (!isFinite(v)) return "0";
    if (v === 0) return "0 B/s";
    const abs = Math.abs(v);
    const units = ["B/s", "KB/s", "MB/s", "GB/s"];
    let i = 0;
    let val = abs;
    while (val >= 1024 && i < units.length - 1) {
      val /= 1024;
      i++;
    }
    return `${v < 0 ? "-" : ""}${val.toFixed(2)} ${units[i]}`;
  }
}
