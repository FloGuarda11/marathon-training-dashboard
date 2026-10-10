
let state = {
  data: null,
  settings: null,
  week: 0
};

const $ = s => document.querySelector(s);

const pace = (hours, distanceKm) => {
  if (!hours || !distanceKm || distanceKm <= 0) return '–';

  const minutesPerKm = (hours / distanceKm) * 60;
  const minutes = Math.floor(minutesPerKm);
  const seconds = Math.round((minutesPerKm - minutes) * 60);

  return `${minutes + (seconds === 60 ? 1 : 0)}:${String(seconds === 60 ? 0 : seconds).padStart(2, '0')}/km`;
};

const km = meters =>
  Number.isFinite(Number(meters))
    ? (Number(meters) / 1000).toFixed(1)
    : '0.0';

function sessionSport(s) {
  const sport = s.sport;

  return [
    typeof sport === 'string' ? sport : '',
    sport?.id,
    sport?.name,
    sport?.title,
    s.sportName,
    s.sportType,
    s.activityType
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function isRun(s) {
  const sport = sessionSport(s);

  // Falls Polar keine Sportart übermittelt, behalten wir
  // die bisherige Fallback-Logik bei.
  if (!sport.trim()) return true;

  return [
    'run',
    'running',
    'laufen',
    'jogging',
    'trail running',
    'road running',
    'treadmill'
  ].some(term => sport.includes(term));
}

function sessionDate(s) {
  if (!s.startTime) return '';

  const value = String(s.startTime);

  // Bei ISO-Zeitstempeln das Kalenderdatum des Zeitstempels
  // verwenden, ohne ihn versehentlich doppelt umzuwandeln.
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '';

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function actualPace(s) {
  const durationMs = Number(s.durationMillis || 0);
  const distanceMeters = Number(s.distanceMeters || 0);

  if (durationMs <= 0 || distanceMeters <= 0) return '–';

  return pace(
    durationMs / 3600000,
    distanceMeters / 1000
  );
}

function weekSessions(w) {
  if (!state.data?.sessions || !w) return [];

  return state.data.sessions
    .filter(s => {
      const date = sessionDate(s);

      return (
        date >= w.start &&
        date <= w.end &&
        isRun(s)
      );
    })
    .sort((a, b) =>
      String(a.startTime || '').localeCompare(
        String(b.startTime || '')
      )
    );
}

function match(wi, planned) {
  const w = state.data?.plan?.[wi];

  if (!w) return null;

  const runs = weekSessions(w);

  if (!runs.length) return null;

  const plannedTime = new Date(
    `${planned.date}T12:00:00`
  ).getTime();

  return runs
    .map(s => {
      const date = sessionDate(s);

      const actualTime = date
        ? new Date(`${date}T12:00:00`).getTime()
        : new Date(s.startTime).getTime();

      return {
        s,
        score: Math.abs(actualTime - plannedTime)
      };
    })
    .sort((a, b) => a.score - b.score)[0]?.s || null;
}

function adaptive(wi) {
  const w = state.data.plan[wi];
  const runs = weekSessions(w);

  if (!runs.length) {
    return {
      title: 'Noch keine Polar-Daten',
      text: 'Sobald ein Lauf synchronisiert ist, wird die Woche automatisch bewertet.'
    };
  }

  const total = runs.reduce(
    (sum, s) => sum + Number(s.distanceMeters || 0),
    0
  ) / 1000;

  const load = runs.reduce(
    (sum, s) => sum + Number(s.trainingLoad || 0),
    0
  );

  const heartRates = runs
    .map(s => Number(s.hrAvg || 0))
    .filter(hr => hr > 0);

  const avg = heartRates.length
    ? Math.round(
        heartRates.reduce((a, b) => a + b, 0) /
        heartRates.length
      )
    : null;

  if (load > 700) {
    return {
      title: 'Belastung hoch',
      text: `Diese Woche liegen ca. ${Math.round(load)} Polar Training Load an. Nächste harte Einheit um 20–30 % kürzen und den langen Lauf locker halten.`
    };
  }

  if (avg && avg > 158) {
    return {
      title: 'Herzfrequenz erhöht',
      text: `Durchschnittliche HF der Läufe: ${avg} bpm. Wenn die Pace dabei nicht besser wird, Intensität reduzieren und Erholung priorisieren.`
    };
  }

  return {
    title: 'Plan wie vorgesehen',
    text: `${total.toFixed(1)} km erfasst. Die nächste Woche kann regulär fortgesetzt werden; fehlende Einheiten nicht nachholen.`
  };
}

function render() {
  if (!state.data || !state.settings) return;

  const p = state.data.plan || [];

  if (!p.length) {
    $('#sessions').innerHTML =
      '<div class="muted">Kein Trainingsplan verfügbar.</div>';
    return;
  }

  // Sicherstellen, dass eine gültige Woche ausgewählt ist.
  state.week = Math.max(
    0,
    Math.min(state.week, p.length - 1)
  );

  $('#week').innerHTML = p.map((w, i) =>
    `<option value="${i}">KW ${w.week} · ${w.start}–${w.end}</option>`
  ).join('');

  $('#week').value = state.week;

  const w = p[state.week];

  $('#weekInfo').innerHTML = `
    <div class="weekmeta">
      <span class="tag">${w.phase}</span>
      <span class="tag">${w.start} bis ${w.end}</span>
      <span class="tag">3 Läufe/Woche</span>
    </div>
  `;

  $('#sessions').innerHTML = w.sessions.map(x => {
    const actual = match(state.week, x);

    return `
      <div class="workout">
        <div>
          <div class="date">${x.day}</div>
          <div class="type">${x.date}</div>
        </div>

        <div>
          <strong>${x.title}</strong>
          <div class="detail">${x.detail}</div>

          ${actual ? `
            <div class="muted">
              Polar: ${km(actual.distanceMeters)} km ·
              ${actualPace(actual)} ·
              Ø HF ${actual.hrAvg || '–'} ·
              Load ${actual.trainingLoad || '–'}
            </div>
          ` : ''}
        </div>

        <div class="${actual ? 'match' : 'match warn'}">
          ${actual ? 'erfasst' : 'offen'}
        </div>
      </div>
    `;
  }).join('');

  const runs = weekSessions(w);

  $('#runs').innerHTML = runs.length
    ? runs.map(s => `
        <div class="run">
          <div class="runmain">
            <strong>${sessionDate(s)}</strong>
            <strong>${km(s.distanceMeters)} km</strong>
          </div>

          <div class="muted">
            ${actualPace(s)} ·
            Ø HF ${s.hrAvg || '–'} ·
            Load ${s.trainingLoad || '–'} ·
            ${s.trainingBenefit || ''}
          </div>
        </div>
      `).join('')
    : '<div class="muted">Keine Läufe für diese Woche synchronisiert.</div>';

  const advice = adaptive(state.week);

  $('#advice').innerHTML = `
    <div class="advice">
      <strong>${advice.title}</strong><br>
      ${advice.text}
    </div>
  `;

  const today = new Date();

  const upcoming =
    w.sessions.find(x =>
      new Date(`${x.date}T23:59:59`) >= today
    ) || w.sessions[0];

  $('#next').textContent = upcoming.title;

  $('#nextDetail').textContent =
    `${upcoming.date} · ${upcoming.detail}`;

  const thisWeek = runs.reduce(
    (sum, s) => sum + Number(s.distanceMeters || 0),
    0
  ) / 1000;

  $('#km').textContent = `${thisWeek.toFixed(1)} km`;

  const plannedKm = w.sessions.reduce((sum, s) => {
    const matchKm = s.title === 'Langer Lauf'
      ? Number((s.detail.match(/\d+(?:[.,]\d+)?/) || [0])[0].replace(',', '.'))
      : 10;

    return sum + matchKm;
  }, 0);

  $('#kmDetail').textContent =
    `von ca. ${plannedKm} km geplant`;

  $('#syncTime').textContent = state.data.syncedAt
    ? new Date(state.data.syncedAt).toLocaleString(
        'de-CH',
        { dateStyle: 'short', timeStyle: 'short' }
      )
    : 'noch nie';

  const allRuns = state.data.sessions.filter(isRun);

  $('#sessionCount').textContent =
    `${allRuns.length} Läufe gespeichert`;

  const load = runs.reduce(
    (sum, s) => sum + Number(s.trainingLoad || 0),
    0
  );

  $('#load').textContent = load
    ? Math.round(load)
    : '–';

  $('#loadText').textContent =
    load > 700
      ? 'hoch'
      : load
      ? 'normal'
      : 'keine Daten';

  $('#maxHr').value = state.settings.maxHr ?? 187;
  $('#restHr').value = state.settings.restHr ?? 55;
  $('#goalPace').value = state.settings.goalPace ?? 4.5;
}

async function load() {
  try {
    const [dataResponse, settingsResponse, configResponse] =
      await Promise.all([
        fetch('/api/data'),
        fetch('/api/settings'),
        fetch('/api/config')
      ]);

    if (!dataResponse.ok ||
        !settingsResponse.ok ||
        !configResponse.ok) {
      throw new Error('Dashboard-Daten konnten nicht geladen werden.');
    }

    const [data, settings, config] = await Promise.all([
      dataResponse.json(),
      settingsResponse.json(),
      configResponse.json()
    ]);

    state.data = data;
    state.settings = settings;

    $('#status').textContent =
      config.connected
        ? 'Polar verbunden'
        : 'Polar nicht verbunden';

    $('#connect').style.display =
      config.connected ? 'none' : 'inline-block';

    $('#sync').style.display =
      config.connected ? 'inline-block' : 'none';

    render();
  } catch (error) {
    console.error('Dashboard LOAD ERROR:', error);

    $('#status').textContent =
      'Fehler beim Laden der Daten';

    alert(error.message);
  }
}

$('#week').addEventListener('change', event => {
  state.week = Number(event.target.value);
  render();
});

$('#sync').addEventListener('click', async () => {
  const button = $('#sync');

  button.disabled = true;
  button.textContent = 'Synchronisiere…';

  try {
    const response = await fetch('/api/sync', {
      method: 'POST'
    });

    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(
        result.error || 'Polar-Synchronisierung fehlgeschlagen.'
      );
    }

    await load();

    alert(
      `Synchronisierung erfolgreich.\n${result.count} Trainingseinheiten geladen.`
    );
  } catch (error) {
    console.error('POLAR SYNC ERROR:', error);
    alert(error.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Jetzt synchronisieren';
  }
});

$('#save').addEventListener('click', async () => {
  try {
    const response = await fetch('/api/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        maxHr: Number($('#maxHr').value),
        restHr: Number($('#restHr').value),
        goalPace: Number($('#goalPace').value)
      })
    });

    if (!response.ok) {
      throw new Error('Einstellungen konnten nicht gespeichert werden.');
    }

    state.settings = await response.json();

    alert('Gespeichert');
  } catch (error) {
    console.error('SETTINGS ERROR:', error);
    alert(error.message);
  }
});

load();
