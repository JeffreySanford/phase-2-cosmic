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
    // Flush the constructor's one-shot cached-samples load
    httpMock.expectOne("/api/v1/vo/cached-samples").flush({});
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
});
