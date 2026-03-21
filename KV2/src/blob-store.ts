import {
  type GetBlobResult,
  type GetCommandOptions,
  type ListBlobResult,
  type ListCommandOptions,
  type PutBlobResult,
  type PutCommandOptions,
  del,
  get,
  list,
  put,
} from "@vercel/blob";
import type { BlobStore, PutBody } from "./types.js";

/* c8 ignore start -- thin wrapper over @vercel/blob SDK, tested via integration tests */
export class VercelBlobStore implements BlobStore {
  private token?: string;

  constructor(token?: string) {
    this.token = token;
  }

  async get(
    pathname: string,
    options: GetCommandOptions,
  ): Promise<GetBlobResult | null> {
    return get(pathname, {
      useCache: false,
      ...options,
      token: this.token,
    });
  }

  async put(
    pathname: string,
    body: PutBody,
    options: PutCommandOptions,
  ): Promise<PutBlobResult> {
    return put(pathname, body, {
      ...options,
      token: this.token,
    });
  }

  async del(urlOrPathname: string | string[]): Promise<void> {
    return del(urlOrPathname, {
      token: this.token,
    });
  }

  async list(options?: ListCommandOptions): Promise<ListBlobResult> {
    return list({
      ...options,
      token: this.token,
    });
  }
}
/* c8 ignore stop */
