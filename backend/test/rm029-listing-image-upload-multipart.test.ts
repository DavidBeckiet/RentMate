import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { ApplicationError } from "../src/shared/errors/application-error.js";
import { listingImageUploadMultipartMiddleware } from "../src/modules/listings/listing-image-upload-multipart.js";
import {
  maximumListingImageBytes,
  validateListingImageUpload
} from "../src/modules/listings/listing-image-upload-validation.js";

const signatures = {
  jpeg: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
  png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  webp: Buffer.from("RIFF0000WEBP", "ascii")
} as const;

function app() {
  const application = express();
  application.post("/upload", listingImageUploadMultipartMiddleware, (req, res, next) => {
    try {
      const upload = validateListingImageUpload(req.file, req.body);
      res.status(200).json({ mimeType: upload.mimeType, altText: upload.altText, size: upload.buffer.length });
    } catch (error) {
      next(error);
    }
  });
  application.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    void _next;
    if (error instanceof ApplicationError) {
      res.status(error.status).json({ code: error.code, message: error.message, details: error.details });
      return;
    }
    res.status(500).json({ code: "INTERNAL_SERVER_ERROR" });
  });
  return application;
}

describe("RM-029 listing image multipart and validation", () => {
  it.each([
    ["jpeg", "image/jpeg"],
    ["png", "image/png"],
    ["webp", "image/webp"]
  ] as const)("accepts a valid %s image", async (format, mimeType) => {
    const response = await request(app())
      .post("/upload")
      .attach("image", signatures[format], {
        filename: `image.${format}`,
        contentType: mimeType
      });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ mimeType, altText: null });
  });

  it("normalizes omitted, blank, trimmed, and Unicode-bounded altText", async () => {
    const omitted = await request(app()).post("/upload").attach("image", signatures.jpeg, {
      filename: "image.jpg",
      contentType: "image/jpeg"
    });
    expect(omitted.body.altText).toBeNull();

    for (const [input, expected] of [
      ["   ", null],
      ["  Living room  ", "Living room"],
      ["😀".repeat(255), "😀".repeat(255)]
    ] as const) {
      const response = await request(app())
        .post("/upload")
        .field("altText", input)
        .attach("image", signatures.jpeg, { filename: "image.jpg", contentType: "image/jpeg" });
      expect(response.status).toBe(200);
      expect(response.body.altText).toBe(expected);
    }

    const tooLong = await request(app())
      .post("/upload")
      .field("altText", "😀".repeat(256))
      .attach("image", signatures.jpeg, { filename: "image.jpg", contentType: "image/jpeg" });
    expect(tooLong.status).toBe(422);
    expect(tooLong.body.code).toBe("VALIDATION_FAILED");
  });

  it("accepts exactly 5242880 bytes and rejects one byte more during parsing", async () => {
    const exact = Buffer.alloc(maximumListingImageBytes);
    signatures.jpeg.copy(exact);
    const accepted = await request(app()).post("/upload").attach("image", exact, {
      filename: "exact.jpg",
      contentType: "image/jpeg"
    });
    expect(accepted.status).toBe(200);
    expect(accepted.body.size).toBe(maximumListingImageBytes);

    const over = Buffer.alloc(maximumListingImageBytes + 1);
    signatures.jpeg.copy(over);
    const rejected = await request(app()).post("/upload").attach("image", over, {
      filename: "over.jpg",
      contentType: "image/jpeg"
    });
    expect(rejected.status).toBe(413);
    expect(rejected.body).toMatchObject({ code: "PAYLOAD_TOO_LARGE", message: "The request payload is too large." });
  });

  it.each([
    ["image/jpeg", signatures.png],
    ["image/png", signatures.webp],
    ["image/gif", signatures.jpeg],
    ["image/jpeg", Buffer.from("not an image")]
  ] as const)("rejects declared type %s when content is unsupported or mismatched", async (mimeType, buffer) => {
    const response = await request(app()).post("/upload").attach("image", buffer, {
      filename: "image.bin",
      contentType: mimeType
    });
    expect(response.status).toBe(415);
    expect(response.body).toMatchObject({
      code: "UNSUPPORTED_IMAGE_TYPE",
      message: "The image must be JPEG, PNG, or WebP and its declared type must match its content."
    });
  });

  it("rejects missing, multiple, and unknown file fields", async () => {
    const missing = await request(app()).post("/upload").field("altText", "room");
    expect(missing.status).toBe(422);
    expect(missing.body.details[0]).toMatchObject({ field: "image", code: "REQUIRED" });

    const multiple = await request(app())
      .post("/upload")
      .attach("image", signatures.jpeg, { filename: "a.jpg", contentType: "image/jpeg" })
      .attach("image", signatures.jpeg, { filename: "b.jpg", contentType: "image/jpeg" });
    expect(multiple.status).toBe(422);

    const unknown = await request(app()).post("/upload").attach("photo", signatures.jpeg, {
      filename: "a.jpg",
      contentType: "image/jpeg"
    });
    expect(unknown.status).toBe(422);
  });

  it("rejects unknown and repeated text fields", async () => {
    const unknown = await request(app())
      .post("/upload")
      .field("caption", "x")
      .attach("image", signatures.jpeg, { filename: "a.jpg", contentType: "image/jpeg" });
    expect(unknown.status).toBe(422);
    expect(unknown.body.details[0]).toMatchObject({ field: "caption", code: "UNKNOWN_FIELD" });

    const repeated = await request(app())
      .post("/upload")
      .field("altText", "a")
      .field("altText", "b")
      .attach("image", signatures.jpeg, { filename: "a.jpg", contentType: "image/jpeg" });
    expect(repeated.status).toBe(422);
  });

  it("maps malformed multipart syntax to MALFORMED_REQUEST", async () => {
    const response = await request(app())
      .post("/upload")
      .set("Content-Type", "multipart/form-data; boundary=broken")
      .send('--broken\r\nContent-Disposition: form-data; name="image"; filename="a.jpg"\r\n');
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("MALFORMED_REQUEST");
  });
});
