import { describe, expect, it } from "vitest";
import { validateListingImageOrder } from "../src/modules/listings/listing-image-order-validation.js";

async function expectValidation(value: unknown): Promise<void> {
  await expect(Promise.resolve().then(() => validateListingImageOrder(value))).rejects.toMatchObject({
    code: "VALIDATION_FAILED"
  });
}

describe("RM-031 listing image-order validation", () => {
  it.each([[[]], [[1]], [[1, 2]], [[1, 2, 3, 4, 5, 6, 7, 2_147_483_647]]])(
    "accepts the immutable unique image ID array %j",
    (imageIds) => {
      const input = { imageIds: [...imageIds] };
      const result = validateListingImageOrder(input);
      expect(result).toStrictEqual({ imageIds });
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.imageIds)).toBe(true);
      expect(input).toStrictEqual({ imageIds });
    }
  );

  it.each([
    undefined,
    null,
    [],
    "body",
    1,
    true,
    {},
    { imageIds: null },
    { imageIds: {} },
    { imageIds: "1" },
    { imageIds: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
    { imageIds: [1, 1] },
    { imageIds: [0] },
    { imageIds: [-1] },
    { imageIds: [1.5] },
    { imageIds: [2_147_483_648] },
    { imageIds: ["1"] },
    { imageIds: [null] },
    { imageIds: [{}] },
    { imageIds: [[]] },
    { imageIds: [], status: "APPROVED" },
    { imageIds: [], cloudinaryPublicId: "private" }
  ])("rejects malformed body %j", async (value) => {
    await expectValidation(value);
  });
});
