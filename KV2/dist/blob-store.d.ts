import { type GetBlobResult, type GetCommandOptions, type ListBlobResult, type ListCommandOptions, type PutBlobResult, type PutCommandOptions } from "@vercel/blob";
import type { BlobStore, PutBody } from "./types.js";
export declare class VercelBlobStore implements BlobStore {
    private token?;
    constructor(token?: string);
    get(pathname: string, options: GetCommandOptions): Promise<GetBlobResult | null>;
    put(pathname: string, body: PutBody, options: PutCommandOptions): Promise<PutBlobResult>;
    del(urlOrPathname: string | string[]): Promise<void>;
    list(options?: ListCommandOptions): Promise<ListBlobResult>;
}
//# sourceMappingURL=blob-store.d.ts.map