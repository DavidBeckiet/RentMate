import {
  createValidationError,
  type ValidationDetail,
  type ValidationDetailCode
} from "../errors/application-error.js";

export function validationDetail(field: string, code: ValidationDetailCode, message: string): ValidationDetail {
  return Object.freeze({ field, code, message });
}

export class ValidationIssueCollector {
  readonly #issues: ValidationDetail[] = [];

  add(issue: ValidationDetail): void {
    this.#issues.push(Object.freeze({ ...issue }));
  }

  addMany(issues: readonly ValidationDetail[]): void {
    for (const issue of issues) {
      this.add(issue);
    }
  }

  get details(): readonly ValidationDetail[] {
    return Object.freeze(this.#issues.map((issue) => Object.freeze({ ...issue })));
  }

  throwIfAny(): void {
    if (this.#issues.length > 0) {
      throw createValidationError(this.#issues);
    }
  }
}

export function throwValidationIssue(field: string, code: ValidationDetailCode, message: string): never {
  throw createValidationError([validationDetail(field, code, message)]);
}
