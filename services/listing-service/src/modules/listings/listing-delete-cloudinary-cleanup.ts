import type { CloudinaryClient } from "../../../../shared/src/runtime/integrations/cloudinary.client.js";
import type { ListingDeleteCleanupHandoff } from "./listing-delete-cleanup.js";

export class ListingDeleteCloudinaryCleanupError extends Error {
  constructor(readonly failureCount: number) {
    super("One or more listing assets could not be removed after database commit.");
    this.name = "ListingDeleteCloudinaryCleanupError";
  }
}

export function createListingDeleteCloudinaryCleanup(cloudinaryClient: CloudinaryClient): ListingDeleteCleanupHandoff {
  return Object.freeze({
    async afterCommittedDelete(publicIds: readonly string[]): Promise<void> {
      const results = await Promise.allSettled(
        publicIds.map((publicId: string) => cloudinaryClient.removeImage(publicId))
      );
      const failureCount = results.filter((result) => result.status === "rejected").length;
      if (failureCount > 0) throw new ListingDeleteCloudinaryCleanupError(failureCount);
    }
  });
}
