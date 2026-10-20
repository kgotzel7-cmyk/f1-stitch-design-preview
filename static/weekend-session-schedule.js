(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.F1WeekendSessionSchedule = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const validTimeZone = (candidate, intl = Intl) => {
    if (typeof candidate !== 'string' || !candidate.trim()) return false;
    try {
      new intl.DateTimeFormat('en-GB', { timeZone: candidate });
      return true;
    } catch (_) {
      return false;
    }
  };

  const resolveDeviceTimeZone = (intl = Intl) => {
    try {
      const candidate = intl.DateTimeFormat().resolvedOptions().timeZone;
      if (validTimeZone(candidate, intl)) return { timeZone: candidate, usedUtcFallback: false };
    } catch (_) {
      // Fall through to UTC and let the presentation identify this exceptional case.
    }
    return { timeZone: 'UTC', usedUtcFallback: true };
  };

  const deviceTimeZone = (intl = Intl) => resolveDeviceTimeZone(intl).timeZone;

  const localDateKey = (date, formatter) => {
    const parts = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };

  const groupSessions = (schedule, options = {}) => {
    const intl = options.intl || Intl;
    const detected = options.timeZone == null
      ? resolveDeviceTimeZone(intl)
      : {
          timeZone: validTimeZone(options.timeZone, intl) ? options.timeZone : 'UTC',
          usedUtcFallback: !validTimeZone(options.timeZone, intl),
        };
    const timeZone = detected.timeZone;
    const dayFormatter = new intl.DateTimeFormat('en-GB', {
      timeZone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
    const keyFormatter = new intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    });
    const timeFormatter = new intl.DateTimeFormat('en-GB', {
      timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
    const grouped = new Map();
    const unavailable = [];

    for (const source of schedule?.sessions || []) {
      const session = { ...source };
      const timestamp = typeof session.scheduled_at === 'string' ? Date.parse(session.scheduled_at) : NaN;
      if (!Number.isFinite(timestamp)) {
        session.scheduled_time = null;
        unavailable.push(session);
        continue;
      }
      const instant = new Date(timestamp);
      const key = localDateKey(instant, keyFormatter);
      session.scheduled_time = timeFormatter.format(instant);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push({ timestamp, session });
    }

    const days = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, rows]) => {
      rows.sort((a, b) => a.timestamp - b.timestamp || String(a.session.id).localeCompare(String(b.session.id)));
      return {
        date,
        label: dayFormatter.format(new Date(rows[0].timestamp)),
        sessions: rows.map(row => row.session),
      };
    });
    if (unavailable.length) {
      unavailable.sort((a, b) => String(a.name).localeCompare(String(b.name)) || String(a.id).localeCompare(String(b.id)));
      days.push({ date: null, label: 'Date unavailable', sessions: unavailable });
    }
    return { timeZone, timeZoneFallback: detected.usedUtcFallback, days };
  };

  return Object.freeze({ deviceTimeZone, groupSessions, validTimeZone });
});
