(() => {
  const root = document.querySelector('#f1-compare-wireframe');
  if (!root) return;
  root.style.visibility = 'hidden';

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const unavailable = 'Unavailable';
  const formatPoints = value => {
    if (value == null) return unavailable;
    const text = String(value);
    return text.includes('.') ? text.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') : text;
  };
  const standingsSourceDescription = (source, available = true) => {
    if (!available || !source) return 'Championship standings unavailable because no verified standings source is stored.';
    if (['official_reconciled', 'official_no_calculated_run', 'official'].includes(source)) return 'Official championship standings.';
    if (['calculated_fallback', 'calculated'].includes(source)) return 'Calculated from persisted race and Sprint results; not an official championship classification.';
    return 'Championship standings unavailable because their source could not be verified.';
  };
  const byId = id => root.querySelector(`#${id}`);
  const set = (id, value) => { const el = byId(id); if (el) el.textContent = value == null || value === '' ? unavailable : String(value); };
  const setProfileNumber = number => {
    const numberHero = byId('f1-profile-number');
    if (!numberHero) return;
    const visible = number != null && String(number).trim() !== '';
    numberHero.hidden = !visible;
    numberHero.textContent = visible ? `#${number}` : '';
    numberHero.closest('.f1-profile-hero')?.classList.toggle('is-number-hidden', !visible);
  };
  const fetchJson = async path => {
    const response = await fetch(path, { headers: { Accept: 'application/json' } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Persisted app data is unavailable.');
    return data;
  };
  const teamColors = {
    'McLaren': ['#FF8000', '#ffffff'], 'Ferrari': ['#E8002D', '#ffffff'],
    'Mercedes': ['#27F4D2', '#102521'], 'Red Bull Racing': ['#3671C6', '#ffffff'],
    'Aston Martin': ['#229971', '#ffffff'], 'Alpine': ['#00A1E8', '#ffffff'],
    'Williams': ['#1868DB', '#ffffff'], 'Racing Bulls': ['#6692FF', '#17191d'],
    'Haas F1 Team': ['#DEE1E2', '#17191d'], 'Audi': ['#FF2D00', '#ffffff'],
    'Cadillac': ['#AAAAAD', '#17191d'], 'Kick Sauber': ['#52E252', '#102510']
  };
  const app = { seasons: [], standings: new Map(), calendars: new Map(), follows: [], circuits: [] };
  let screen = 'home', selectedSeason = '', selectedCircuit = '';
  const detailNavigationStack = [];
  let selectedDriverA = '', selectedDriverB = '', selectedDriverId = '', selectedTeamId = '';
  let selectedTeamCompareDrivers = [];
  let driverProfileRequest = 0, careerView = 'seasons';
  let homeRecentResultsRequest = 0;
  let comparisonRoundRows = null, comparisonRoundsExpanded = false;
  let comparisonRequest = 0;
  let standingsMode = 'drivers', gapMode = 'ahead';
  const season = id => app.seasons.find(item => item.id === id);
  const byYear = year => app.seasons.find(item => String(item.year) === String(year));
  const currentSeason = () => season(selectedSeason) || app.seasons[0];
  const comparisonSelectionIsCurrent = (requestId, latestRequestId, requested, current) =>
    requestId === latestRequestId
    && requested.seasonId === current.seasonId
    && requested.circuit === current.circuit
    && requested.driverA === current.driverA
    && requested.driverB === current.driverB;
  const idForTeam = (name, inSeason = currentSeason()) => inSeason?.teams.find(item => item.name.toLowerCase() === String(name).toLowerCase())?.id;
  const ordinal = value => {
    if (!value) return unavailable;
    const mod = value % 100;
    return `${value}${mod >= 11 && mod <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[value % 10] || 'th')}`;
  };
  const dateRange = event => {
    const dateParts = value => {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
      if (!match) return null;
      const [year, month, day] = match.slice(1).map(Number);
      const parsed = new Date(Date.UTC(year, month - 1, day));
      return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
        ? { year, month, day }
        : null;
    };
    const compact = parts => parts && ({
      ...parts,
      monthName: new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' })
        .format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)))
    });
    const start = compact(dateParts(event.start_date));
    const end = compact(dateParts(event.end_date));
    if (!start) return unavailable;
    if (!end || (end.year === start.year && end.month === start.month && end.day === start.day)) {
      return `${start.day} ${start.monthName} ${start.year}`;
    }
    if (end.year < start.year || (end.year === start.year && (end.month < start.month || (end.month === start.month && end.day < start.day)))) return unavailable;
    if (end.year === start.year && end.month === start.month) return `${start.day}–${end.day} ${end.monthName} ${end.year}`;
    if (end.year === start.year) return `${start.day} ${start.monthName}–${end.day} ${end.monthName} ${end.year}`;
    return `${start.day} ${start.monthName} ${start.year}–${end.day} ${end.monthName} ${end.year}`;
  };
  const setColor = (screenName, teamName) => {
    const page = root.querySelector(`[data-screen="${screenName}"]`);
    if (!page) return;
    const colors = teamColors[teamName];
    if (colors) {
      page.style.setProperty('--f1-team-color', colors[0]);
      page.style.setProperty('--f1-profile-ink', colors[1]);
    } else {
      page.style.removeProperty('--f1-team-color');
      page.style.removeProperty('--f1-profile-ink');
    }
  };
  const navigationRoots = new Set(['home', 'calendar', 'compare', 'following', 'search']);
  let activeNavigationTab = 'home';
  const openDetail = name => { detailNavigationStack.push(screen); show(name); };
  const goBackFromDetail = () => show(detailNavigationStack.pop() || 'home');
  const show = name => {
    if (navigationRoots.has(name)) detailNavigationStack.length = 0;
    screen = name;
    if (navigationRoots.has(name)) activeNavigationTab = name;
    else if (name === 'raceweekend') activeNavigationTab = 'calendar';
    else if (name === 'circuit' && ['calendar', 'raceweekend'].includes(detailNavigationStack.at(-1))) activeNavigationTab = 'calendar';
    root.querySelectorAll('[data-screen]').forEach(page => page.classList.toggle('is-active', page.dataset.screen === name));
    root.querySelectorAll('[data-nav]').forEach(item => {
      if (item.dataset.nav === activeNavigationTab) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
    const page = root.querySelector(`[data-screen="${name}"]`);
    if (page) page.scrollTop = 0;
  };
  const seasonOptions = selected => app.seasons.map(item =>
    `<option value="${esc(item.id)}"${item.id === selected ? ' selected' : ''}>${esc(item.year)}</option>`
  ).join('') || '<option value="">No imported seasons</option>';
  const driversFor = seasonId => season(seasonId)?.drivers || [];
  const profileSeasonForDriver = driverId => {
    const current = app.seasons.find(item => String(item.status || '').toLowerCase() === 'active')
      || byYear(new Date().getUTCFullYear()) || byYear(2026) || app.seasons[0];
    const includesDriver = item => driversFor(item?.id).some(driver => driver.id === driverId);
    if (current && includesDriver(current)) return { item: current, fallback: false };
    const latest = app.seasons.filter(includesDriver)
      .sort((left, right) => Number(right.year) - Number(left.year))[0];
    return latest ? { item: latest, fallback: Boolean(current), currentYear: current?.year } : { item: current, fallback: false };
  };
  const teamsFor = seasonId => season(seasonId)?.teams || [];
  const uniqueTeams = teams => [...new Map((teams || []).map(team => [team.id ?? team.name, team])).values()];
  const setDriverProfileTab = (tab, focus = false) => {
    const selected = tab === 'career' ? 'career' : 'overview';
    root.querySelectorAll('[data-profile-tab]').forEach(button => {
      const active = button.dataset.profileTab === selected;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    root.querySelectorAll('[data-profile-tab-panel]').forEach(panel => {
      panel.hidden = panel.dataset.profileTabPanel !== selected;
    });
    if (focus) root.querySelector(`[data-profile-tab="${selected}"]`)?.focus();
  };
  const setTeamProfileTab = (tab, focus = false) => {
    const selected = tab === 'history' ? 'history' : 'overview';
    root.querySelectorAll('[data-team-profile-tab]').forEach(button => {
      const active = button.dataset.teamProfileTab === selected;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    root.querySelectorAll('[data-team-profile-panel]').forEach(panel => {
      panel.hidden = panel.dataset.teamProfilePanel !== selected;
    });
    if (focus) root.querySelector(`[data-team-profile-tab="${selected}"]`)?.focus();
  };
  const setWeekendTab = (tab, focus = false) => {
    const selected = tab === 'results' ? 'results' : 'overview';
    root.querySelectorAll('[data-weekend-tab]').forEach(button => {
      const active = button.dataset.weekendTab === selected;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    root.querySelectorAll('[data-weekend-tab-panel]').forEach(panel => {
      panel.hidden = panel.dataset.weekendTabPanel !== selected;
    });
    if (focus) root.querySelector('[data-weekend-tab="' + selected + '"]')?.focus();
  };
  const renderSessionSchedule = schedule => {
    const presentation = window.F1WeekendSessionSchedule.groupSessions(schedule);
    const days = presentation.days || [];
    if (!days.length) return '<div class="f1-result-placeholder">Session schedule unavailable.</div>';
    const fallbackNotice = presentation.timeZoneFallback
      ? '<div class="f1-session-timezone">Device timezone detection unavailable; session times use UTC.</div>'
      : '';
    return `${fallbackNotice}${days.map(day =>
      `<section class="f1-session-day-group" aria-label="${esc(day.label)}"><h3 class="f1-session-date-heading">${esc(day.label)}</h3>${(day.sessions || []).map(session => {
        const time = session.scheduled_time
          ? `<time class="f1-session-time"${session.scheduled_at ? ` datetime="${esc(session.scheduled_at)}"` : ''}>${esc(session.scheduled_time)}</time>`
          : '<span class="f1-session-time">Time unavailable</span>';
        return `<div class="f1-session-row"><div><div class="f1-session-name">${esc(session.name)}</div>${session.status_label ? `<div class="f1-session-day">${esc(session.status_label)}</div>` : ''}</div>${time}</div>`;
      }).join('')}</section>`
    ).join('')}`;
  };
  let weekendSession = 'race';
  const setWeekendSession = session => {
    weekendSession = session;
    root.querySelectorAll('[data-weekend-session]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.weekendSession === session));
    });
    root.querySelectorAll('[data-weekend-session-panel]').forEach(panel => {
      panel.hidden = panel.dataset.weekendSessionPanel !== session;
    });
  };
  const setCareerView = view => {
    careerView = view === 'teams' ? 'teams' : 'seasons';
    root.querySelectorAll('[data-career-view]').forEach(button =>
      button.setAttribute('aria-pressed', String(button.dataset.careerView === careerView)));
    root.querySelectorAll('[data-career-view-panel]').forEach(panel => {
      panel.hidden = panel.dataset.careerViewPanel !== careerView;
    });
  };
  const careerStatsCells = stats => [stats?.starts, stats?.wins, stats?.podiums]
    .map(value => `<span class="f1-career-row-value">${value == null ? '—' : esc(value)}</span>`).join('');
  const seasonDetailText = detail => {
    const position = detail?.championship_position == null ? 'unavailable' : ordinal(detail.championship_position);
    const points = detail?.championship_points == null ? 'unavailable' : formatPoints(detail.championship_points);
    const poles = detail?.poles == null ? 'unavailable' : detail.poles;
    return `Championship position: ${position} · Championship points: ${points} · Pole positions: ${poles}`;
  };
  const formatCareerSeasonYears = (seasons, ongoing = false) => {
    const years = [...new Set((seasons || []).map(item => Number(item?.year))
      .filter(year => Number.isInteger(year) && year >= 1950 && year <= 2100))]
      .sort((a, b) => a - b);
    const ranges = [];
    for (let index = 0; index < years.length;) {
      const low = years[index];
      let high = low;
      while (index + 1 < years.length && years[index + 1] === high + 1) {
        index += 1;
        high = years[index];
      }
      const open = ongoing && index === years.length - 1;
      ranges.push(open ? `${low}–` : low === high ? String(low) : `${low}–${high}`);
      index += 1;
    }
    return ranges.join(', ');
  };

  const renderCareer = data => {
    const seasonList = byId('f1-career-seasons');
    const teamList = byId('f1-career-teams');
    const summary = data.historical_summary?.available ? data.historical_summary : null;
    const source = summary?.source || {};
    const sourceByYear = summary?.preferred_source_by_year || {};
    const summarySeasons = summary?.seasons || [];
    const summaryYears = new Set(summarySeasons.map(row => Number(row.year)));
    const canonicalSeasons = (data.seasons || []).filter(row => {
      const year = Number(row.season?.year);
      return !summaryYears.has(year) || sourceByYear[String(year)] === 'hyprace';
    });
    const legacySeasons = summarySeasons.filter(row => sourceByYear[String(row.year)] !== 'hyprace');
    const rows = [
      ...canonicalSeasons.map(row => ({
        year: row.season.year, constructors: row.constructors || [], statistics: row.statistics,
        details: row.season_details || {},
      })),
      ...legacySeasons.map(row => ({
        year: row.year,
        constructors: (row.constructors || []).map(team => ({ name: team.constructor_name || team.constructor_external_id })),
        statistics: { starts: row.starts, podiums: row.podiums, wins: row.wins },
        details: { championship_position: row.championship_position, championship_points: row.championship_points, poles: row.poles },
      })),
    ].sort((a, b) => Number(b.year) - Number(a.year));
    const header = '<div class="f1-career-table-head"><span></span><span>Races</span><span>Wins</span><span>Podiums</span></div>';
    if (seasonList) seasonList.innerHTML = rows.length ? header + rows.map(row => {
      const teams = row.constructors.map(team => esc(team.name)).join(' · ') || 'Team unavailable';
      return `<details class="f1-career-season"><summary class="f1-career-row"><span class="f1-career-row-main"><span class="f1-career-row-title">${esc(row.year)}</span><span class="f1-career-row-meta">${teams}</span></span>${careerStatsCells(row.statistics)}</summary><div class="f1-career-season-detail">${esc(seasonDetailText(row.details))}</div></details>`;
    }).join('') : '<div class="f1-result-placeholder">No verified career season summaries are available.</div>';
    const teams = [...(data.teams || [])].sort((a, b) =>
      Number(Boolean(b.current)) - Number(Boolean(a.current))
      || Math.max(...(b.seasons || []).map(item => Number(item.year) || 0))
         - Math.max(...(a.seasons || []).map(item => Number(item.year) || 0))
    );
    if (teamList) teamList.innerHTML = teams.length ? header + teams.map(row => {
      const latestSeason = [...(row.seasons || [])].sort((a, b) => Number(b.year) - Number(a.year))[0];
      const years = formatCareerSeasonYears(row.seasons, Boolean(row.current));
      const link = latestSeason ? `<button class="f1-career-team-link" type="button" data-app-open-team="${esc(row.constructor.id)}" data-app-season="${esc(latestSeason.id)}">${esc(row.constructor.name)}</button>` : esc(row.constructor.name);
      return `<div class="f1-career-row"><span class="f1-career-row-main"><span class="f1-career-row-title">${link}</span><span class="f1-career-row-meta">${esc(years)}</span></span>${careerStatsCells(row.statistics)}</div>`;
    }).join('') : '<div class="f1-result-placeholder">No verified career race records or constructor associations are available.</div>';
    const note = byId('f1-career-coverage-note');
    const sourceDetails = byId('f1-career-source-info');
    const sourceAttribution = byId('f1-career-source-attribution');
    const recorded = data.recorded_totals || {};
    if (sourceDetails) sourceDetails.hidden = !summary;
    if (summary) {
      const totals = summary.career_totals || {};
      set('f1-profile-career-wins', totals.wins);
      set('f1-profile-career-podiums', totals.podiums);
      set('f1-profile-career-poles', totals.poles);
      if (note) note.textContent = `F1DB season summaries are source-reported totals, not race-by-race evidence; summary-only seasons are excluded from head-to-head comparisons.`;
      if (sourceAttribution) sourceAttribution.textContent = `${source.attribution || 'F1DB'} ${source.version || ''}. Season and career summaries are combined with persisted race classifications; F1DB data is licensed under CC BY 4.0.`.trim();
      const topNote = byId('f1-profile-career-title')?.closest('.f1-profile-section')?.querySelector('.f1-prototype-note');
      if (topNote) topNote.textContent = `Career totals through ${summary.career_through_year || 2025}; source coverage varies by statistic.`;
    } else if (note) {
      const years = (recorded.covered_seasons || []).join(', ');
      if (Number(recorded.race_records || 0) > 0) {
        const value = key => recorded[key] == null ? '—' : String(recorded[key]);
        note.textContent = `Partial imported-record counts for ${years || 'available seasons'}: ${value('starts')} starts, ${value('podiums')} podiums, ${value('wins')} wins. Complete career totals remain unavailable because coverage is unverified.`;
      } else note.textContent = 'No stored race classifications are available for these career counts.';
    }
    globalThis.lucide?.createIcons?.({ attrs: { width: 14, height: 14 } });
    setCareerView(careerView);
  };
  const currentStandings = seasonId => app.standings.get(seasonId) || null;
  const currentCalendar = seasonId => app.calendars.get(seasonId) || null;
  const allEvents = () => app.seasons.flatMap(item => (currentCalendar(item.id)?.rounds || []).map(event => ({ ...event, seasonId: item.id, year: item.year })));
  const statusName = value => ({
    completed: 'Completed', complete: 'Completed', active: 'In progress', in_progress: 'In progress',
    scheduled: 'Upcoming', upcoming: 'Upcoming', postponed: 'Postponed', cancelled: 'Cancelled', canceled: 'Cancelled'
  }[String(value || '').trim().toLowerCase()] || null);
  const calendarStatusName = value => {
    const status = String(value || '').trim().toLowerCase();
    if (['completed', 'complete', 'scheduled', 'upcoming', 'unknown', ''].includes(status)) return null;
    if (['cancelled', 'canceled', 'postponed', 'in_progress', 'active'].includes(status)) return statusName(status);
    return null;
  };
  const countryFlagMarkup = circuitCode => {
    const code = String(circuitCode || '').trim().toUpperCase();
    const name = /^[A-Z]{2}$/.test(code) ? countryName(code) : '';
    if (!name || name === 'Unknown Region') {
      return '<span class="f1-calendar-country-unverified" aria-label="Circuit country unavailable">Country unavailable</span>';
    }
    const codepoints = [...code].map(letter => (0x1f1e6 + letter.charCodeAt(0) - 65).toString(16)).join('-');
    const src = `https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/${codepoints}.svg`;
    return `<span class="f1-calendar-flag" role="img" aria-label="${esc(name)} flag"><img class="f1-calendar-country-flag" src="${src}" width="20" height="15" loading="lazy" decoding="async" alt="" onerror="this.hidden=true"><span class="f1-calendar-country-code-fallback" aria-hidden="true">${esc(code)}</span></span>`;
  };
  const displayGrandPrixName = (value, seasonYear) => {
    let name = String(value ?? '').replace(/^\s*formula\s+1\b\s*/i, '').trim();
    const year = String(seasonYear ?? '').trim();
    if (/^\d{4}$/.test(year)) name = name.replace(new RegExp('\\s+' + year + '$'), '').trim();
    return name;
  };
  const isCalendarDate = value => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!match) return false;
    const [, year, month, day] = match.map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
  };
  const calendarToday = (now, timeZone) => {
    if (!timeZone) return null;
    try {
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(now).map(({ type, value }) => [type, value]));
      return parts.year && parts.month && parts.day ? `${parts.year}-${parts.month}-${parts.day}` : null;
    } catch { return null; }
  };
  const shiftCalendarDate = (value, days) => {
    const shifted = new Date(`${value}T00:00:00Z`);
    shifted.setUTCDate(shifted.getUTCDate() + days);
    return shifted.toISOString().slice(0, 10);
  };
  const calendarDateWindow = (now, timeZone) => {
    const localDate = calendarToday(now, timeZone);
    if (localDate) return { first: localDate, last: localDate, exact: true };
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) return null;
    const utcDate = now.toISOString().slice(0, 10);
    if (!isCalendarDate(utcDate)) return null;
    // A missing/invalid circuit timezone can place local midnight anywhere from
    // UTC-12 through UTC+14. Only classify a race when its dates are certain
    // across that whole one-day uncertainty window.
    return { first: shiftCalendarDate(utcDate, -1), last: shiftCalendarDate(utcDate, 1), exact: false };
  };
  const calendarEventTiming = (event, now) => {
    const window = calendarDateWindow(now, event.circuit?.timezone);
    if (!window) return 'ambiguous';
    if (event.start_date <= window.first && event.end_date >= window.last) return 'weekend';
    if (event.end_date < window.first) return 'past';
    if (event.start_date > window.last) return 'next';
    return 'ambiguous';
  };
  const calendarTarget = (events, now = new Date()) => {
    const scheduled = (events || []).filter(event => {
      const start = event.start_date, end = event.end_date;
      if (!isCalendarDate(start) || !isCalendarDate(end) || end < start) return false;
      return !['cancelled', 'canceled', 'postponed'].includes(String(event.status || '').trim().toLowerCase());
    }).sort((a, b) => a.start_date.localeCompare(b.start_date) || Number(a.round) - Number(b.round));
    const thisWeekend = scheduled.find(event => calendarEventTiming(event, now) === 'weekend');
    if (thisWeekend) return { event: thisWeekend, kind: 'weekend' };
    const nextRace = scheduled.find(event => calendarEventTiming(event, now) === 'next');
    const ambiguousBeforeNext = scheduled.some(event =>
      calendarEventTiming(event, now) === 'ambiguous'
      && (!nextRace || event.start_date <= nextRace.start_date));
    if (ambiguousBeforeNext) return null;
    return nextRace ? { event: nextRace, kind: 'next' } : null;
  };
  const hasSprintRaceSession = event => Array.isArray(event.sessions)
    && event.sessions.some(session => String(session?.type || '').trim().toLowerCase() === 'sprint');
  const resultPosition = result => result?.position == null ? unavailable : ordinal(result.position);
  const options = (select, values, selected, placeholder) => {
    if (!select) return;
    select.innerHTML = `${placeholder ? `<option value="">${esc(placeholder)}</option>` : ''}` + values.map(item =>
      `<option value="${esc(item.value)}"${item.value === selected ? ' selected' : ''}>${esc(item.label)}</option>`
    ).join('');
    select.value = selected || '';
  };
  const dataNote = (container, message) => {
    if (!container) return;
    container.innerHTML = `<div class="f1-data-banner">${esc(message)}</div>`;
  };
  const renderStandings = () => {
    const standings = currentStandings(selectedSeason);
    const drivers = standings?.drivers || [];
    const constructors = standings?.constructors || [];
    const list = byId(standingsMode === 'drivers' ? 'f1-standings-list' : 'f1-constructor-standings-list');
    if (!list) return;
    const rows = standingsMode === 'drivers' ? drivers : constructors;
    const sourceNote = byId('f1-standings-source-note');
    if (sourceNote) sourceNote.textContent = standingsSourceDescription(standings?.source, rows.length > 0);
    const ahead = (row, index) => index === 0 ? 'Leader' : row.points == null || rows[index - 1]?.points == null ? unavailable : `${formatPoints(Number(rows[index - 1].points) - Number(row.points))} pts`;
    const leader = row => row.points == null || rows[0]?.points == null ? unavailable : indexGap(rows[0].points, row.points);
    const values = rows.map((row, index) => {
      const gap = gapMode === 'leader' ? leader(row) : ahead(row, index);
      const action = standingsMode === 'drivers'
        ? `data-app-open-driver="${esc(row.id)}" data-app-season="${esc(selectedSeason)}"`
        : `data-app-open-team="${esc(row.id)}" data-app-season="${esc(selectedSeason)}"`;
      const context = standingsMode === 'drivers' ? (row.teams || []).join(' · ') || unavailable : 'Constructor';
      return `<button class="f1-standing-row" type="button" ${action} aria-label="Open ${esc(row.name)} ${standingsMode === 'drivers' ? 'driver' : 'team'} profile"><span class="f1-standing-grid"><span class="f1-standing-pos">${row.position ?? unavailable}</span><span class="f1-standing-driver"><span class="f1-standing-name">${esc(row.name)}</span><span class="f1-standing-team">${esc(context)}</span></span><span class="f1-standing-points">${esc(formatPoints(row.points))}</span><span class="f1-standing-gap${index === 0 ? ' is-leader' : ''}">${esc(gap)}</span></span></button>`;
    }).join('');
    list.innerHTML = values || `<div class="f1-result-placeholder">${esc(standings?.coverage_note || 'No persisted standings are available for this season.')}</div>`;
    const note = byId('f1-constructor-note');
    if (note) note.textContent = standings?.coverage_note || 'Constructor standings are unavailable; driver points are not added to infer them.';
  };
  const indexGap = (leader, value) => `${formatPoints(Number(leader) - Number(value))} pts`;
  const renderHomeRecentResults = async seasonId => {
    const target = root.querySelector('.f1-latest-list');
    if (!target) return;
    const requestId = ++homeRecentResultsRequest;
    const seasonYear = season(seasonId)?.year ?? '';
    const recentEvents = (currentCalendar(seasonId)?.rounds || [])
      .filter(event => ['completed', 'complete'].includes(String(event.status || '').toLowerCase()))
      .slice()
      .sort((a, b) => Number(b.round) - Number(a.round))
      .slice(0, 3)
      .map(event => ({ ...event, year: event.year ?? seasonYear }));
    if (!recentEvents.length) {
      target.innerHTML = '<div class="f1-result-placeholder">No completed race results are stored for this season.</div>';
      return;
    }
    target.innerHTML = '<div class="f1-result-placeholder">Loading stored race results.</div>';
    const results = await Promise.all(recentEvents.map(async event => {
      try {
        const data = await fetchJson(`/api/weekend?season=${encodeURIComponent(seasonId)}&round=${encodeURIComponent(event.id)}`);
        return { event, data };
      } catch {
        return { event, data: null };
      }
    }));
    if (requestId !== homeRecentResultsRequest || selectedSeason !== seasonId) return;
    target.innerHTML = results.map(({ event, data }) => {
      const podium = data?.podium?.available && data.podium.entries?.length === 3 ? data.podium.entries : [];
      const eventName = displayGrandPrixName(event.name, event.year);
      const type = podium.length
        ? `${event.year} · Round ${event.round}`
        : 'Result unavailable';
      const title = podium.length
        ? eventName
        : `${eventName} podium unavailable`;
      const resultDetails = podium.length
        ? `<div class="f1-latest-winner f1-latest-title">Winner: ${esc(podium[0].driver)}</div><div class="f1-latest-podium"><div>P2 ${esc(podium[1].driver)}</div><div>P3 ${esc(podium[2].driver)}</div></div><div class="f1-latest-circuit">${esc(event.circuit.name)}</div>`
        : `<div class="f1-latest-circuit">${esc(event.circuit.name)} · No supported full podium is stored</div>`;
      return `<button class="f1-latest-item" type="button" data-app-round="${esc(event.id)}" data-app-season="${esc(seasonId)}" aria-label="Open ${esc(eventName)} race weekend"><div class="f1-latest-copy"><div class="f1-latest-type">${esc(type)}</div><div class="f1-latest-title">${esc(title)}</div><div class="f1-latest-meta">${resultDetails}</div></div><i aria-hidden="true" data-lucide="chevron-right"></i></button>`;
    }).join('');
    globalThis.lucide?.createIcons?.({ attrs: { width: 16, height: 16 } });
  };
  const renderHome = () => {
    if (!season(selectedSeason)) selectedSeason = currentSeason()?.id || '';
    const select = byId('f1-standings-season');
    options(select, app.seasons.map(item => ({ value: item.id, label: String(item.year) })), selectedSeason, 'No imported seasons');
    const upcoming = allEvents().find(event => ['scheduled', 'active'].includes(String(event.status).toLowerCase()));
    const weekend = root.querySelector('.f1-weekend-card');
    if (weekend) {
      if (upcoming) {
        const button = weekend.querySelector('[data-open-next-weekend]');
        if (button) {
          button.dataset.appRound = upcoming.id; button.dataset.appSeason = upcoming.seasonId;
          const name = button.querySelector('.f1-weekend-name'); if (name) name.textContent = displayGrandPrixName(upcoming.name);
          const meta = button.querySelector('.f1-weekend-meta'); if (meta) meta.textContent = `${upcoming.circuit.name} · Round ${upcoming.round} · ${dateRange(upcoming)}`;
          const badge = button.querySelector('.f1-weekend-status');
          if (badge) { const label = statusName(upcoming.status); badge.hidden = !label; badge.textContent = label || ''; }
        }
        const circuitLink = weekend.querySelector('[data-home-circuit]');
        if (circuitLink) { circuitLink.dataset.appOpenCircuit = upcoming.circuit.id; circuitLink.dataset.appSeason = upcoming.seasonId; }
      } else {
        weekend.innerHTML = `<div class="f1-result-placeholder">No upcoming event is available in persisted app data.</div>`;
      }
    }
    renderHomeRecentResults(selectedSeason);
    renderStandings();
    const coverage = currentStandings(selectedSeason)?.coverage_note || 'No persisted standings are available.';
    const standingsHeading = byId('f1-standings-title');
    if (standingsHeading) standingsHeading.dataset.coverage = coverage;
  };
  const renderCalendar = () => {
    const select = byId('f1-calendar-season');
    const picked = select?.value && season(select.value) ? select.value : selectedSeason;
    options(select, app.seasons.map(item => ({ value: item.id, label: String(item.year) })), picked, 'No imported seasons');
    const cal = currentCalendar(picked);
    const events = cal?.rounds || [];
    const target = calendarTarget(events);
    const jump = byId('f1-calendar-jump');
    if (jump) {
      jump.hidden = !target;
      jump.dataset.calendarTarget = target?.event.id || '';
      jump.dataset.calendarSeason = picked;
      jump.setAttribute('aria-label', target?.kind === 'weekend' ? 'Jump to this weekend' : 'Jump to the next race');
    }
    const list = byId('f1-calendar-list');
    if (!list) return;
    const rows = [...events].reverse().map(event => {
      const name = displayGrandPrixName(event.name, season(picked)?.year);
      const label = calendarStatusName(event.status);
      const isTarget = target?.event.id === event.id;
      const relevance = isTarget ? (target.kind === 'weekend' ? 'This weekend' : 'Next race') : '';
      const sprint = hasSprintRaceSession(event);
      const rowClass = isTarget ? (target.kind === 'weekend' ? ' is-current' : ' is-next') : '';
      return `
      <button class="f1-calendar-row${rowClass}" type="button" data-app-round="${esc(event.id)}" data-app-season="${esc(picked)}" aria-label="Open ${esc(event.name)} race weekend">
        <div class="f1-calendar-row-main"><div><div class="f1-calendar-round-line"><span class="f1-calendar-round">Round ${event.round} · ${esc(event.circuit.name)}</span>${countryFlagMarkup(event.circuit.country_code)}</div><div class="f1-calendar-name">${esc(name)}</div><div class="f1-calendar-meta"><span class="f1-calendar-location">${esc(event.circuit.location)}</span><span class="f1-calendar-meta-separator" aria-hidden="true">·</span><span class="f1-calendar-date">${esc(dateRange(event))}</span>${sprint ? '<span class="f1-calendar-cue f1-calendar-sprint">Sprint</span>' : ''}</div>${relevance ? `<div class="f1-calendar-cues"><span class="f1-calendar-cue f1-calendar-relevance">${relevance}</span></div>` : ''}</div><div class="f1-calendar-side">${label ? `<span class="f1-calendar-status">${esc(label)}</span>` : ''}<i data-lucide="chevron-right" aria-hidden="true"></i></div></div>
      </button>`;
    }).join('');
    list.innerHTML = rows || '<div class="f1-result-placeholder">No persisted calendar rounds are available for this season.</div>';
    globalThis.lucide?.createIcons?.({ attrs: { width: 16, height: 16 } });
  };
  const openDriver = async id => {
    if (!id) return;
    const requestId = ++driverProfileRequest;
    const profileSeason = profileSeasonForDriver(id);
    const requestedSeason = profileSeason.item?.id || selectedSeason;
    selectedDriverId = id;
    openDetail('profile'); root.style.visibility = 'hidden';
    setDriverProfileTab('overview'); setCareerView('seasons');
    setProfileNumber(null);
    if (byId('f1-profile-results')) byId('f1-profile-results').innerHTML = '';
    dataNote(byId('f1-career-seasons'), 'Loading verified career records.');
    dataNote(byId('f1-career-teams'), 'Loading verified constructor records.');
    set('f1-career-coverage-note', 'Loading verified career coverage.');
    ['f1-profile-name','f1-profile-meta','f1-profile-season-kicker','f1-profile-position','f1-profile-points','f1-profile-gap','f1-profile-wins','f1-profile-podiums','f1-profile-best-finish-value','f1-profile-best-finish-years','f1-profile-career-wins','f1-profile-career-podiums','f1-profile-career-poles'].forEach(id => set(id, unavailable));
    ['f1-profile-career-wins','f1-profile-career-podiums','f1-profile-career-poles'].forEach(id => set(id, '—'));
    try {
      const profile = await fetchJson(`/api/driver?season=${encodeURIComponent(requestedSeason)}&driver=${encodeURIComponent(id)}`);
      if (requestId === driverProfileRequest) await renderDriver(profile, requestId, profileSeason.fallback ? profileSeason.currentYear : null);
    }
    catch (error) { if (requestId !== driverProfileRequest) return; set('f1-profile-season-title', 'Season summary — unavailable'); dataNote(byId('f1-profile-results'), error.message); }
    if (requestId === driverProfileRequest) root.style.visibility = 'visible';
  };
  const renderDriver = async (data, requestId, fallbackFromYear = null) => {
    if (requestId !== driverProfileRequest) return;
    const { driver, summary, teams } = data;
    const seasonTeams = uniqueTeams(data.standings_teams?.length ? data.standings_teams : teams);
    setProfileNumber(driver.number);
    set('f1-profile-name', driver.name);
    set('f1-profile-meta', `${seasonTeams.map(team => team.name).join(' · ') || unavailable}${driver.nationality_code ? ` · ${driver.nationality_code}` : ''}`);
    set('f1-profile-season-kicker', `${data.season.year} season${fallbackFromYear == null ? '' : ' · latest available'}`);
    set('f1-profile-season-title', 'Season summary — available data');
    set('f1-profile-position', ordinal(summary.position));
    set('f1-profile-points', formatPoints(summary.points));
    set('f1-profile-standings-source-note', standingsSourceDescription(summary.source, summary.standings_available));
    set('f1-profile-gap', summary.gap_to_leader == null ? unavailable : summary.gap_to_leader === '0' ? 'Leader' : `${formatPoints(summary.gap_to_leader)} pts`);
    set('f1-profile-wins', summary.wins); set('f1-profile-podiums', summary.podiums);
    const raceStatsNote = byId('f1-profile-race-stats-note');
    if (raceStatsNote) raceStatsNote.textContent = summary.race_starts
      ? `Stored-race wins and podiums from ${summary.race_starts} stored race result${summary.race_starts === 1 ? '' : 's'}.`
      : 'Stored-race wins and podiums are unavailable because no race results are stored.';
    const summarySection = byId('f1-profile-season-title')?.closest('.f1-profile-section');
    if (summarySection) {
      let note = summarySection.querySelector('.app-coverage-note');
      if (!note) { note = document.createElement('p'); note.className = 'f1-prototype-note app-coverage-note'; summarySection.append(note); }
      const fallbackNote = fallbackFromYear == null
        ? ''
        : `No ${fallbackFromYear} participation is recorded; showing the latest available season (${data.season.year}). `;
      note.textContent = `${fallbackNote}${data.coverage_note || ''}`;
    }
    set('f1-profile-best-finish-value', unavailable); set('f1-profile-best-finish-years', 'No verified complete career snapshot is stored.');
    set('f1-profile-career-wins', '—'); set('f1-profile-career-podiums', '—'); set('f1-profile-career-poles', '—');
    const careerNote = byId('f1-profile-career-title')?.closest('.f1-profile-section')?.querySelector('.f1-prototype-note');
    if (careerNote) careerNote.textContent = 'Career totals and best championship finish are unavailable because no verified complete career history is stored.';
    let career = null;
    let careerRequestSucceeded = false;
    try {
      career = await fetchJson(`/api/driver/career?driver=${encodeURIComponent(driver.id)}`);
      careerRequestSucceeded = true;
    }
    catch { /* keep the season overview available when career data cannot be read */ }
    if (requestId !== driverProfileRequest) return;
    const resultBox = byId('f1-profile-results');
    const recentResults = careerRequestSucceeded
      ? (career?.recent_results || [])
      : (data.results || []).map(result => ({
        ...result,
        season_id: data.season.id,
        season_year: data.season.year,
      }));
    if (resultBox) resultBox.innerHTML = recentResults.length ? recentResults.map(result => `<button class="f1-profile-result" type="button" data-app-round="${esc(result.id)}" data-app-season="${esc(result.season_id)}"><div><div class="f1-profile-result-name">${esc(result.name)}</div><div class="f1-profile-result-round">${result.season_year} | Round ${result.round} | ${esc(result.circuit)}</div></div><div class="f1-profile-result-pos">${result.position == null ? esc(result.status || unavailable) : `P${result.position}`}</div></button>`).join('') : '<div class="f1-result-placeholder">No persisted race results are available for this driver.</div>';
    if (career) renderCareer(career);
    else {
      dataNote(byId('f1-career-seasons'), 'Verified career statistics are unavailable.');
      dataNote(byId('f1-career-teams'), 'Verified constructor associations are unavailable.');
    }
    const resultNote = resultBox?.parentElement?.querySelector('.f1-prototype-note'); if (resultNote) resultNote.textContent = 'Results reflect available persisted race classifications and may be incomplete.';
    const teamName = seasonTeams.length === 1 ? seasonTeams[0].name : '';
    setColor('profile', teamName);
    byId('f1-profile-favourite')?.setAttribute('aria-pressed', String(isFollowed('driver', driver.id)));
  };
  const openTeam = async (id, seasonId = selectedSeason) => {
    if (!id) return;
    selectedTeamId = id; selectedSeason = seasonId || selectedSeason;
    setTeamProfileTab('overview');
    openDetail('team'); root.style.visibility = 'hidden';
    ['f1-team-title','f1-team-position','f1-team-points','f1-team-gap','f1-team-titles','f1-team-record-best','f1-team-record-best-season'].forEach(id => set(id, unavailable));
    if (byId('f1-team-drivers')) byId('f1-team-drivers').innerHTML = '';
    if (byId('f1-team-season-history')) byId('f1-team-season-history').innerHTML = '<div class="f1-team-season-history-row f1-team-season-history-head"><span>Season</span><span>Position</span><span>Points</span></div>';
    try { renderTeam(await fetchJson(`/api/team?season=${encodeURIComponent(selectedSeason)}&team=${encodeURIComponent(id)}`)); }
    catch (error) { set('f1-team-season-title', `${currentSeason()?.year || ''} Championship`); dataNote(byId('f1-team-drivers'), error.message); }
    root.style.visibility = 'visible';
  };
  const renderTeam = data => {
    const { team, summary, drivers, history } = data;
    const historical = data.historical_summary?.available ? data.historical_summary : null;
    const source = historical?.source || {};
    const preference = historical?.preferred_source_by_year || {};
    const historicalRows = historical?.seasons || [];
    const historicalYears = new Set(historicalRows.map(row => Number(row.year)));
    set('f1-team-title', team.name);
    set('f1-team-season-title', `${data.season.year} Championship`);
    set('f1-team-position', summary.position == null ? unavailable : ordinal(summary.position));
    set('f1-team-points', formatPoints(summary.points));
    set('f1-team-gap', summary.gap_to_leader == null ? unavailable : summary.gap_to_leader === '0' ? 'Leader' : `${formatPoints(summary.gap_to_leader)} pts`);
    const records = data.constructor_records || {};
    const totals = historical?.career_totals || {};
    const positions = historicalRows.map(row => row.championship_position).filter(Number.isInteger);
    set('f1-team-titles', records.championship_titles == null ? (totals.championship_titles ?? '—') : records.championship_titles);
    set('f1-team-record-best', records.best_championship_position == null
      ? (positions.length ? ordinal(Math.min(...positions)) : '—')
      : ordinal(records.best_championship_position));
    const bestSeason = byId('f1-team-record-best-season');
    if (bestSeason) {
      const best = positions.length ? Math.min(...positions) : null;
      const year = records.best_championship_season ?? historicalRows.find(row => row.championship_position === best)?.year ?? null;
      bestSeason.hidden = year == null;
      bestSeason.textContent = year == null ? '' : String(year);
    }
    const historyList = byId('f1-team-season-history');
    const canonicalRows = (history || []).filter(row =>
      !historicalYears.has(Number(row.year)) || preference[String(row.year)] === 'hyprace'
    );
    const historyRows = [
      ...canonicalRows.map(row => ({ ...row, source_label: null, race_statistics: row.race_statistics || {} })),
      ...historicalRows.filter(row => preference[String(row.year)] !== 'hyprace').map(row => ({
        year: row.year, position: row.championship_position, points: row.championship_points,
        source_label: `${source.attribution || 'F1DB'} ${source.version}`,
        race_statistics: { starts: row.starts, podiums: row.podiums, wins: row.wins, poles: row.poles, race_records: 0 },
      })),
    ].sort((a, b) => Number(b.year) - Number(a.year));
    if (historyList) historyList.innerHTML = '<div class="f1-team-season-history-row f1-team-season-history-head"><span>Season</span><span>Position</span><span>Points</span></div>' + (historyRows.length
      ? historyRows.map(row => `<div class="f1-team-season-history-row"><span>${esc(row.year)}</span><span>${row.position == null ? '—' : esc(ordinal(row.position))}</span><span>${row.points == null ? '—' : esc(formatPoints(row.points))}</span></div>`).join('')
      : '<div class="f1-result-placeholder">No stored championship standings are available.</div>');
    const recorded = data.recorded_totals || {};
    const coverageNote = byId('f1-team-race-history-summary');
    if (coverageNote) {
      if (historical) coverageNote.textContent = 'Season positions and points follow the verified source coverage for each year.';
      else if (Number(recorded.race_records || 0) > 0) {
        const years = (recorded.covered_seasons || []).join(', ');
        const value = key => recorded[key] == null ? '—' : String(recorded[key]);
        coverageNote.textContent = `Partial totals for ${years || 'available seasons'} from stored Grand Prix classifications: ${value('starts')} starts, ${value('podiums')} podiums, ${value('wins')} wins. Complete constructor career totals remain unavailable.`;
      } else coverageNote.textContent = 'No stored Grand Prix classifications are available for constructor career totals.';
    }
    const teamSourceInfo = byId('f1-team-source-info');
    const teamSourceAttribution = byId('f1-team-source-attribution');
    if (teamSourceInfo) teamSourceInfo.hidden = !historical;
    if (teamSourceAttribution && historical) {
      teamSourceAttribution.textContent = `${source.attribution || 'F1DB'} ${source.version || ''}. Constructor season summaries are licensed under ${source.license || 'CC BY 4.0'}.`.trim();
    }
    const lineup = byId('f1-team-drivers');
    if (lineup) lineup.innerHTML = drivers.length ? drivers.map(driver => `<button class="f1-entity-row" type="button" data-app-open-driver="${esc(driver.id)}" data-app-season="${esc(selectedSeason)}"><span><span class="f1-entity-row-main">${esc(driver.name)}</span><span class="f1-entity-row-meta">${driver.championship_position == null ? '' : `P${driver.championship_position} · `}${driver.points == null ? 'Points unavailable' : `${esc(formatPoints(driver.points))} pts`}</span></span><i data-lucide="chevron-right" aria-hidden="true"></i></button>`).join('') : '<div class="f1-result-placeholder">No persisted driver lineup is available for this team and season.</div>';
    setColor('team', team.name);
    const compare = root.querySelector('[data-team-open-compare]');
    selectedTeamCompareDrivers = drivers.filter(driver => driversFor(selectedSeason).some(option => option.id === driver.id)).slice(0, 2).map(driver => driver.id);
    if (compare) { compare.disabled = selectedTeamCompareDrivers.length < 2; compare.textContent = 'Compare drivers'; }
    byId('f1-team-favourite')?.setAttribute('aria-pressed', String(isFollowed('team', team.id)));
    globalThis.lucide?.createIcons?.({ attrs: { width: 18, height: 18 } });
  };
  const renderCalendarScreen = () => {
    renderCalendar();
    show('calendar');
  };
  const openWeekend = async (roundId, seasonId) => {
    if (!roundId || !seasonId) return;
    openDetail('raceweekend');
    setWeekendTab('overview');
    root.style.visibility = 'hidden';
    ['f1-weekend-page-status','f1-weekend-page-title','f1-weekend-page-meta'].forEach(id => set(id, unavailable));
    ['f1-weekend-sessions','f1-weekend-podium','f1-weekend-sprint','f1-weekend-sprint-quali','f1-weekend-quali','f1-weekend-grid','f1-weekend-race','f1-weekend-impact'].forEach(id => { if (byId(id)) byId(id).innerHTML = ''; });
    const impactSection = byId('f1-weekend-impact-section');
    if (impactSection) impactSection.hidden = true;
    try {
      const data = await fetchJson(`/api/weekend?season=${encodeURIComponent(seasonId)}&round=${encodeURIComponent(roundId)}`);
      const event = data.event;
      const eventStatus = statusName(event.status);
      const eventStatusElement = byId('f1-weekend-page-status');
      if (eventStatusElement) { eventStatusElement.hidden = !eventStatus; eventStatusElement.textContent = eventStatus || ''; }
      set('f1-weekend-page-title', event.name);
      set('f1-weekend-page-meta', `${event.circuit.name} · Round ${event.round} · ${dateRange(event)}`);
      const context = byId('f1-weekend-page-context');
      if (context) context.innerHTML = `<span class="f1-mini-badge">${esc(event.circuit.location)}</span><button class="f1-mini-badge f1-circuit-link" type="button" data-app-open-circuit="${esc(event.circuit.id)}" data-app-season="${esc(seasonId)}">${esc(event.circuit.name)}</button>`;
      const sessions = data.sessions || [];
      const types = { race: ['race'], qualifying: ['qualifying', 'quali'], grid: ['starting_grid'], sprint: ['sprint'], sprint_qualifying: ['sprint_qualifying'] };
      const findSession = key => sessions.find(item => types[key].includes(String(item.type).toLowerCase()));
      const availableKeys = ['race','qualifying','grid',...(sessions.some(item => String(item.type).toLowerCase() === 'sprint') ? ['sprint'] : []),...(sessions.some(item => String(item.type).toLowerCase() === 'sprint_qualifying') ? ['sprint_qualifying'] : [])];
      const schedule = byId('f1-weekend-sessions');
      if (schedule) schedule.innerHTML = renderSessionSchedule(data.session_schedule);
      const weekendResultLabel = (key, rows) => {
        const classifications = (rows || []).filter(row => !row.entry_state);
        if (!classifications.length) {
          return rows?.length ? 'Evidence only · no classifications' : 'Results unavailable';
        }
        const provisional = classifications.some(
          row => String(row.provenance || '').toLowerCase() === 'provisional'
        );
        const providerConfirmed = classifications.every(row =>
          ['provider_confirmed', 'corrected'].includes(String(row.provenance || '').toLowerCase())
        );
        if (key === 'grid') {
          return provisional ? 'Provisional provider grid positions'
            : providerConfirmed ? 'Provider-confirmed grid positions' : 'Stored grid positions';
        }
        const provenanceLabel = provisional ? 'Provisional provider results'
          : providerConfirmed ? 'Provider-confirmed results' : 'Stored results';
        const reviewedStatuses = classifications.filter(row => row.official_status_reviewed).length;
        const specificLabel = reviewedStatuses
          ? `${provenanceLabel} · ${reviewedStatuses} officially reviewed result ${reviewedStatuses === 1 ? 'status' : 'statuses'}`
          : provenanceLabel;
        if (['qualifying','sprint_qualifying'].includes(key)) {
          const hasSegmentCapture = classifications.some(row => row.qualifying_segments != null);
          const hasSegmentTime = classifications.some(row => row.qualifying_segments
            && Object.values(row.qualifying_segments).some(value => typeof value === 'string' && value));
          if (!hasSegmentCapture) return `${provenanceLabel} · segment times unavailable`;
          if (!hasSegmentTime) return `${provenanceLabel} · no segment times recorded`;
          return provisional ? 'Provisional provider times' : 'Provider segment times';
        }
        return specificLabel;
      };
      const classificationRowMarkup = (row, key) => {
        const entryStates = { did_not_start: 'Did not start', no_valid_time: 'No valid time' };
        const entryStateLabel = entryStates[row.entry_state] || '';
        const pos = row.position == null
          ? (entryStateLabel ? '—' : esc(row.provider_status || row.status || '—'))
          : esc(row.position);
        const name = `<button type="button" class="f1-classification-name" data-app-open-driver="${esc(row.driver_id)}" data-app-season="${esc(seasonId)}">${esc(row.driver)}</button>`;
        const team = row.team_id ? `<button type="button" class="f1-standing-team" data-app-open-team="${esc(row.team_id)}" data-app-season="${esc(seasonId)}">${esc(row.team || unavailable)}</button>` : `<span class="f1-standing-team">${esc(row.team || unavailable)}</span>`;
        const nonFinish = ['dnf','dns','dsq','excluded','withdrawn','not-classified','not_classified'];
        const status = String(row.status || '').toLowerCase();
        const isQualifying = ['qualifying','sprint_qualifying'].includes(key);
        const segments = row.qualifying_segments;
        const segmentMarkup = isQualifying && segments
          ? ['q1','q2','q3'].filter(segment => Object.prototype.hasOwnProperty.call(segments, segment))
              .map(segment => esc(segment.toUpperCase() + ' ' + (segments[segment] == null ? '—' : segments[segment])))
              .join('<br>')
          : '';
        const providerStatus = String(row.provider_status || '').trim();
        const points = ['race','sprint'].includes(key) && row.points != null ? `${esc(formatPoints(row.points))} pts` : '';
        const evidence = row.entry_evidence;
        const evidenceSummary = String(evidence?.summary || '').trim();
        const evidenceSource = String(evidence?.source_name || '').trim();
        const evidenceUrl = String(evidence?.source_url || '').trim();
        const safeEvidenceUrl = /^https:\/\/[^\s"'<>]+$/i.test(evidenceUrl) ? evidenceUrl : '';
        const evidenceDetail = evidenceSummary
          ? `<span class="f1-entry-evidence-detail">${esc(evidenceSummary)}</span>`
          : '<span class="f1-entry-evidence-detail">Source-backed entry evidence.</span>';
        const evidenceSourceLabel = `<span class="f1-entry-evidence-source">Evidence only${evidenceSource ? ` · ${esc(evidenceSource)}` : ''}</span>`;
        const evidenceLink = safeEvidenceUrl
          ? `<a class="f1-mini-badge" href="${esc(safeEvidenceUrl)}" target="_blank" rel="noopener noreferrer">Source</a>`
          : '';
        const reviewedStatusNote = row.official_status_reviewed && !row.entry_state && ['race','sprint'].includes(key)
          ? '<span class="f1-entry-evidence-source">Officially reviewed result status</span>' : '';
        const resultValue = row.entry_state
          ? `<span class="f1-entry-evidence">${esc(entryStateLabel)}<br>${evidenceSourceLabel}<br>${evidenceDetail}<br>${evidenceLink}</span>`
          : key === 'grid' ? '' : isQualifying
            ? [segmentMarkup, providerStatus && providerStatus.toLowerCase() !== 'qualified' ? esc(providerStatus) : ''].filter(Boolean).join('<br>') || esc(providerStatus || '—')
            : nonFinish.includes(status) ? esc(row.status) : points || (row.status && row.position != null && !['classified','finished'].includes(status) ? esc(row.status) : '—');
        return `<div class="f1-classification-row"><span class="f1-standing-pos">${pos}</span><span style="flex:1;min-width:0">${name}${team}</span><span class="f1-weekend-result-value">${resultValue}${reviewedStatusNote ? `<br>${reviewedStatusNote}` : ''}</span></div>`;
      };
      const labels = { race:'Race', qualifying:'Qualifying', grid:'Grid', sprint:'Sprint', sprint_qualifying:'Sprint Qualifying' };
      const impact = data.championship_impact;
      const impactList = byId('f1-weekend-impact');
      if (impactList) {
        const groupMarkup = (label, rows) => rows?.length
          ? `<div class="f1-impact-note" role="heading" aria-level="3">${label}</div>` + rows.map(row => {
              const sessions = (row.session_types || []).map(type => labels[type] || type).join(' · ');
              const points = row.points == null ? 'Points unavailable' : `${esc(formatPoints(row.points))} pts`;
              return `<div class="f1-impact-row"><span><span class="f1-impact-driver">${esc(row.name)}</span><span class="f1-impact-note">${esc(sessions)}</span></span><span class="f1-impact-points">${points}</span></div>`;
            }).join('')
          : '';
        impactList.innerHTML = impact?.available
          ? groupMarkup('Driver points', impact.drivers) + groupMarkup('Constructor points', impact.constructors)
            + `<div class="f1-impact-note">${esc(impact.coverage_note || '')}</div>`
          : '';
      }
      if (impactSection) impactSection.hidden = !impact?.available;
      const tabs = byId('f1-weekend-session-tabs');
      if (tabs) tabs.innerHTML = availableKeys.map(key => `<button class="f1-chart-tab" type="button" data-weekend-session="${key}" aria-pressed="false">${labels[key]}</button>`).join('');
      const ids = { race:'f1-weekend-race', qualifying:'f1-weekend-quali', grid:'f1-weekend-grid', sprint:'f1-weekend-sprint', sprint_qualifying:'f1-weekend-sprint-quali' };
      const labelIds = { race:'f1-weekend-race-label', qualifying:'f1-weekend-quali-label', grid:'f1-weekend-grid-label', sprint:'f1-weekend-sprint-label', sprint_qualifying:'f1-weekend-sprint-quali-label' };
      availableKeys.forEach(key => {
        const session = findSession(key), rows = session?.results || [];
        const target = byId(ids[key]);
        if (target) target.innerHTML = rows.length ? `<div class="f1-weekend-result-head"><span>POS</span><span>DRIVER / TEAM</span><span>${key === 'grid' ? '' : key === 'qualifying' || key === 'sprint_qualifying' ? 'Q1 / Q2 / Q3' : 'POINTS / STATUS'}</span></div><div class="f1-classification-list">${rows.slice().sort((a,b) => (a.position ?? 999) - (b.position ?? 999)).map(row => classificationRowMarkup(row,key)).join('')}</div>` : `<div class="f1-result-placeholder">${labels[key]} classification unavailable.</div>`;
        set(labelIds[key], weekendResultLabel(key, rows));
      });
      const podium = byId('f1-weekend-podium');
      const observedPodium = data.podium;
      if (podium) podium.innerHTML = observedPodium?.available && observedPodium.entries?.length === 3
        ? `${observedPodium.status === "provisional" ? '<div class="f1-result-placeholder">Provisional podium from stored provider observations; final classification has not been confirmed.</div>' : ""}<div class="f1-weekend-podium">${observedPodium.entries.map((row, index) => {
          const position = index + 1;
          return `<div class="f1-weekend-podium-place"><span class="f1-weekend-podium-rank">P${position}</span><button type="button" data-app-open-driver="${esc(row.driver_id)}" data-app-season="${esc(seasonId)}">${esc(row.driver)}</button><button class="f1-weekend-podium-team" type="button" data-app-open-team="${esc(row.team_id)}" data-app-season="${esc(seasonId)}">${esc(row.team)}</button></div>`;
        }).join('')}</div>`
        : '<div class="f1-result-placeholder">Verified full podium unavailable.</div>';
      const hasRace = (findSession('race')?.results || []).length > 0;
      // Prefer the most recent stored classification. Session clocks are authoritative
      // when present; the fallback handles older weekends without verified times.
      const sessionOrder = ['sprint_qualifying', 'sprint', 'qualifying', 'grid', 'race'];
      const latest = availableKeys.filter(key => (findSession(key)?.results || []).length)
        .sort((a,b) => {
          const aTime = Date.parse(findSession(a)?.scheduled_at || '') || 0;
          const bTime = Date.parse(findSession(b)?.scheduled_at || '') || 0;
          return aTime - bTime || sessionOrder.indexOf(a) - sessionOrder.indexOf(b);
        }).at(-1);
      const initialSession = event.status === 'completed' && hasRace ? 'race' : latest || 'race';
      setWeekendSession(initialSession);
    } catch (error) {
      set('f1-weekend-page-title', 'Event unavailable');
      dataNote(byId('f1-weekend-sessions'), error.message);
      const tabs = byId('f1-weekend-session-tabs'); if (tabs) tabs.innerHTML = '';
    }
    root.style.visibility = 'visible';
  };
  const countryName = code => {
    if (!/^[A-Z]{2}$/.test(String(code || '').toUpperCase())) return '';
    try {
      const name = new Intl.DisplayNames(['en'], { type: 'region' }).of(String(code).toUpperCase());
      return name && name.toUpperCase() !== String(code).toUpperCase() ? name : '';
    } catch { return ''; }
  };
  const circuitGrandPrixHeading = events => {
    const names = events.filter(event => event.name && event.name !== event.official_name).map(event => event.name);
    return events.length && names.length === events.length && new Set(names).size === 1 ? names[0] : 'Grand Prix';
  };
  const renderCircuit = async (circuitId, seasonId = selectedSeason) => {
    selectedSeason = season(seasonId)?.id || selectedSeason;
    openDetail('circuit'); root.style.visibility = 'hidden';
    set('f1-circuit-title', 'Loading circuit');
    set('f1-circuit-canonical', ''); set('f1-circuit-location', '');
    const eventList = byId('f1-circuit-events'); if (eventList) eventList.innerHTML = '';
    const winnerList = byId('f1-circuit-winners'); if (winnerList) winnerList.innerHTML = '';
    const detailsSection = byId('f1-circuit-details-section'); if (detailsSection) detailsSection.hidden = true;
    try {
      const data = await fetchJson(`/api/circuit?circuit=${encodeURIComponent(circuitId)}`);
      const circuit = data.circuit;
      const shortName = circuit.name === 'Autodromo Nazionale Monza' ? 'Monza' : circuit.name;
      set('f1-circuit-title', shortName);
      const canonical = byId('f1-circuit-canonical');
      if (canonical) { canonical.textContent = shortName === circuit.name ? '' : circuit.name; canonical.hidden = shortName === circuit.name; }
      const place = [circuit.location, countryName(circuit.country_code)].filter(Boolean).join(', ');
      const location = byId('f1-circuit-location');
      if (location) { location.textContent = place; location.parentElement.hidden = !place; }

      const allCircuitEvents = data.events || [];
      set('f1-circuit-grand-prix-title', circuitGrandPrixHeading(allCircuitEvents));
      const selectedEvents = allCircuitEvents.filter(event => event.season_id === selectedSeason);
      const displayedEvents = selectedEvents.length ? selectedEvents : allCircuitEvents.slice(0, 1);
      if (eventList) eventList.innerHTML = displayedEvents.length ? displayedEvents.map(event =>
        `<button class="f1-circuit-event-card" type="button" data-app-round="${esc(event.id)}" data-app-season="${esc(event.season_id)}"><span class="f1-circuit-event-name">${esc(event.year)} ${esc(event.name)}</span><span class="f1-circuit-event-cta">Race weekend <i aria-hidden="true" data-lucide="arrow-right"></i></span></button>`
      ).join('') : '<div class="f1-result-placeholder">No stored Grand Prix event is available for this circuit.</div>';

      const winners = (data.recent_winners || allCircuitEvents.filter(e => e.winner).map(e => ({
        year: e.year, driver: e.winner.driver, constructor: e.winner.constructor, round_id: e.id, season_id: e.season_id
      }))).slice(0, 5);
      if (winnerList) winnerList.innerHTML = winners.length ? winners.map(event =>
        `<${event.round_id ? 'button' : 'div'} class="f1-circuit-winner-row" ${event.round_id ? `type="button" data-app-round="${esc(event.round_id)}" data-app-season="${esc(event.season_id)}"` : ''}><span class="f1-circuit-winner-year">${esc(event.year)}</span><span class="f1-circuit-winner-main"><span class="f1-circuit-winner-driver">${esc(event.driver)}</span><span class="f1-circuit-winner-team">${esc(event.constructor)}</span></span>${event.round_id ? '<i aria-hidden="true" data-lucide="chevron-right"></i>' : ''}</${event.round_id ? 'button' : 'div'}>`
      ).join('') : '<div class="f1-result-placeholder">No verified race winners are stored for this circuit.</div>';

      const details = [];
      const length = Number(circuit.length_m ?? circuit.verified_facts?.length_m);
      if (Number.isFinite(length) && length > 0) {
        const km = (length / 1000).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
        details.push(['Circuit length', `${km} km`]);
      }
      const corners = Number(circuit.turn_count ?? circuit.verified_facts?.turn_count);
      if (Number.isInteger(corners) && corners > 0) details.push(['Corners', String(corners)]);
      if (Number.isInteger(circuit.opened_year)) details.push(['Opened', String(circuit.opened_year)]);
      if (Number.isInteger(circuit.first_f1_gp_year)) details.push(['First F1 World Championship GP', String(circuit.first_f1_gp_year)]);
      const detailList = byId('f1-circuit-details');
      if (detailList && details.length) {
        detailList.innerHTML = details.map(([label, value]) => `<div class="f1-circuit-detail"><span class="f1-circuit-detail-label">${esc(label)}</span><span class="f1-circuit-detail-value">${esc(value)}</span></div>`).join('');
        if (detailsSection) detailsSection.hidden = false;
      }
      globalThis.lucide?.createIcons?.({ attrs: { width: 16, height: 16 } });
    } catch (error) {
      set('f1-circuit-title', 'Circuit unavailable');
      if (eventList) eventList.innerHTML = `<div class="f1-result-placeholder">${esc(error.message)}</div>`;
      if (winnerList) winnerList.innerHTML = '<div class="f1-result-placeholder">No verified race winners are available.</div>';
    } finally { root.style.visibility = 'visible'; }
  };
  const followsKey = 'f1-statistics-following';
  const loadFollows = () => { try { const value = JSON.parse(localStorage.getItem(followsKey) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } };
  app.follows = loadFollows();
  const isFollowed = (type, id) => app.follows.some(item => item.type === type && item.id === id);
  const toggleFollow = (type, id, name) => {
    app.follows = isFollowed(type, id) ? app.follows.filter(item => !(item.type === type && item.id === id)) : [...app.follows, { type, id, name, season: selectedSeason }];
    localStorage.setItem(followsKey, JSON.stringify(app.follows)); renderFollowing();
  };
  const renderFollowing = () => {
    app.follows = loadFollows();
    const list = byId('f1-favourite-list'); if (!list) return;
    const affiliationState = latestDriverSearchAffiliations();
    const rows = app.follows.map(item => {
      const subtitle = item.type === 'driver'
        ? driverAffiliationLabel(affiliationState.byDriver.get(item.id), affiliationState.latestYear)
        : '';
      return `<button class="f1-entity-row" type="button" data-app-open-${item.type}="${esc(item.id)}" data-app-season="${esc(item.season || selectedSeason)}"><span><span class="f1-entity-row-main">${esc(item.name)}</span>${subtitle ? `<span class="f1-entity-row-meta">${esc(subtitle)}</span>` : ''}</span><span class="f1-entity-row-meta">${item.type === 'team' ? 'TEAM' : 'DRIVER'}</span></button>`;
    }).join('');
    list.innerHTML = rows || '<div class="f1-search-empty">Nothing followed yet. Use the star on a driver or team profile.</div>';
  };
  const normalizeSearch = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const compareSearchText = (left, right) => left < right ? -1 : left > right ? 1 : 0;
  const searchItems = () => {
    const itemsByEntity = new Map();
    const seasons = [...app.seasons].sort((left, right) => Number(right.year) - Number(left.year) || compareSearchText(left.id, right.id));
    seasons.forEach(item => {
      item.drivers.forEach(driver => {
        const key = `driver:${driver.id}`;
        if (!itemsByEntity.has(key)) itemsByEntity.set(key, { type: 'Driver', name: driver.name, meta: '', action: 'driver', id: driver.id, season: item.id });
      });
      (app.standings.get(item.id)?.drivers || []).forEach(driver => {
        const key = `driver:${driver.id}`;
        if (driver.name && !itemsByEntity.has(key)) itemsByEntity.set(key, { type: 'Driver', name: driver.name, meta: '', action: 'driver', id: driver.id, season: item.id });
      });
      item.teams.forEach(team => {
        const key = `team:${team.id}`;
        if (!itemsByEntity.has(key)) itemsByEntity.set(key, { type: 'Team', name: team.name, meta: '', action: 'team', id: team.id, season: item.id });
      });
      (app.standings.get(item.id)?.constructors || []).forEach(team => {
        const key = `team:${team.id}`;
        if (team.name && !itemsByEntity.has(key)) itemsByEntity.set(key, { type: 'Team', name: team.name, meta: '', action: 'team', id: team.id, season: item.id });
      });
    });
    allEvents().forEach(event => {
      const circuitKey = `circuit:${event.circuit.id}`;
      if (!itemsByEntity.has(circuitKey)) itemsByEntity.set(circuitKey, { type: 'Circuit', name: event.circuit.name, meta: event.circuit.location, action: 'circuit', id: event.circuit.id, season: event.seasonId });
      const raceKey = `race:${event.id}`;
      if (!itemsByEntity.has(raceKey)) itemsByEntity.set(raceKey, { type: 'Race', name: event.name, meta: `${event.year} · Round ${event.round} · ${event.circuit.name}`, action: 'race', id: event.id, season: event.seasonId });
    });
    return [...itemsByEntity.values()];
  };
  const driverConstructorSearchAffiliations = () => {
    const affiliations = [];
    for (const seasonItem of app.seasons) {
      const teamsByName = new Map(seasonItem.teams.map(team => [normalizeSearch(team.name), team]));
      const byDriver = new Map();
      const standingsRows = app.standings.get(seasonItem.id)?.drivers || [];
      const standingsAffiliations = new Map();
      const driversWithStandings = new Set(standingsRows.map(row => row.id));
      for (const row of standingsRows) {
        const teamIds = [...new Set((row.teams || []).map(name => teamsByName.get(normalizeSearch(name))?.id).filter(Boolean))];
        if (teamIds.length) standingsAffiliations.set(row.id, teamIds);
      }
      for (const relation of seasonItem.driver_constructor_affiliations || []) {
        if (driversWithStandings.has(relation.driver_id)) continue;
        if (!byDriver.has(relation.driver_id)) byDriver.set(relation.driver_id, new Set());
        byDriver.get(relation.driver_id).add(relation.constructor_id);
      }
      for (const [driverId, teamIds] of standingsAffiliations) byDriver.set(driverId, new Set(teamIds));
      for (const [driverId, constructorIds] of byDriver) {
        for (const constructorId of constructorIds) {
          const team = seasonItem.teams.find(item => item.id === constructorId);
          if (team) affiliations.push({ driverId, constructorId, seasonId: seasonItem.id, year: Number(seasonItem.year), teamName: team.name });
        }
      }
    }
    const latestByDriverConstructor = new Map();
    for (const relation of affiliations) {
      const key = `${relation.driverId}:${relation.constructorId}`;
      const previous = latestByDriverConstructor.get(key);
      if (!previous || relation.year > previous.year || (relation.year === previous.year && relation.seasonId < previous.seasonId)) latestByDriverConstructor.set(key, relation);
    }
    return [...latestByDriverConstructor.values()];
  };
  const latestDriverSearchAffiliations = () => {
    const latestYear = Math.max(...app.seasons.map(seasonItem => Number(seasonItem.year)).filter(Number.isFinite));
    const affiliations = driverConstructorSearchAffiliations();
    const byDriver = new Map();
    for (const relation of affiliations) {
      const previous = byDriver.get(relation.driverId);
      if (!previous || relation.year > previous.year) {
        byDriver.set(relation.driverId, { ...relation, ambiguous: false });
      } else if (relation.year === previous.year && relation.constructorId !== previous.constructorId) {
        previous.ambiguous = true;
      }
    }
    return { affiliations, byDriver, latestYear };
  };
  const driverAffiliationLabel = (affiliation, latestYear) => {
    if (!affiliation || affiliation.ambiguous) return '';
    return affiliation.year === latestYear
      ? affiliation.teamName
      : `${affiliation.year} · ${affiliation.teamName}`;
  };
  const directSearchRank = (item, needle) => {
    if (!needle) return 6;
    const name = normalizeSearch(item.name);
    if (name === needle) return 0;
    if (name.startsWith(needle)) return 1;
    if (name.includes(needle)) return 2;
    return normalizeSearch(`${item.meta} ${item.type}`).includes(needle) ? 5 : null;
  };
  const compareSearchResults = (left, right) => left.rank - right.rank
    || (right.associationYear || 0) - (left.associationYear || 0)
    || compareSearchText(normalizeSearch(left.item.name), normalizeSearch(right.item.name))
    || compareSearchText(left.item.type, right.item.type)
    || compareSearchText(left.item.id, right.item.id);
  const renderSearch = (query = '') => {
    const target = byId('f1-search-content'); if (!target) return;
    const needle = normalizeSearch(query);
    const entities = searchItems();
    const resultsByEntity = new Map();
    const teamMatchRanks = new Map();
    const affiliationState = latestDriverSearchAffiliations();
    const { affiliations: driverAffiliations, byDriver: latestAssociationByDriver, latestYear } = affiliationState;
    for (const item of entities) {
      const rank = directSearchRank(item, needle);
      if (rank == null) continue;
      const association = item.action === 'driver' ? latestAssociationByDriver.get(item.id) : null;
      const meta = driverAffiliationLabel(association, latestYear) || item.meta;
      resultsByEntity.set(`${item.action}:${item.id}`, {
        item: meta === item.meta ? item : { ...item, meta }, rank, associationYear: 0,
      });
      if (item.action === 'team' && rank <= 2) teamMatchRanks.set(item.id, rank);
    }
    if (needle && teamMatchRanks.size) {
      const entitiesByDriver = new Map(entities.filter(item => item.action === 'driver').map(item => [item.id, item]));
      const bestRelationshipByDriver = new Map();
      for (const relation of driverAffiliations) {
        const teamRank = teamMatchRanks.get(relation.constructorId);
        const driver = entitiesByDriver.get(relation.driverId);
        if (teamRank == null || !driver) continue;
        const rank = relation.year === latestYear ? 3 : 4;
        const associationMeta = driverAffiliationLabel(relation, latestYear);
        const candidate = { item: { ...driver, meta: associationMeta, season: relation.seasonId }, rank, associationYear: relation.year, teamRank };
        const previous = bestRelationshipByDriver.get(relation.driverId);
        if (!previous || candidate.rank < previous.rank || (candidate.rank === previous.rank && (candidate.associationYear > previous.associationYear || (candidate.associationYear === previous.associationYear && candidate.teamRank < previous.teamRank)))) bestRelationshipByDriver.set(relation.driverId, candidate);
      }
      for (const [driverId, relation] of bestRelationshipByDriver) {
        const key = `driver:${driverId}`;
        const direct = resultsByEntity.get(key);
        if (!direct || relation.rank < direct.rank) resultsByEntity.set(key, relation);
      }
    }
    const results = [...resultsByEntity.values()].sort(compareSearchResults).slice(0, 32).map(result => result.item);
    target.innerHTML = results.length ? results.map(item => `<button class="f1-search-result" type="button" data-app-action="${item.action}" data-app-id="${esc(item.id)}" data-app-season="${esc(item.season)}"><span><span class="f1-search-result-name">${esc(item.name)}</span>${item.meta ? `<span class="f1-search-result-meta">${esc(item.meta)}</span>` : ''}</span><span class="f1-search-result-type">${item.type}</span></button>`).join('') : '<div class="f1-search-empty">No matching persisted drivers, teams, circuits, or races.</div>';
  };
  const profileLink = (side, driver) => {
    const button = root.querySelector(`[data-driver-${side}]`);
    if (button) { button.textContent = driver.name; button.dataset.appOpenDriver = driver.id; button.dataset.appSeason = selectedSeason; }
  };
  const setPair = (key, a, b) => {
    root.querySelectorAll(`[data-value-a="${key}"]`).forEach(el => el.textContent = a == null ? unavailable : String(a));
    root.querySelectorAll(`[data-value-b="${key}"]`).forEach(el => el.textContent = b == null ? unavailable : String(b));
  };
  let developmentCheckpoints = [];
  let developmentDrivers = { a: '', b: '' };
  let developmentMode = 'points';
  const chart = byId('f1-chart');
  const chartTooltip = byId('f1-chart-tooltip');
  const chartValue = (entry, mode) => mode === 'position' ? entry?.position : entry?.points;
  const chartValueText = (entry, mode) => {
    const value = chartValue(entry, mode);
    return value == null ? unavailable : mode === 'position' ? `P${value}` : `${formatPoints(value)} pts`;
  };
  const renderDevelopmentChart = () => {
    if (!chart) return;
    const openRoundButton = byId('f1-chart-open-round');
    if (openRoundButton) {
      openRoundButton.hidden = true;
      openRoundButton.removeAttribute('data-app-round');
      openRoundButton.removeAttribute('data-app-season');
    }
    const points = developmentCheckpoints.filter(item => item.status === 'available').map(item => ({ round: item.round, roundId: item.id, roundName: item.name, aEntry: item.a, bEntry: item.b, a: chartValue(item.a, developmentMode), b: chartValue(item.b, developmentMode) }))
      .filter(item => item.a != null && item.b != null);
    const segments = window.F1ComparisonMetrics.continuousSegments(points);
    const title = points.length ? `${developmentMode === 'points' ? 'Championship points' : 'Championship positions'} for ${developmentDrivers.a} and ${developmentDrivers.b} at available rounds` : 'Championship development';
    const hasProvisional = developmentCheckpoints.some(item => item.status === 'available' && item.source === 'calculated_provisional_awarded_points');
    const hasCalculated = developmentCheckpoints.some(item => item.status === 'available' && ['calculated_awarded_points', 'calculated_provisional_awarded_points'].includes(item.source));
    const desc = points.length ? `${points.length} calculated or official checkpoints shown.${hasProvisional ? ' Some checkpoints use provisional provider observations, not confirmed final results.' : ''} Gaps mark rounds without complete observed results.` : 'No championship checkpoints are available for this selection.';
    const legendA = byId('f1-chart-driver-a-name'), legendB = byId('f1-chart-driver-b-name');
    if (legendA) legendA.textContent = developmentDrivers.a || 'Driver A';
    if (legendB) legendB.textContent = developmentDrivers.b || 'Driver B';
    const summary = byId('f1-chart-summary');
    if (summary) summary.textContent = points.length ? `${points.length} ${hasProvisional ? 'provisional calculated' : hasCalculated ? 'calculated award' : 'verified'} ${points.length === 1 ? 'checkpoint' : 'checkpoints'} available; gaps are not connected.` : 'Championship development is unavailable for this selection.';
    chart.setAttribute('viewBox', '0 0 360 220');
    chart.innerHTML = `<title id="f1-chart-svg-title">${esc(title)}</title><desc id="f1-chart-svg-desc">${esc(desc)}</desc>`;
    if (!points.length) {
      chart.innerHTML += '<text class="f1-axis-text" x="180" y="108" text-anchor="middle">No championship checkpoints available</text>';
      chartTooltip?.classList.remove('is-visible');
      return;
    }
    const left = 42, right = 350, top = 18, bottom = 170;
    const rounds = points.map(item => Number(item.round)), minRound = Math.min(...rounds), maxRound = Math.max(...rounds);
    const values = points.flatMap(item => [Number(item.a), Number(item.b)]);
    let minValue = developmentMode === 'position' ? Math.min(...values) : 0;
    let maxValue = developmentMode === 'position' ? Math.max(...values) : Math.max(...values, 1);
    if (minValue === maxValue) { if (developmentMode === 'position') { minValue = Math.max(1, minValue - 1); maxValue += 1; } else maxValue += 1; }
    const x = round => minRound === maxRound ? (left + right) / 2 : left + (round - minRound) / (maxRound - minRound) * (right - left);
    const y = value => developmentMode === 'position' ? top + (Number(value) - minValue) / (maxValue - minValue) * (bottom - top) : bottom - Number(value) / maxValue * (bottom - top);
    const ticks = developmentMode === 'position' ? [...new Set([minValue, Math.round((minValue + maxValue) / 2), maxValue])] : [...new Set([0, Math.round(maxValue / 2), maxValue])];
    const content = [
      ...ticks.map(value => `<line class="f1-gridline" x1="${left}" x2="${right}" y1="${y(value)}" y2="${y(value)}"></line><text class="f1-axis-text" x="${left - 7}" y="${y(value) + 3}" text-anchor="end">${developmentMode === 'position' ? `P${value}` : esc(formatPoints(value))}</text>`),
      ...points.map(item => `<text class="f1-axis-text" x="${x(item.round)}" y="190" text-anchor="${item.round === minRound ? 'start' : item.round === maxRound ? 'end' : 'middle'}">Round ${esc(item.round)}</text>`),
      ...segments.flatMap(segment => [`<path class="f1-series-a" d="${segment.map((item,index)=>`${index?'L':'M'} ${x(item.round)} ${y(item.a)}`).join(' ')}"></path>`, `<path class="f1-series-b" d="${segment.map((item,index)=>`${index?'L':'M'} ${x(item.round)} ${y(item.b)}`).join(' ')}"></path>`]),
      ...points.flatMap(item => [`<circle class="f1-end-dot-a" cx="${x(item.round)}" cy="${y(item.a)}" r="4"></circle>`,`<circle class="f1-end-dot-b" cx="${x(item.round)}" cy="${y(item.b)}" r="4"></circle>`])
    ];
    chart.innerHTML += content.join('');
    const showTooltip = clientX => {
      if (!chartTooltip) return;
      const bounds = chart.getBoundingClientRect();
      const viewX = (clientX - bounds.left) * 360 / bounds.width;
      const index = points.reduce((best, item, i) => Math.abs(x(item.round) - viewX) < Math.abs(x(points[best].round) - viewX) ? i : best, 0);
      const item = points[index];
      if (openRoundButton && item.roundId) {
        openRoundButton.dataset.appRound = item.roundId;
        openRoundButton.dataset.appSeason = selectedSeason;
        openRoundButton.textContent = `Open ${item.roundName || `Round ${item.round}`} weekend`;
        openRoundButton.hidden = false;
      }
      chartTooltip.innerHTML = `<strong>Round ${esc(item.round)}</strong><br>${esc(developmentDrivers.a)}: ${esc(chartValueText(item.aEntry, developmentMode))}<br>${esc(developmentDrivers.b)}: ${esc(chartValueText(item.bEntry, developmentMode))}`;
      chartTooltip.style.left = `${Math.max(8, Math.min(bounds.width - 238, x(item.round) / 360 * bounds.width))}px`;
      chartTooltip.style.top = `${Math.max(4, y(item.a) / 220 * bounds.height - 54)}px`;
      chartTooltip.classList.add('is-visible');
    };
    chart.onpointermove = event => showTooltip(event.clientX);
    chart.onclick = event => showTooltip(event.clientX);
    chart.onpointerleave = () => chartTooltip?.classList.remove('is-visible');
  };
  const hasStoredRaceResult = result => result != null && (
    result.position != null || String(result.status ?? '').trim() !== ''
  );
  const roundResultLabel = result => {
    if (result?.position != null) return `P${esc(result.position)}`;
    const status = String(result?.status ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (!status) return unavailable;
    const labels = {
      classified: 'Classified', finished_unclassified: 'Finished unclassified',
      dnf: 'DNF', dns: 'DNS', dsq: 'DSQ', excluded: 'Excluded',
      withdrawn: 'Withdrawn', not_classified: 'Not classified', unknown: 'Unknown',
    };
    return esc(labels[status] || status.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase()));
  };
  const renderComparisonRoundDetails = () => {
    const list = byId('f1-event-list'), viewAll = byId('f1-view-all');
    if (!list) return;
    const isAllCircuits = !selectedCircuit || selectedCircuit === 'All circuits';
    const storedRaces = (comparisonRoundRows || [])
      .filter(race => [selectedDriverA, selectedDriverB].some(driverId => hasStoredRaceResult(race.results?.[driverId])))
      .sort((left, right) => Number(left.round) - Number(right.round));
    const showAll = isAllCircuits && comparisonRoundsExpanded;
    const visibleRaces = !isAllCircuits || showAll ? [...storedRaces].reverse() : storedRaces.slice(-3).reverse();
    list.innerHTML = visibleRaces.length ? visibleRaces.map(race => {
      const resultA = race.results?.[selectedDriverA], resultB = race.results?.[selectedDriverB];
      return `<button class="f1-calendar-row" type="button" data-app-round="${esc(race.id)}" data-app-season="${esc(selectedSeason)}"><div class="f1-calendar-row-main"><div><div class="f1-calendar-round">Round ${esc(race.round)}</div><div class="f1-calendar-name">${esc(race.name)}</div><div class="f1-calendar-meta">${esc(race.circuit.name)} · ${esc(race.circuit.location)}</div></div><div class="f1-calendar-side"><span class="f1-calendar-status">${roundResultLabel(resultA)} · ${roundResultLabel(resultB)}</span></div></div></button>`;
    }).join('') : '<div class="f1-result-placeholder">No persisted race results are available for this driver pair.</div>';
    if (viewAll) {
      const canExpand = isAllCircuits && storedRaces.length > 3;
      viewAll.hidden = !canExpand;
      viewAll.setAttribute('aria-expanded', String(canExpand && showAll));
      if (canExpand) viewAll.textContent = showAll ? 'Show latest 3 rounds' : `View all ${storedRaces.length} rounds`;
    }
  };
  const compareSelected = async () => {
    const requestId = ++comparisonRequest;
    const a = selectedDriverA, b = selectedDriverB;
    const selection = {
      seasonId: selectedSeason, circuit: selectedCircuit, driverA: a, driverB: b,
    };
    if (!selectedSeason || !a || !b || a === b) {
      comparisonRoundRows = null; comparisonRoundsExpanded = false;
      set('f1-comparison-context', 'Choose two different drivers from persisted season participation.');
      set('f1-comparison-data-note', 'Comparison values appear only when stored standings or results support them.');
      ['points','position','race','qualifying','wins','podiums','classified','outcomes','sprint-points','sprint-wins','sprint-podiums'].forEach(key => setPair(key, null, null));
      root.querySelectorAll('#f1-primary-section,#f1-h2h-section,#f1-outcomes-section,#f1-season-development-section,#f1-round-details-section').forEach(el => { el.hidden = true; });
      return;
    }
    root.querySelectorAll('#f1-primary-section,#f1-h2h-section,#f1-outcomes-section,#f1-season-development-section,#f1-round-details-section').forEach(el => { el.hidden = false; });
    const response = await fetchJson(`/api/comparison?season=${encodeURIComponent(selection.seasonId)}&driver_a=${encodeURIComponent(a)}&driver_b=${encodeURIComponent(b)}`);
    if (!comparisonSelectionIsCurrent(requestId, comparisonRequest, selection, {
      seasonId: selectedSeason, circuit: selectedCircuit,
      driverA: selectedDriverA, driverB: selectedDriverB,
    })) return;
    const [left, right] = response.drivers;
    profileLink('a', left); profileLink('b', right);
    set('f1-season-context-link', response.season.year);
    set('f1-comparison-context', `${left.name} vs ${right.name} · ${response.season.year}`);
    set('f1-comparison-data-note', `${standingsSourceDescription(response.standings?.source, response.standings?.available)} ${response.development?.metric_note || 'Some results may be unavailable.'}`);
    setPair('points', formatPoints(left.points), formatPoints(right.points)); setPair('position', left.championship_position == null ? null : ordinal(left.championship_position), right.championship_position == null ? null : ordinal(right.championship_position));
    const races = !selectedCircuit || selectedCircuit === 'All circuits' ? response.races : response.races.filter(item => item.circuit.name === selectedCircuit);
    const qualifying = !selectedCircuit || selectedCircuit === 'All circuits' ? (response.qualifying || []) : (response.qualifying || []).filter(item => item.circuit.name === selectedCircuit);
    const sprints = !selectedCircuit || selectedCircuit === 'All circuits' ? (response.sprints || []) : (response.sprints || []).filter(item => item.circuit.name === selectedCircuit);
    const sprintCoverage = response.session_coverage?.sprint || {expected: 0, captured: 0};
    const selectedSprintCoverage = !selectedCircuit || selectedCircuit === 'All circuits' ? sprintCoverage : (sprintCoverage.by_circuit?.[selectedCircuit] || {expected: 0, captured: 0});
    const measured = window.F1ComparisonMetrics.metrics({
      races, qualifying, sprints,
      sprintExpected: selectedSprintCoverage.expected ?? 0,
      sprintCaptured: selectedSprintCoverage.captured ?? 0,
      driverA: a, driverB: b,
    });
    if (measured.includesProvisional) set('f1-comparison-data-note', `${standingsSourceDescription(response.standings?.source, response.standings?.available)} Provisional observations are excluded from comparison totals and H2H denominators.`);
    setPair('race', measured.raceH2h.a, measured.raceH2h.b);
    const raceDenominator = root.querySelector('[data-value-a="race"]')?.closest('.f1-metric-row')?.querySelector('.f1-denom');
    if (raceDenominator) raceDenominator.textContent = `${measured.raceH2h.comparable} of ${races.length} scheduled races compared`;
    setPair('qualifying', measured.qualifyingH2h.a, measured.qualifyingH2h.b);
    const selectedQualifyingCoverage = !selectedCircuit || selectedCircuit === 'All circuits'
      ? (response.session_coverage?.qualifying || { expected: qualifying.length })
      : (response.session_coverage?.qualifying?.by_circuit?.[selectedCircuit] || { expected: qualifying.length });
    root.querySelectorAll('[data-value-a="qualifying"]')?.forEach(el => {
      const denom = el.closest('.f1-metric-row')?.querySelector('.f1-denom');
      if (denom) denom.textContent = `${measured.qualifyingH2h.comparable} of ${selectedQualifyingCoverage.expected ?? qualifying.length} scheduled sessions compared`;
    });
    setPair('wins', measured.raceStats[0].wins, measured.raceStats[1].wins); setPair('podiums', measured.raceStats[0].podiums, measured.raceStats[1].podiums);
    setPair('classified', measured.raceStats[0].classified, measured.raceStats[1].classified);
    setPair('outcomes', measured.raceStats[0].outcomes, measured.raceStats[1].outcomes);
    setPair('sprint-points', measured.sprintStats[0].points == null ? null : formatPoints(measured.sprintStats[0].points), measured.sprintStats[1].points == null ? null : formatPoints(measured.sprintStats[1].points));
    setPair('sprint-wins', measured.sprintStats[0].wins, measured.sprintStats[1].wins); setPair('sprint-podiums', measured.sprintStats[0].podiums, measured.sprintStats[1].podiums);
    set('f1-sprint-context', selectedSprintCoverage.expected ? `Separate from Grand Prix metrics · ${selectedSprintCoverage.captured}/${selectedSprintCoverage.expected} Sprint sessions captured${measured.includesProvisional ? ' · provisional observations' : ''}` : 'No Sprint sessions are scheduled for this selection.');
    set('f1-h2h-note', window.F1ComparisonMetrics.headToHeadNote(
      measured.raceH2h, measured.qualifyingH2h, races.length,
      selectedQualifyingCoverage.expected ?? qualifying.length,
    ));
    comparisonRoundRows = races;
    comparisonRoundsExpanded = false;
    renderComparisonRoundDetails();
    developmentDrivers = { a: left.name, b: right.name };
    developmentCheckpoints = response.development?.rounds || [];
    renderDevelopmentChart();
  };
  const setCompareOptions = () => {
    const select = byId('f1-season');
    options(select, app.seasons.map(item => ({ value: item.id, label: String(item.year) })), selectedSeason, 'No imported seasons');
    const people = driversFor(selectedSeason).map(item => ({ value: item.id, label: item.name }));
    options(byId('f1-driver-a'), people, selectedDriverA, 'Select driver');
    options(byId('f1-driver-b'), people, selectedDriverB, 'Select driver');
    const circuits = [...new Set((currentCalendar(selectedSeason)?.rounds || []).map(item => item.circuit.name))].map(name => ({ value: name, label: name }));
    options(byId('f1-circuit'), [{ value: 'All circuits', label: 'All circuits' }, ...circuits], selectedCircuit || 'All circuits');
    if (!app.seasons.length) set('f1-comparison-data-note', 'No imported seasons are available.');
  };
  const openCompare = async (a = selectedDriverA, b = selectedDriverB, seasonId = selectedSeason) => {
    selectedSeason = season(seasonId)?.id || currentSeason()?.id || '';
    selectedDriverA = a && driversFor(selectedSeason).some(item => item.id === a) ? a : '';
    selectedDriverB = b && driversFor(selectedSeason).some(item => item.id === b) ? b : '';
    setCompareOptions(); show('compare');
    try { await compareSelected(); } catch (error) { set('f1-comparison-data-note', error.message); }
  };
  const openFromSearch = item => {
    if (item.action === 'driver') openDriver(item.id, item.season);
    else if (item.action === 'team') openTeam(item.id, item.season);
    else if (item.action === 'race') openWeekend(item.id, item.season);
    else if (item.action === 'circuit') renderCircuit(item.id, item.season);
  };

  const handleClick = event => {
    const target = event.target.closest('button,[data-nav]'); if (!target || !root.contains(target)) return;
    const stop = () => { event.preventDefault(); event.stopPropagation(); };
    if (target.dataset.nav) { stop(); detailNavigationStack.length = 0; selectedSeason = currentSeason()?.id || ''; show(target.dataset.nav); if (screen === 'home') renderHome(); if (screen === 'calendar') renderCalendar(); if (screen === 'following') renderFollowing(); if (screen === 'search') renderSearch(byId('f1-global-search')?.value || ''); if (screen === 'compare') { setCompareOptions(); compareSelected().catch(() => {}); } return; }
    if (target.dataset.weekendTab) { stop(); setWeekendTab(target.dataset.weekendTab); return; }
    if (target.dataset.weekendSession) { stop(); setWeekendSession(target.dataset.weekendSession); return; }
    if (target.dataset.profileTab) { stop(); setDriverProfileTab(target.dataset.profileTab); return; }
    if (target.dataset.teamProfileTab) { stop(); setTeamProfileTab(target.dataset.teamProfileTab); return; }
    if (target.dataset.careerView) { stop(); setCareerView(target.dataset.careerView); return; }
    if (target.dataset.appOpenDriver) { stop(); openDriver(target.dataset.appOpenDriver, target.dataset.appSeason); return; }
    if (target.dataset.appOpenTeam) { stop(); openTeam(target.dataset.appOpenTeam, target.dataset.appSeason); return; }
    if (target.hasAttribute('data-calendar-jump')) {
      stop();
      const row = [...root.querySelectorAll('.f1-calendar-row')].find(item =>
        item.dataset.appRound === target.dataset.calendarTarget && item.dataset.appSeason === target.dataset.calendarSeason);
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'start' });
        row.classList.add('is-jump-target');
        window.setTimeout(() => row.classList.remove('is-jump-target'), 1800);
      }
      return;
    }
    if (target.dataset.appRound) { stop(); openWeekend(target.dataset.appRound, target.dataset.appSeason); return; }
    if (target.dataset.appOpenCircuit) { stop(); renderCircuit(target.dataset.appOpenCircuit,target.dataset.appSeason); return; }
    if (target.dataset.appAction) { stop(); openFromSearch({ action: target.dataset.appAction, id: target.dataset.appId, season: target.dataset.appSeason }); return; }
    if (target.id === 'f1-profile-back' || target.id === 'f1-team-back' || target.id === 'f1-weekend-back' || target.id === 'f1-circuit-back') { stop(); goBackFromDetail(); return; }
    if (target.id === 'f1-swap') { stop(); [selectedDriverA, selectedDriverB] = [selectedDriverB, selectedDriverA]; setCompareOptions(); compareSelected().catch(error => set('f1-comparison-data-note', error.message)); return; }
    if (target.hasAttribute('data-team-open-compare')) {
      stop();
      if (selectedTeamCompareDrivers.length >= 2) openCompare(selectedTeamCompareDrivers[0], selectedTeamCompareDrivers[1], selectedSeason);
      return;
    }
    if (target.id === 'f1-profile-favourite') { stop(); toggleFollow('driver',selectedDriverId,byId('f1-profile-name')?.textContent); target.setAttribute('aria-pressed',String(isFollowed('driver',selectedDriverId))); return; }
    if (target.id === 'f1-team-favourite') { stop(); toggleFollow('team',selectedTeamId,byId('f1-team-title')?.textContent); target.setAttribute('aria-pressed',String(isFollowed('team',selectedTeamId))); return; }
    if (target.id === 'f1-view-all' && screen === 'compare' && comparisonRoundRows !== null) { stop(); comparisonRoundsExpanded = !comparisonRoundsExpanded; renderComparisonRoundDetails(); return; }
    if (target.classList.contains('f1-chart-tab')) { stop(); developmentMode = target.dataset.mode === 'position' ? 'position' : 'points'; root.querySelectorAll('.f1-chart-tab').forEach(button => button.setAttribute('aria-pressed', String(button === target))); renderDevelopmentChart(); return; }
    if (target.dataset.gapMode) { stop(); gapMode=target.dataset.gapMode; root.querySelectorAll('[data-gap-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button===target))); renderStandings(); return; }
    if (target.dataset.standingType) { stop(); standingsMode=target.dataset.standingType; root.querySelectorAll('[data-standing-type]').forEach(button=>button.setAttribute('aria-pressed',String(button===target))); byId('f1-driver-standings-block').hidden=standingsMode!=='drivers'; byId('f1-constructor-standings-block').hidden=standingsMode!=='constructors'; renderStandings(); return; }
    if (target.hasAttribute('data-open-calendar')) { stop(); renderCalendarScreen(); return; }
    if (target.hasAttribute('data-scroll-standings')) { stop(); show('home'); byId('f1-standings-title')?.scrollIntoView({behavior:'smooth'}); return; }
    if (target.dataset.appNextCircuit) { stop(); renderCircuit(target.dataset.appNextCircuit,selectedSeason); return; }
    if (target.hasAttribute('data-chart-mode')) { stop(); return; }
  };
  const handleChange = event => {
    const target=event.target;
    if (target.id==='f1-standings-season') { event.stopImmediatePropagation(); selectedSeason=target.value; renderHome(); return; }
    if (target.id==='f1-calendar-season') { event.stopImmediatePropagation(); selectedSeason=target.value; renderCalendar(); return; }
    if (target.id==='f1-season') { event.stopImmediatePropagation(); selectedSeason=target.value; selectedCircuit='All circuits'; setCompareOptions(); compareSelected().catch(error=>set('f1-comparison-data-note',error.message)); return; }
    if (target.id==='f1-driver-a') { event.stopImmediatePropagation(); selectedDriverA=target.value; setCompareOptions(); compareSelected().catch(error=>set('f1-comparison-data-note',error.message)); return; }
    if (target.id==='f1-driver-b') { event.stopImmediatePropagation(); selectedDriverB=target.value; setCompareOptions(); compareSelected().catch(error=>set('f1-comparison-data-note',error.message)); return; }
    if (target.id==='f1-circuit') { event.stopImmediatePropagation(); selectedCircuit=target.value; compareSelected().catch(error=>set('f1-comparison-data-note',error.message)); }
  };
  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', event => {
    if (event.target.matches?.('[data-weekend-tab]')) {
      const tabs = [...root.querySelectorAll('[data-weekend-tab]')];
      const index = tabs.indexOf(event.target);
      const next = event.key === 'ArrowRight' ? tabs[(index + 1) % tabs.length] : event.key === 'ArrowLeft' ? tabs[(index - 1 + tabs.length) % tabs.length] : event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : null;
      if (next) { event.preventDefault(); setWeekendTab(next.dataset.weekendTab, true); }
      return;
    }
    if (event.target.matches?.('[data-team-profile-tab]')) {
      const tabs = [...root.querySelectorAll('[data-team-profile-tab]')];
      const index = tabs.indexOf(event.target);
      const next = event.key === 'ArrowRight' ? tabs[(index + 1) % tabs.length]
        : event.key === 'ArrowLeft' ? tabs[(index - 1 + tabs.length) % tabs.length]
        : event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : null;
      if (next) { event.preventDefault(); setTeamProfileTab(next.dataset.teamProfileTab, true); }
      return;
    }
    if (!event.target.matches?.('[data-profile-tab]')) return;
    const tabs = [...root.querySelectorAll('[data-profile-tab]')];
    const index = tabs.indexOf(event.target);
    const next = event.key === 'ArrowRight' ? tabs[(index + 1) % tabs.length]
      : event.key === 'ArrowLeft' ? tabs[(index - 1 + tabs.length) % tabs.length]
      : event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : null;
    if (next) { event.preventDefault(); setDriverProfileTab(next.dataset.profileTab, true); }
  }, true);
  document.addEventListener('change', handleChange, true);
  document.addEventListener('input', event => { if (event.target.id === 'f1-global-search') { event.stopImmediatePropagation(); renderSearch(event.target.value); } }, true);

  const bootstrap = async () => {
    const darkMode = window.matchMedia?.('(prefers-color-scheme: dark)');
    const applyTheme = () => { document.documentElement.dataset.theme = darkMode?.matches ? 'dark' : 'light'; };
    applyTheme(); darkMode?.addEventListener?.('change', applyTheme);
    const response = await fetchJson('/api/options');
    app.seasons = response.seasons || [];
    selectedSeason = app.seasons[0]?.id || '';
    await Promise.all(app.seasons.map(async item => {
      const [standings, calendar] = await Promise.all([
        fetchJson(`/api/standings?season=${encodeURIComponent(item.id)}`),
        fetchJson(`/api/calendar?season=${encodeURIComponent(item.id)}`)
      ]);
      app.standings.set(item.id, standings); app.calendars.set(item.id, calendar);
    }));
    renderHome(); renderCalendar(); renderFollowing(); renderSearch('');
    setCompareOptions();
    const prototypeViewAll = byId('f1-view-all');
    if (prototypeViewAll) {
      const connectedViewAll = prototypeViewAll.cloneNode(true);
      connectedViewAll.hidden = true;
      connectedViewAll.textContent = '';
      connectedViewAll.setAttribute('aria-expanded', 'false');
      prototypeViewAll.replaceWith(connectedViewAll);
    }
    const careerNote = root.querySelector('#f1-profile-career-title')?.closest('.f1-profile-section')?.querySelector('.f1-prototype-note');
    if (careerNote) careerNote.textContent = 'Career totals are unavailable without a verified complete career snapshot.';
    const resultNote = root.querySelector('#f1-profile-results')?.parentElement?.querySelector('.f1-prototype-note');
    if (resultNote) resultNote.textContent = 'Results show persisted classifications only.';
    root.style.visibility = 'visible';
  };
  bootstrap().catch(error => {
    dataNote(byId('f1-standings-list'), error.message);
    dataNote(byId('f1-calendar-list'), error.message);
    root.style.visibility = 'visible';
  });
})();

