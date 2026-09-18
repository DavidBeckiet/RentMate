import type { Response } from "express";

export type ObjectSuccessStatus = 200 | 201;

export interface PaginationMetadata {
  readonly page: number;
  readonly pageSize: number;
  readonly hasNextPage: boolean;
}

export type PaginatedResponseMetadata = Readonly<Record<string, unknown>>;

export function sendObject<ResponseData>(
  response: Response,
  data: ResponseData,
  status: ObjectSuccessStatus = 200
): void {
  response.status(status).json({ data });
}

export function sendPaginated<ResponseData>(
  response: Response,
  data: readonly ResponseData[],
  pagination: PaginationMetadata,
  status: ObjectSuccessStatus = 200,
  metadata?: PaginatedResponseMetadata
): void {
  response.status(status).json({
    data,
    pagination: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      hasNextPage: pagination.hasNextPage
    },
    ...(metadata === undefined ? {} : { metadata })
  });
}

export function sendNoContent(response: Response): void {
  response.status(204).end();
}
