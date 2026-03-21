import { del, get, list, put, } from "@vercel/blob";
/* c8 ignore start -- thin wrapper over @vercel/blob SDK, tested via integration tests */
export class VercelBlobStore {
    token;
    constructor(token) {
        this.token = token;
    }
    async get(pathname, options) {
        return get(pathname, {
            useCache: false,
            ...options,
            token: this.token,
        });
    }
    async put(pathname, body, options) {
        return put(pathname, body, {
            ...options,
            token: this.token,
        });
    }
    async del(urlOrPathname) {
        return del(urlOrPathname, {
            token: this.token,
        });
    }
    async list(options) {
        return list({
            ...options,
            token: this.token,
        });
    }
}
/* c8 ignore stop */
//# sourceMappingURL=blob-store.js.map