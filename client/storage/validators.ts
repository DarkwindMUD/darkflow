import typia from "typia";

import {
  parseApplicationState,
  validateApplicationState,
  type ValidationResult,
} from "../model/validators";
import type { ApplicationStateV1 } from "../model/profiles";
import type { MigrationProvenance } from "./schema";

export const validateMigrationProvenance = typia.createValidate<MigrationProvenance>();
export const parseMigrationProvenance = typia.json.createValidateParse<MigrationProvenance>();

export { parseApplicationState, validateApplicationState, type ValidationResult };
export type { ApplicationStateV1 };
