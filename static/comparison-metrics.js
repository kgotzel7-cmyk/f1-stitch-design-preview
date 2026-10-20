(function (root) {
  // Only confirmed or corrected classifications enter comparisons and complete statistics.
  const observed = row => Boolean(row?.provenance && ['provider_confirmed', 'corrected'].includes(String(row.provenance).toLowerCase()));
  const usablePosition = row => observed(row) && row.position != null && !['dsq', 'excluded', 'withdrawn', 'unknown'].includes(String(row.status || '').toLowerCase());
  const pair = (left, right) => ({ a: left, b: right });

  function headToHead(sessions, driverA, driverB) {
    let a = 0, b = 0, comparable = 0, tied = 0;
    for (const session of sessions || []) {
      const left = session.results?.[driverA], right = session.results?.[driverB];
      if (!usablePosition(left) || !usablePosition(right)) continue;
      comparable++;
      if (Number(left.position) < Number(right.position)) a++;
      else if (Number(right.position) < Number(left.position)) b++;
      else tied++;
    }
    return { ...pair(comparable ? a : null, comparable ? b : null), comparable, tied, excluded: Math.max(0, (sessions || []).length - comparable) };
  }

  function metrics({ races = [], qualifying = [], sprints = [], sprintExpected = 0, sprintCaptured = 0, driverA, driverB }) {
    const raceH2h = headToHead(races, driverA, driverB);
    const qualifyingH2h = headToHead(qualifying, driverA, driverB);
    const raceStats = [driverA, driverB].map(driver => {
      let wins = 0, podiums = 0, classified = 0, dnf = 0, dns = 0, dsq = 0, knownStatuses = 0;
      for (const race of races) {
        const row = race.results?.[driver];
        if (!observed(row) || !row.status || String(row.status).toLowerCase() === 'unknown') continue;
        knownStatuses++;
        const status = String(row.status).toLowerCase();
        if (status === 'dnf') dnf++;
        if (status === 'dns') dns++;
        if (status === 'dsq') dsq++;
        if (usablePosition(row)) {
          if (status === 'classified') classified++;
          if (Number(row.position) === 1) wins++;
          if (Number(row.position) <= 3) podiums++;
        }
      }
      const complete = races.length > 0 && knownStatuses === races.length;
      return { wins: complete ? wins : null, podiums: complete ? podiums : null,
        classified: complete ? classified : null,
        outcomes: complete ? `${dnf} · ${dns} · ${dsq}` : null };
    });
    const sprintStats = [driverA, driverB].map(driver => {
      let points = 0, wins = 0, podiums = 0, pointsComplete = Number(sprintExpected) > 0
        && Number(sprintCaptured) === Number(sprintExpected) && sprints.length === Number(sprintExpected);
      let positionsComplete = pointsComplete;
      for (const session of sprints) {
        const row = session.results?.[driver];
        if (!observed(row) || row.points == null) { pointsComplete = false; positionsComplete = false; continue; }
        const value = Number(row.points);
        if (!Number.isFinite(value)) { pointsComplete = false; positionsComplete = false; continue; }
        points += value;
        if (!usablePosition(row)) { positionsComplete = false; continue; }
        if (Number(row.position) === 1) wins++;
        if (Number(row.position) <= 3) podiums++;
      }
      return { points: pointsComplete ? points : null, wins: positionsComplete ? wins : null,
        podiums: positionsComplete ? podiums : null };
    });
    const includesProvisional = [...races, ...qualifying, ...sprints].some(session =>
      [driverA, driverB].some(driver => String(session.results?.[driver]?.provenance || '').toLowerCase() === 'provisional'));
    return { raceH2h, qualifyingH2h, raceStats, sprintStats, includesProvisional };
  }

  function headToHeadNote(race, qualifying, raceScheduled = null, qualifyingScheduled = null) {
    const raceCount = Number(race?.comparable || 0);
    const qualifyingCount = Number(qualifying?.comparable || 0);
    const raceTotal = raceScheduled == null ? raceCount + Number(race?.excluded || 0) : Number(raceScheduled);
    const qualifyingTotal = qualifyingScheduled == null ? qualifyingCount + Number(qualifying?.excluded || 0) : Number(qualifyingScheduled);
    const raceTies = Number(race?.tied || 0);
    const qualifyingTies = Number(qualifying?.tied || 0);
    return `Only confirmed or corrected classifications are counted. Race H2H compares ${raceCount} of ${raceTotal} scheduled rounds where both drivers have a usable finishing position; ${Math.max(0, raceTotal - raceCount)} excluded for missing or ambiguous pair results${raceTies ? `, including ${raceTies} tied position${raceTies === 1 ? '' : 's'}` : ''}. Qualifying H2H compares ${qualifyingCount} of ${qualifyingTotal} scheduled sessions where both drivers have a usable qualifying position; ${Math.max(0, qualifyingTotal - qualifyingCount)} excluded for missing or ambiguous pair results${qualifyingTies ? `, including ${qualifyingTies} tied position${qualifyingTies === 1 ? '' : 's'}` : ''}.`;
  }

  function continuousSegments(rows) {
    const segments = [];
    for (const row of rows || []) {
      const previous = segments[segments.length - 1];
      if (!previous || Number(row.round) !== Number(previous[previous.length - 1].round) + 1) segments.push([row]);
      else previous.push(row);
    }
    return segments;
  }

  const api = { metrics, continuousSegments, headToHeadNote };
  root.F1ComparisonMetrics = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
