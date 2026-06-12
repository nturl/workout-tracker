// Solar position calculation - no external API needed
// Based on NOAA solar calculator algorithms

function toRadians(deg: number): number { return deg * Math.PI / 180; }
function toDegrees(rad: number): number { return rad * 180 / Math.PI; }

interface SunTimes {
  sunrise: Date;
  sunset: Date;
  dayLength: number; // minutes
  goldenHourStart: Date; // evening golden hour
}

export function calculateSunTimes(lat: number, lng: number, date: Date = new Date()): SunTimes {
  const dayOfYear = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000);
  const tzOffset = -date.getTimezoneOffset() / 60;

  // Solar declination
  const declination = toRadians(-23.45 * Math.cos(toRadians(360 / 365 * (dayOfYear + 10))));

  // Equation of time (minutes)
  const b = toRadians(360 / 365 * (dayOfYear - 81));
  const eot = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);

  // Solar noon (hours)
  const solarNoon = 12 - (lng / 15) - (eot / 60) + tzOffset;

  // Hour angle for sunrise/sunset
  const latRad = toRadians(lat);
  const cosHa = (Math.cos(toRadians(90.833)) - Math.sin(latRad) * Math.sin(declination)) /
                (Math.cos(latRad) * Math.cos(declination));

  // Clamp for polar regions
  const ha = toDegrees(Math.acos(Math.max(-1, Math.min(1, cosHa))));
  const haHours = ha / 15;

  const sunriseHour = solarNoon - haHours;
  const sunsetHour = solarNoon + haHours;
  const goldenHourHour = sunsetHour - 1; // ~1 hour before sunset

  const toDate = (hours: number): Date => {
    const d = new Date(date);
    d.setHours(Math.floor(hours), Math.round((hours % 1) * 60), 0, 0);
    return d;
  };

  return {
    sunrise: toDate(sunriseHour),
    sunset: toDate(sunsetHour),
    dayLength: Math.round((sunsetHour - sunriseHour) * 60),
    goldenHourStart: toDate(goldenHourHour),
  };
}

export function formatSunTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export type WorkoutTimeRec = {
  label: string;
  detail: string;
  icon: string;
};

export function getWorkoutTimeRec(sunTimes: SunTimes): WorkoutTimeRec {
  const now = new Date();
  const hoursUntilSunset = (sunTimes.sunset.getTime() - now.getTime()) / 3600000;
  const hoursSinceSunrise = (now.getTime() - sunTimes.sunrise.getTime()) / 3600000;

  if (hoursSinceSunrise < 0) {
    return { label: "Pre-dawn", detail: "Great for fasted cardio or meditation", icon: "🌙" };
  }
  if (hoursSinceSunrise < 2) {
    return { label: "Morning window", detail: "Ideal for Egoscue, breathwork, and light movement", icon: "🌅" };
  }
  if (hoursUntilSunset > 5) {
    return { label: "Midday", detail: "Good for strength or high-intensity work", icon: "☀️" };
  }
  if (hoursUntilSunset > 3) {
    return { label: "Afternoon", detail: "Peak time for strength training - body temp is highest", icon: "🔆" };
  }
  if (hoursUntilSunset > 1) {
    return { label: "Evening", detail: "Wind down - avoid intense exercise within 3hrs of sleep", icon: "🌇" };
  }
  return { label: "After sunset", detail: "Light stretching or recovery only", icon: "🌙" };
}
