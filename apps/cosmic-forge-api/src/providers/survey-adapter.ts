import type {
  ForgeCutoutRequest,
  ForgeImageProduct,
  ForgeJob,
} from "../domain/forge.models";

export type ForgeCutoutRequestSource = Pick<
  ForgeJob,
  "ra" | "dec" | "radiusArcmin"
>;

export interface ForgeSurveyAdapter {
  readonly surveyId: string;
  readonly providerName: string;

  buildCutoutRequest(job: ForgeCutoutRequestSource): ForgeCutoutRequest;
  createImageProduct?(
    job: ForgeJob,
    imageId: string,
    accessedAt: string
  ): ForgeImageProduct;
  executeJob?(
    job: ForgeJob,
    imageId: string,
    accessedAt: string
  ): Promise<ForgeImageProduct>;
}
