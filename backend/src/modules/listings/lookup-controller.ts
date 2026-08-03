import type { RequestHandler } from "express";
import { sendObject } from "../../shared/http/responses.js";
import { throwValidationIssue } from "../../shared/validation/issues.js";
import { validateQueryKeys } from "../../shared/validation/request.js";
import { mapAmenityToDto, mapPropertyTypeToDto } from "./lookup-mapper.js";
import type { LookupRepository } from "./lookup-repository.js";

function validateAbsentBody(value: unknown): void {
  if (value !== undefined) {
    throwValidationIssue("body", "INVALID_VALUE", "body must be omitted.");
  }
}

export function createGetPropertyTypesHandler(repository: LookupRepository): RequestHandler {
  return (request, response, next): void => {
    void (async () => {
      validateQueryKeys(request.query, []);
      validateAbsentBody(request.body);
      const values = await repository.findActivePropertyTypes();
      sendObject(response, values.map(mapPropertyTypeToDto));
    })().catch(next);
  };
}

export function createGetAmenitiesHandler(repository: LookupRepository): RequestHandler {
  return (request, response, next): void => {
    void (async () => {
      validateQueryKeys(request.query, []);
      validateAbsentBody(request.body);
      const values = await repository.findActiveAmenities();
      sendObject(response, values.map(mapAmenityToDto));
    })().catch(next);
  };
}
