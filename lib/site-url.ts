export function getAppUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.VERCEL_URL;

  if (!url) return "https://gecko-cam.vercel.app";
  return url.startsWith("http") ? url : `https://${url}`;
}
