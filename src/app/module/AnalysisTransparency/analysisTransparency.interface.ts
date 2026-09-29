export interface IObservationQuery {
  source?: string;
  variable?: string;
  startDate?: string;
  endDate?: string;
  page: number;
  pageSize: number;
}

export interface IObservationPage {
  items: Array<{
    id: string;
    source: string;
    observedAt: Date;
    variable: string;
    value: number | null;
    unit: string | null;
    isValid: boolean;
    qualityNote: string | null;
  }>;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}