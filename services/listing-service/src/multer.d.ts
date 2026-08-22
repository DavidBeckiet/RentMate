declare module "multer" {
  interface StorageEngine {}

  interface Options {
    readonly storage?: StorageEngine;
    readonly limits?: Readonly<Record<string, number>>;
  }

  interface Multer {
    single(fieldName: string): import("express").RequestHandler;
  }

  class MulterError extends Error {
    readonly code: string;
    readonly field?: string;

    constructor(code: string, field?: string);
  }

  const createMulter: {
    (options?: Options): Multer;
    memoryStorage(): StorageEngine;
    MulterError: typeof MulterError;
  };

  export default createMulter;
}

declare global {
  namespace Express {
    namespace Multer {
      interface File {
        readonly buffer: Buffer;
        readonly mimetype: string;
        readonly size: number;
      }
    }

    interface Request {
      readonly file?: Multer.File;
    }
  }
}

export {};
