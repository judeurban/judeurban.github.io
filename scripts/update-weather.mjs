import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const API_ROOT = "https://api.openweathermap.org/data/4.0/onecall/timeline/1day";
const ZIP_API_ROOT = "https://api.openweathermap.org/geo/1.0/zip";
const MAX_PAGES = 64;
const FORECAST_UNAVAILABLE = "Forecast will be available closer to the event date";

function parseFrontMatter(text) {
  const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (!match) throw new Error("Event markdown is missing front matter");
  const metadata = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator !== -1) metadata[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return metadata;
}

function dateAtTimezone(timestamp, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp * 1000));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function todayAtTimezone(timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function forecastKey(zip, date) {
  return `${zip}:${date}`;
}

function buildRequestUrl(latitude, longitude, apiKey, start, count) {
  const url = new URL(API_ROOT);
  url.searchParams.set("lat", latitude);
  url.searchParams.set("lon", longitude);
  url.searchParams.set("units", "imperial");
  url.searchParams.set("appid", apiKey);
  if (start) url.searchParams.set("start", start);
  if (count) url.searchParams.set("cnt", count);
  return url;
}

async function geocodeZip(zip, apiKey) {
  const url = new URL(ZIP_API_ROOT);
  url.searchParams.set("zip", `${zip},US`);
  url.searchParams.set("appid", apiKey);

  let response;
  try {
    response = await fetch(url, { redirect: "error" });
  } catch {
    throw new Error("OpenWeather ZIP lookup network request failed");
  }
  if (!response.ok) throw new Error(`OpenWeather ZIP lookup failed with HTTP ${response.status}`);

  const location = await response.json();
  if (location.country !== "US" || !Number.isFinite(location.lat) || !Number.isFinite(location.lon)) {
    throw new Error(`OpenWeather returned invalid coordinates for ZIP ${zip}`);
  }
  return { latitude: location.lat, longitude: location.lon };
}

async function fetchForecast(latitude, longitude, date, apiKey) {
  let requestUrl = buildRequestUrl(latitude, longitude, apiKey);
  const visitedStarts = new Set();

  for (let page = 0; page < MAX_PAGES; page += 1) {
    let response;
    try {
      response = await fetch(requestUrl, { redirect: "error" });
    } catch {
      throw new Error("OpenWeather API network request failed");
    }
    if (!response.ok) throw new Error(`OpenWeather API request failed with HTTP ${response.status}`);

    const payload = await response.json();
    if (!Array.isArray(payload.data)) throw new Error("OpenWeather returned an invalid forecast response");
    const timeZone = payload.timezone || "America/Chicago";
    const matchingDay = payload.data.find(day => dateAtTimezone(day.dt, timeZone) === date);
    if (matchingDay) {
      const condition = matchingDay.weather && matchingDay.weather[0];
      return {
        available: true,
        description: condition && condition.description || "Forecast available",
        high: matchingDay.temp && matchingDay.temp.max,
        low: matchingDay.temp && matchingDay.temp.min,
        rain: typeof matchingDay.pop === "number" ? Math.round(matchingDay.pop * 100) : null,
        wind: typeof matchingDay.wind_speed === "number" ? Math.round(matchingDay.wind_speed) : null,
      };
    }

    if (!payload.next) return null;
    let nextUrl;
    try {
      nextUrl = new URL(payload.next, API_ROOT);
    } catch {
      throw new Error("OpenWeather returned an invalid pagination URL");
    }
    const start = nextUrl.searchParams.get("start");
    const count = nextUrl.searchParams.get("cnt");
    if (!/^\d+$/.test(start || "") || (count && (!/^\d+$/.test(count) || Number(count) > 10))) {
      throw new Error("OpenWeather returned invalid pagination parameters");
    }
    if (visitedStarts.has(start)) return null;
    visitedStarts.add(start);
    requestUrl = buildRequestUrl(latitude, longitude, apiKey, start, count || undefined);
  }

  throw new Error("OpenWeather forecast pagination limit exceeded");
}

async function generateWeatherSnapshot(outputPath) {
  let apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) {
    try {
      const localSecret = (await readFile(".secrets", "utf8")).trim();
      const assignment = localSecret.match(/^([A-Za-z_][A-Za-z0-9_ -]*)=([A-Za-z0-9_-]{16,128})$/);
      const rawKey = localSecret.match(/^([A-Za-z0-9_-]{16,128})$/);
      const label = assignment && assignment[1].replace(/[^A-Za-z]/g, "");
      if (assignment && /weather.*key/i.test(label)) {
        apiKey = assignment[2];
      } else if (rawKey) {
        apiKey = rawKey[1];
      } else {
        throw new Error("Local .secrets must contain a single OpenWeather API key line");
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  if (!apiKey) throw new Error("OPENWEATHER_API_KEY is required");

  const eventFiles = JSON.parse(await readFile("events/events.json", "utf8"));
  const forecasts = {};
  const locations = new Map();
  const requests = new Map();

  for (const eventFile of eventFiles) {
    const metadata = parseFrontMatter(await readFile(resolve("events", eventFile), "utf8"));
    const { weatherDate: date, weatherZip: zip } = metadata;
    if (!date || !/^\d{5}$/.test(zip || "")) throw new Error(`Missing or invalid weather metadata in ${eventFile}`);

    const key = forecastKey(zip, date);
    if (forecasts[key]) continue;
    if (date < todayAtTimezone("America/Chicago")) {
      forecasts[key] = { available: false, message: "Forecasts are no longer available for this date" };
      continue;
    }

    if (!locations.has(zip)) locations.set(zip, geocodeZip(zip, apiKey));
    const { latitude, longitude } = await locations.get(zip);

    if (!requests.has(key)) {
      requests.set(key, fetchForecast(latitude, longitude, date, apiKey));
    }
    const forecast = await requests.get(key);
    forecasts[key] = forecast || { available: false, message: FORECAST_UNAVAILABLE };
  }

  const snapshot = { generatedAt: new Date().toISOString(), forecasts };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o644 });
}

const outputPath = process.argv[2];
if (!outputPath) {
  console.error("Usage: node scripts/update-weather.mjs <output-file>");
  process.exitCode = 1;
} else {
  generateWeatherSnapshot(resolve(outputPath)).catch(error => {
    console.error(`Weather snapshot generation failed: ${error.message}`);
    process.exitCode = 1;
  });
}