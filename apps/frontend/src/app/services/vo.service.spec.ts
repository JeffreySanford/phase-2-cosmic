import { TestBed } from "@angular/core/testing";
import {
  HttpClientTestingModule,
  HttpTestingController,
} from "@angular/common/http/testing";
import { VoService } from "./vo.service";

describe("VoService", () => {
  let service: VoService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [VoService],
    });
    service = TestBed.inject(VoService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it("fetches VO services", (done) => {
    const mock = {
      tapUrl: "https://tap.example",
      dataLinkUrl: "https://datalink.example",
    };
    service.getServices().subscribe((res) => {
      expect(res.tapUrl).toBe(mock.tapUrl);
      expect(res.dataLinkUrl).toBe(mock.dataLinkUrl);
      done();
    });
    const req = httpMock.expectOne("/api/v1/vo/services");
    expect(req.request.method).toBe("GET");
    req.flush(mock);
  });

  it("provides bundled workflow samples without an HTTP preload", () => {
    expect(service.getSampleForType("vo.cone-search")).toEqual(
      expect.objectContaining({
        provider: "SIMBAD",
        target: "M42",
      })
    );
    httpMock.expectNone("/api/v1/vo/cached-samples");
  });
});
