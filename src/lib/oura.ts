import { getTokens, storeTokens, isTokenExpired, type OAuthTokens } from "@/lib/oauthTokens";
import { withRetry } from "@/lib/retry";
import type { RecoveryEntry } from "@/types/workout";

const OURA_AUTH_URL = "https://cloud.ouraring.com/oauth/authorize";
const OURA_TOKEN_URL = "https://api.ouraring.com/oauth/token";
const OURA_API_BASE = "https://api.ouraring.com/v2/usercollection";

export function getOuraAuthUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.OURA_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/oura/callback`,
    scope: "daily heartrate sleep personal",
    state,
  });
  return `${OURA_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
  const res = await fetch(OURA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/oura/callback`,
      client_id: process.env.OURA_CLIENT_ID!,
      client_secret: process.env.OURA_CLIENT_SECRET!,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Oura token exchange failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
  };
}

export async function refreshTokens(tokens: OAuthTokens): Promise<OAuthTokens> {
  const res = await fetch(OURA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
      client_id: process.env.OURA_CLIENT_ID!,
      client_secret: process.env.OURA_CLIENT_SECRET!,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Oura token refresh failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
  };
}

async function getValidTokens(userId: string): Promise<OAuthTokens> {
  const tokens = await getTokens(userId, "oura");
  if (!tokens) throw new Error("No Oura tokens found");

  if (isTokenExpired(tokens)) {
    const refreshed = await withRetry(() => refreshTokens(tokens), { maxRetries: 2 });
    await storeTokens(userId, "oura", refreshed);
    return refreshed;
  }

  return tokens;
}

async function ouraGet(accessToken: string, path: string, params?: Record<string, string>) {
  const url = new URL(`${OURA_API_BASE}/${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Oura API ${path} failed: ${res.status}`);
  }

  return res.json();
}

export async function fetchDailyData(
  userId: string,
  date: string
): Promise<RecoveryEntry["oura"]> {
  const tokens = await getValidTokens(userId);
  const params = { start_date: date, end_date: date };

  const [dailySleepData, readinessData, sleepPeriodsData, spo2Data] = await Promise.all([
    withRetry(() => ouraGet(tokens.accessToken, "daily_sleep", params)),
    withRetry(() => ouraGet(tokens.accessToken, "daily_readiness", params)),
    withRetry(() => ouraGet(tokens.accessToken, "sleep", params)).catch(() => null),
    withRetry(() => ouraGet(tokens.accessToken, "daily_spo2", params)).catch(() => null),
  ]);

  const dailySleep = dailySleepData?.data?.[0];
  const readiness = readinessData?.data?.[0];
  // Use the longest sleep period (main sleep) for raw values
  const sleepPeriods = sleepPeriodsData?.data || [];
  const mainSleep = sleepPeriods.length > 0
    ? sleepPeriods.reduce((longest: Record<string, unknown>, p: Record<string, unknown>) =>
        ((p.total_sleep_duration as number) || 0) > ((longest.total_sleep_duration as number) || 0) ? p : longest, sleepPeriods[0])
    : null;

  const spo2 = spo2Data?.data?.[0];

  if (!dailySleep && !readiness && !mainSleep) return undefined;

  const result: RecoveryEntry["oura"] = {};

  if (readiness) {
    result.readinessScore = readiness.score;
    // temperature_deviation is a raw value (degrees C offset from baseline)
    if (readiness.temperature_deviation != null) {
      result.bodyTemp = readiness.temperature_deviation;
    }
  }

  if (dailySleep) {
    result.sleepScore = dailySleep.score;
    // Contributors are scores (0-100), use for restfulness/timing
    if (dailySleep.contributors) {
      const c = dailySleep.contributors;
      if (c.restfulness != null) {
        result.restfulness = c.restfulness >= 80 ? "Optimal" : c.restfulness >= 60 ? "Good" : "Pay attention";
      }
      if (c.timing != null) {
        result.timing = c.timing >= 80 ? "Optimal" : c.timing >= 60 ? "Good" : "Pay attention";
      }
    }
  }

  // Raw values from sleep periods endpoint
  if (mainSleep) {
    if (mainSleep.total_sleep_duration != null) {
      result.totalSleep = formatDuration(mainSleep.total_sleep_duration as number);
    }
    if (mainSleep.efficiency != null) {
      result.efficiency = mainSleep.efficiency as number;
    }
    if (mainSleep.deep_sleep_duration != null) {
      result.deepSleep = formatDuration(mainSleep.deep_sleep_duration as number);
      if (mainSleep.total_sleep_duration) {
        result.deepSleepPct = Math.round(((mainSleep.deep_sleep_duration as number) / (mainSleep.total_sleep_duration as number)) * 100);
      }
    }
    if (mainSleep.rem_sleep_duration != null) {
      result.remSleep = formatDuration(mainSleep.rem_sleep_duration as number);
      if (mainSleep.total_sleep_duration) {
        result.remSleepPct = Math.round(((mainSleep.rem_sleep_duration as number) / (mainSleep.total_sleep_duration as number)) * 100);
      }
    }
    if (mainSleep.latency != null) {
      result.latency = Math.round((mainSleep.latency as number) / 60); // seconds to minutes
    }
    if (mainSleep.average_hrv != null) {
      result.hrv = Math.round(mainSleep.average_hrv as number);
    }
    if (mainSleep.lowest_heart_rate != null) {
      result.rhr = mainSleep.lowest_heart_rate as number;
    }
    if (mainSleep.average_heart_rate != null) {
      result.averageHR = Math.round(mainSleep.average_heart_rate as number);
    }
    if (mainSleep.average_breath != null) {
      result.respiratoryRate = Math.round((mainSleep.average_breath as number) * 10) / 10;
    }
    if (mainSleep.light_sleep_duration != null) {
      result.lightSleep = formatDuration(mainSleep.light_sleep_duration as number);
      if (mainSleep.total_sleep_duration) {
        result.lightSleepPct = Math.round(((mainSleep.light_sleep_duration as number) / (mainSleep.total_sleep_duration as number)) * 100);
      }
    }
    if (mainSleep.awake_time != null) {
      result.awakeTime = formatDuration(mainSleep.awake_time as number);
    }
    if (mainSleep.time_in_bed != null) {
      result.timeInBed = formatDuration(mainSleep.time_in_bed as number);
    }
  }

  if (spo2?.spo2_percentage?.average != null) {
    result.spo2 = Math.round(spo2.spo2_percentage.average);
  }

  return result;
}

function formatDuration(seconds?: number): string | undefined {
  if (seconds == null) return undefined;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}
