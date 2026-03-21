import { type GetBlobResult, type GetCommandOptions, type ListBlobResult, type ListCommandOptions, type PutBlobResult, type PutCommandOptions } from "@vercel/blob";
import type { BlobStore, PutBody } from "../types.js";
export declare class DiskBlobStore implements BlobStore {
    private rootDir;
    private locks;
    constructor(rootDir: string);
    private filePath;
    private metaPath;
    private withLock;
    private readMeta;
    get(pathname: string, _options: GetCommandOptions): Promise<GetBlobResult | null>;
    put(pathname: string, body: PutBody, options: PutCommandOptions): Promise<PutBlobResult>;
    del(urlOrPathname: string | string[]): Promise<void>;
    list(options?: ListCommandOptions): Promise<ListBlobResult>;
    private walkDir;
    clear(): Promise<void>;
    has(pathname: string): Promise<boolean>;
    getContent(pathname: string): Promise<Buffer | undefined>;
}
//# sourceMappingURL=disk-blob-store.d.ts.map