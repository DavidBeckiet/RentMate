import { fileURLToPath } from "node:url";
import { ProductionApiBaseValidationError, validateProductionApiBase } from "./api-base";

export {
  ProductionApiBaseValidationError,
  validateProductionApiBase,
  validateProductionApiBaseForEnvironment
} from "./api-base";

export function runProductionApiBaseValidationCommand(
  source: Readonly<Record<string, string | undefined>> = process.env
): void {
  try {
    validateProductionApiBase(source.NEXT_PUBLIC_API_BASE_URL);
    process.stdout.write("Frontend production API base validation = PASS\n");
  } catch (error) {
    const message =
      error instanceof ProductionApiBaseValidationError
        ? error.message
        : "Unexpected frontend production API-base validation error.";
    process.stderr.write(`Frontend production API base validation = FAIL: ${message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runProductionApiBaseValidationCommand();
}
