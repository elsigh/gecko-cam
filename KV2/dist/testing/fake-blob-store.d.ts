import { type GetBlobResult, type GetCommandOptions, type ListBlobResult, type ListCommandOptions, type PutBlobResult, type PutCommandOptions } from "@vercel/blob";
import type { BlobStore, PutBody } from "../types.js";
interface StoredBlob {
    pathname: string;
    content: Buffer;
    contentType: string;
    uploadedAt: Date;
    size: number;
    etag: string;
}
export declare class FakeBlobStore implements BlobStore {
    private blobs;
    private locks;
    /**
     * Serialize writes to the same key to prevent race conditions
     * where concurrent callers all pass precondition checks before
     * any write lands.
     */
    private withLock;
    get(pathname: string, _options: GetCommandOptions): Promise<GetBlobResult | null>;
    put(pathname: string, body: PutBody, options: PutCommandOptions): Promise<PutBlobResult>;
    del(urlOrPathname: string | string[]): Promise<void>;
    list(options?: ListCommandOptions): Promise<ListBlobResult>;
    clear(): void;
    has(pathname: string): boolean;
    getContent(pathname: string): Buffer | undefined;
    getAll(): Map<string, StoredBlob>;
}
export {};
//# sourceMappingURL=fake-blob-store.d.ts.map