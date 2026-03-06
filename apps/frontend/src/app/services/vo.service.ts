import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";

export interface VoServices {
  tapUrl?: string;
  dataLinkUrl?: string;
}

@Injectable({ providedIn: "root" })
export class VoService {
  constructor(private http: HttpClient) {}

  getServices(): Observable<VoServices> {
    return this.http.get<VoServices>("/api/v1/vo/services");
  }
}
