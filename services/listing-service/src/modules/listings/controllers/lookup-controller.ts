import type { RequestHandler } from "express";
import { sendObject } from "../../../../../shared/src/runtime/shared/http/responses.js";
import { throwValidationIssue } from "../../../../../shared/src/runtime/shared/validation/issues.js";
import { validateQueryKeys } from "../../../../../shared/src/runtime/shared/validation/request.js";
import { mapAmenityToDto, mapPropertyTypeToDto } from "../mappers/lookup-mapper.js";
import type { LookupRepository } from "../repositories/lookup-repository.js";

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

export function createGetPublicAreasHandler(
  repository: LookupRepository,
  loadActiveLandlordIds: () => Promise<readonly number[]>
): RequestHandler {
  return (request, response, next): void => {
    void (async () => {
      validateQueryKeys(request.query, []);
      validateAbsentBody(request.body);
      const areas = await repository.findPublicAreaNames(await loadActiveLandlordIds());
      sendObject(response, { areas });
    })().catch(next);
  };
}
