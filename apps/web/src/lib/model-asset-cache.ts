const MODEL_ASSET_CACHE = "3dagent-model-assets-v1";

export type CachedModelBlob = {
  blob: Blob;
  fromCache: boolean;
};

function canUseCacheStorage() {
  return typeof caches !== "undefined";
}

function cacheRequestFor(url: string) {
  return new Request(url, { method: "GET" });
}

async function errorMessageFromResponse(response: Response) {
  const body = await response.json().catch(() => null);
  return body?.detail ?? `模型预览加载失败：HTTP ${response.status}`;
}

export async function loadCachedModelBlob(
  url: string,
  init: RequestInit,
): Promise<CachedModelBlob> {
  const cache = canUseCacheStorage() ? await caches.open(MODEL_ASSET_CACHE) : null;
  const cacheRequest = cacheRequestFor(url);
  const cachedResponse = await cache?.match(cacheRequest);

  if (cachedResponse?.ok) {
    return {
      blob: await cachedResponse.blob(),
      fromCache: true,
    };
  }

  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(await errorMessageFromResponse(response));
  }

  if (cache && response.status === 200) {
    await cache.put(cacheRequest, response.clone());
  }

  return {
    blob: await response.blob(),
    fromCache: false,
  };
}
