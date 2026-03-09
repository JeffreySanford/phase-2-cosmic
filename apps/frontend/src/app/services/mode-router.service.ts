export type JobMode =
  | "VLBI"
  | "PULSAR_TIMING"
  | "PULSAR_SEARCH"
  | "CORRELATION";

export interface Template {
  name: string;
  content: string;
}

export class ModeRouterService {
  private templates: Record<JobMode, Template> = {
    VLBI: { name: "vlbi-template", content: "vlbi payload {{params}}" },
    PULSAR_TIMING: {
      name: "pulsar-timing-template",
      content: "timing payload {{params}}",
    },
    PULSAR_SEARCH: {
      name: "pulsar-search-template",
      content: "search payload {{params}}",
    },
    CORRELATION: {
      name: "correlation-template",
      content: "correlation payload {{params}}",
    },
  };

  selectTemplate(mode: JobMode): Template {
    const tmpl = this.templates[mode];
    if (!tmpl) {
      throw new Error(`unsupported mode: ${mode}`);
    }
    return tmpl;
  }
}
