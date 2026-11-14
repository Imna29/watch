import type { Serialize } from "nitropack";
import type * as Server from "../../../server/analyses/analyses";

/** The most characters an Analysis may have, after trimming. The server refuses more; the page counts down to it. */
export const ANALYSIS_TEXT_MAX_LENGTH = 2000;

/** The lowest Grade. Below zero is room for a reading worse than none. */
export const GRADE_MIN = -1;
/** The highest Grade. */
export const GRADE_MAX = 10;
/** The most characters a Grade's remark may have, after trimming. */
export const GRADE_REMARK_MAX_LENGTH = 500;

// The API's JSON of the server's types (`server/analyses/analyses.ts`), as
// Nitro types a JSON response: dates become ISO strings.

/** A movie's Analysis as the API returns it. */
export type Analysis = Serialize<Server.Analysis>;

/** `GET /api/analyses`: every Analysis, with the average Grade and the count to grade. */
export type AnalysisList = Serialize<Server.AnalysisListResponse>;
