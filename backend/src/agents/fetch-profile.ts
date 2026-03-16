import type { FetchProfileArtifact, HeaderBag, RedirectHop } from '../types.js';
import { config } from '../config.js';

function toHeaderBag(headers: Headers): HeaderBag {
  const result: HeaderBag = {};
  headers.forEach((value, key) => {
    result[key.toLowerCase()] = value;
  });
  return result;
}

async function fetchWithManualRedirects(targetUrl: string): Promise<{
  finalUrl: string;
  finalStatus: number;
  finalHeaders: HeaderBag;
  redirects: RedirectHop[];
}> {
  const redirects: RedirectHop[] = [];
  let current = targetUrl;

  for (let i = 0; i < 10; i += 1) {
    const response = await fetch(current, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'user-agent': config.userAgent,
      },
    });

    const headers = toHeaderBag(response.headers);
    const location = headers.location;

    if (response.status >= 300 && response.status < 400 && location) {
      const nextUrl = new URL(location, current).toString();
      redirects.push({
        from: current,
        to: nextUrl,
        status: response.status,
        location,
      });
      current = nextUrl;
      continue;
    }

    return {
      finalUrl: current,
      finalStatus: response.status,
      finalHeaders: headers,
      redirects,
    };
  }

  throw new Error('Too many redirects');
}

export async function runFetchProfile(targetUrl: string): Promise<FetchProfileArtifact> {
  const { finalUrl, finalStatus, finalHeaders, redirects } = await fetchWithManualRedirects(targetUrl);

  const robotsUrl = new URL('/robots.txt', finalUrl).toString();
  let robotsTxt: FetchProfileArtifact['robotsTxt'];

  try {
    const robotsResponse = await fetch(robotsUrl, {
      method: 'GET',
      headers: {
        'user-agent': config.userAgent,
      },
    });
    const robotsBody = await robotsResponse.text();
    robotsTxt = {
      url: robotsUrl,
      status: robotsResponse.status,
      length: robotsBody.length,
      preview: robotsBody.slice(0, 2000),
    };
  } catch {
    robotsTxt = undefined;
  }

  return {
    initialUrl: targetUrl,
    finalUrl,
    finalStatus,
    redirects,
    headers: finalHeaders,
    contentType: finalHeaders['content-type'] || 'unknown',
    securityHeaders: {
      contentSecurityPolicy: finalHeaders['content-security-policy'],
      strictTransportSecurity: finalHeaders['strict-transport-security'],
      xFrameOptions: finalHeaders['x-frame-options'],
      xContentTypeOptions: finalHeaders['x-content-type-options'],
      referrerPolicy: finalHeaders['referrer-policy'],
      permissionsPolicy: finalHeaders['permissions-policy'],
      crossOriginOpenerPolicy: finalHeaders['cross-origin-opener-policy'],
      crossOriginEmbedderPolicy: finalHeaders['cross-origin-embedder-policy'],
      crossOriginResourcePolicy: finalHeaders['cross-origin-resource-policy'],
    },
    robotsTxt,
  };
}
