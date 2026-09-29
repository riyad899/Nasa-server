import { z } from "zod";

const isoDate = z.string().date();

export const observationQuerySchema = z.object({
  source: z.string().trim().min(1).optional(),
  variable: z.string().trim().min(1).optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
}).superRefine((value, context) => {
  if (value.startDate && value.endDate && value.startDate > value.endDate) {
    context.addIssue({ code: "custom", path: ["startDate"], message: "startDate must not be after endDate" });
  }
});

export const AnalysisTransparencyValidation = { observationQuerySchema };