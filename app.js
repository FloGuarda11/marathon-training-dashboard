
let state = {
  data: null,
  settings: null,
  week: 0
};

const $ = selector => document.querySelector(selector);

function pace(hours, distanceKm) {
  if (!hours || !distanceKm || distanceKm <= 0) return "–";

  const totalSeconds = Math.round(hours * 3600 / distanceKm);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}/km`;
}

function km(meters) {
  return ((meters || 0) / 1000).toFixed(1);
}

function sessionSport(s) {
  const sport = s.sport;

  return [
    typeof sport === "string" ? sport : "",
    sport?.id,
    sport?.name,
    sport?.title,
    s.sportName,
    s.sportType,
    s.activityType
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isRun(s) {
  const sport = s.sport;

  // Die bei deinem Polar-Lauf vorhandene Sport-ID.
  if (sport && String(sport.id) === "1") {
    return true;
  }

  const name = sessionSport(s);

  return (
    name.includes("run") ||
    name.includes("laufen") ||
    name.includes("jogging")
  );
}

function sessionDate(s) {
  if (!s.startTime) return "";

  return String(s.startTime).slice(0, 10);
}

function actualPace(s) {
  const durationHours = (s.durationMillis || 0) / 3600000;
  const distanceKm = (s.distanceMeters || 0) / 1000;

  return pace(durationHours, distanceKm);
}

function weekSessions(w) {
  const sessions = state.data?.sessions || [];

  return sessions
    .filter(s => {
      const date = sessionDate(s);

      return (
        date >= w.start &&
        date <= w.end &&
        isRun(s)
      );
    })
    .sort((a, b) =>
      String(a.startTime).localeCompare(String(b.startTime))
    );
}

function plannedDistanceKm(workout) {
  const detail = workout.detail || "";
  const title = workout.title || "";
  const text = `${title} ${detail}`;

  const range = text.match(
    /(\d+(?:[.,]\d+)?)\s*(?:–|-|bis)\s*(\d+(?:[.,]\d+)?)\s*km/i
  );

  if (range) {
    return (
      Number(range[1].replace(",", ".")) +
      Number(range[2].replace(",", "."))
    ) / 2;
  }

  const single = text.match(
    /(\d+(?:[.,]\d+)?)\s*km/i
  );

  return single
    ? Number(single[1].replace(",", "."))
    : null;
}

function matchWeek(weekIndex) {
  const week = state.data.plan[weekIndex];
  const runs = weekSessions(week);
  const workouts = week.sessions;

  const assignments = new Map();
  const usedRuns = new Set();
  const candidates = [];

  workouts.forEach((workout, workoutIndex) => {
    const targetKm = plannedDistanceKm(workout);

    const workoutName =
      `${workout.title || ""} ${workout.detail || ""}`;

    const isLongRun =
      /longrun|langer lauf/i.test(workoutName);

    const plannedDate = new Date(
      `${workout.date}T12:00:00`
    );

    const plannedDay = plannedDate.getDay();

    runs.forEach((run, runIndex) => {
      const date = sessionDate(run);
      if (!date) return;

      const runDate = new Date(`${date}T12:00:00`);
      const runDay = runDate.getDay();

      const daysApart = Math.round(
        Math.abs(runDate - plannedDate) / 86400000
      );

      // Normale Einheiten: maximal einen Tag verschoben.
      // Longruns: Samstag oder Montag als Ausweichtermin
      // zum geplanten Sonntag erlauben.
      const allowedDays = isLongRun ? 1 : 1;

      if (daysApart > allowedDays) return;

      if (
        isLongRun &&
        plannedDay === 0 &&
        runDay !== 0 &&
        runDay !== 6 &&
        runDay !== 1
      ) {
        return;
      }

      const actualKm =
        (run.distanceMeters || 0) / 1000;

      if (actualKm <= 0) return;

      // Ein deutlich zu kurzer Lauf ist kein Longrun.
      if (
        isLongRun &&
        targetKm &&
        actualKm < targetKm * 0.78
      ) {
        return;
      }

      // Auch bei anderen Einheiten eine grobe
      // Mindestdistanz verlangen.
      if (
        !isLongRun &&
        targetKm &&
        actualKm < targetKm * 0.55
      ) {
        return;
      }

      let score = daysApart * 20;

      if (targetKm) {
        score +=
          Math.abs(actualKm - targetKm) /
          targetKm * 30;
      }

      // Niedrigere Punktzahl = bessere Übereinstimmung.
      if (score <= 55) {
        candidates.push({
          workoutIndex,
          runIndex,
          score
        });
      }
    });
  });

  candidates.sort((a, b) => a.score - b.score);

  // Jede Einheit und jeder Lauf darf nur einmal verwendet werden.
  candidates.forEach(candidate => {
    if (assignments.has(candidate.workoutIndex)) return;
    if (usedRuns.has(candidate.runIndex)) return;

    assignments.set(
      candidate.workoutIndex,
      runs[candidate.runIndex]
    );

    usedRuns.add(candidate.runIndex);
  });

  return assignments;
}

function adaptive(weekIndex) {
  const week = state.data.plan[weekIndex];
  const runs = weekSessions(week);

  if (!runs.length) {
    return {
      title: "Noch keine Polar-Daten",
      text: "Sobald ein Lauf synchronisiert ist, wird die Woche automatisch bewertet."
    };
  }

  const total = runs.reduce(
    (sum, run) => sum + (run.distanceMeters || 0),
    0
  ) / 1000;

  const load = runs.reduce(
    (sum, run) => sum + (run.trainingLoad || 0),
    0
  );

  const heartRates = runs
    .map(run => run.hrAvg)
    .filter(Boolean);

  const avg = heartRates.length
    ? Math.round(
        heartRates.reduce((sum, value) => sum + value, 0) /
        heartRates.length
      )
    : null;

  if (load > 700) {
    return {
      title: "Belastung hoch",
      text: `Diese Woche liegen ca. ${Math.round(load)} Polar Training Load an. Nächste harte Einheit um 20–30 % kürzen und den langen Lauf locker halten.`
    };
  }

  if (avg && avg > 158) {
    return {
      title: "Herzfrequenz erhöht",
      text: `Durchschnittliche HF der Läufe: ${avg} bpm. Wenn die Pace dabei nicht besser wird, Intensität reduzieren und Erholung priorisieren.`
    };
  }

  return {
    title: "Plan wie vorgesehen",
    text: `${total.toFixed(1)} km erfasst. Fehlende Einheiten nicht nachholen; die nächste Woche kann regulär fortgesetzt werden.`
  };
}

function render() {
  if (!state.data?.plan || !state.settings) return;

  const plan = state.data.plan;
  const weekSelect = $("#week");

  weekSelect.innerHTML = plan
    .map((week, index) =>
      `<option value="${index}">KW ${week.week} · ${week.start}–${week.end}</option>`
    )
    .join("");

  state.week = Math.max(
    0,
    Math.min(state.week, plan.length - 1)
  );

  weekSelect.value = state.week;

  const week = plan[state.week];

  $("#weekInfo").innerHTML = `
    <div class="weekmeta">
      <span class="tag">${week.phase}</span>
      <span class="tag">${week.start} bis ${week.end}</span>
      <span class="tag">3 Läufe/Woche</span>
    </div>
  `;

  const assignments = matchWeek(state.week);

  $("#sessions").innerHTML = week.sessions
    .map((workout, index) => {
      const actual = assignments.get(index);

      return `
        <div class="workout">
          <div>
            <div class="date">${workout.day}</div>
            <div class="type">${workout.date}</div>
          </div>

          <div>
            <strong>${workout.title}</strong>
            <div class="detail">${workout.detail}</div>

            ${
              actual
                ? `<div class="muted">
                    Polar: ${km(actual.distanceMeters)} km ·
                    ${actualPace(actual)} ·
                    Ø HF ${actual.hrAvg || "–"} ·
                    Load ${actual.trainingLoad || "–"}
                  </div>`
                : ""
            }
          </div>

          <div class="${actual ? "match" : "match warn"}">
            ${actual ? "erfasst" : "offen"}
          </div>
        </div>
      `;
    })
    .join("");

  const runs = weekSessions(week);

  $("#runs").innerHTML = runs.length
    ? runs.map(run => `
        <div class="run">
          <div class="runmain">
            <strong>${sessionDate(run)}</strong>
            <strong>${km(run.distanceMeters)} km</strong>
          </div>
          <div class="muted">
            ${actualPace(run)} ·
            Ø HF ${run.hrAvg || "–"} ·
            Load ${run.trainingLoad || "–"} ·
            ${run.trainingBenefit || ""}
          </div>
        </div>
      `).join("")
    : `<div class="muted">
        Keine Läufe für diese Woche synchronisiert.
      </div>`;

  const advice = adaptive(state.week);

  $("#advice").innerHTML = `
    <div class="advice">
      <strong>${advice.title}</strong><br>
      ${advice.text}
    </div>
  `;

  const today = new Date();
  const upcoming =
    week.sessions.find(workout =>
      new Date(`${workout.date}T23:59:59`) >= today
    ) || week.sessions[0];

  $("#next").textContent = upcoming?.title || "Keine Einheit";
  $("#nextDetail").textContent = upcoming
    ? `${upcoming.date} · ${upcoming.detail}`
    : "";

  const totalKm = runs.reduce(
    (sum, run) => sum + (run.distanceMeters || 0),
    0
  ) / 1000;

  $("#km").textContent = `${totalKm.toFixed(1)} km`;

  const plannedKm = week.sessions.reduce(
    (sum, workout) => sum + (plannedDistanceKm(workout) || 0),
    0
  );

  $("#kmDetail").textContent =
    `von ca. ${plannedKm.toFixed(1)} km geplant`;

  $("#syncTime").textContent = state.data.syncedAt
    ? new Date(state.data.syncedAt).toLocaleString("de-CH", {
        dateStyle: "short",
        timeStyle: "short"
      })
    : "noch nie";

  const allRuns = (state.data.sessions || []).filter(isRun);

  $("#sessionCount").textContent =
    `${allRuns.length} Läufe gespeichert`;

  const load = runs.reduce(
    (sum, run) => sum + (run.trainingLoad || 0),
    0
  );

  $("#load").textContent = load ? Math.round(load) : "–";
  $("#loadText").textContent =
    load > 700 ? "hoch" : load ? "normal" : "keine Daten";

  $("#maxHr").value = state.settings.maxHr;
  $("#restHr").value = state.settings.restHr;
  $("#goalPace").value = state.settings.goalPace;
}

async function load() {
  try {
    const [dataResponse, settingsResponse, configResponse] =
      await Promise.all([
        fetch("/api/data"),
        fetch("/api/settings"),
        fetch("/api/config")
      ]);

    if (
      !dataResponse.ok ||
      !settingsResponse.ok ||
      !configResponse.ok
    ) {
      throw new Error("Dashboard-Daten konnten nicht geladen werden.");
    }

    const [data, settings, config] = await Promise.all([
      dataResponse.json(),
      settingsResponse.json(),
      configResponse.json()
    ]);

    state.data = data;
    state.settings = settings;

    $("#status").textContent = config.connected
      ? "Polar verbunden"
      : "Polar nicht verbunden";

    $("#connect").style.display =
      config.connected ? "none" : "inline-block";

    $("#sync").style.display =
      config.connected ? "inline-block" : "none";

    render();
  } catch (error) {
    console.error("Dashboard-Ladefehler:", error);
    $("#status").textContent =
      "Fehler beim Laden – bitte Seite neu laden.";
  }
}

$("#week").addEventListener("change", event => {
  state.week = Number(event.target.value);
  render();
});

$("#sync").addEventListener("click", async () => {
  const button = $("#sync");

  button.disabled = true;
  button.textContent = "Synchronisiere…";

  try {
    const response = await fetch("/api/sync", {
      method: "POST"
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.error || "Synchronisierung fehlgeschlagen."
      );
    }

    await load();

    alert(
      `Synchronisierung erfolgreich.\n${result.count} Trainingseinheiten geladen.`
    );
  } catch (error) {
    alert(`Synchronisierung fehlgeschlagen: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = "Jetzt synchronisieren";
  }
});

$("#save").addEventListener("click", async () => {
  try {
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        maxHr: Number($("#maxHr").value),
        restHr: Number($("#restHr").value),
        goalPace: Number($("#goalPace").value)
      })
    });

    if (!response.ok) {
      throw new Error("Einstellungen konnten nicht gespeichert werden.");
    }

    state.settings = await response.json().catch(() => state.settings);
    alert("Gespeichert");
  } catch (error) {
    alert(error.message);
  }
});

load();
