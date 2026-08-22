export interface ListingDeleteCleanupHandoff {
  readonly afterCommittedDelete: (cloudinaryPublicIds: readonly string[]) => Promise<void>;
}

export const noOpListingDeleteCleanupHandoff = Object.freeze<ListingDeleteCleanupHandoff>({
  async afterCommittedDelete(): Promise<void> {
    return undefined;
  }
});
