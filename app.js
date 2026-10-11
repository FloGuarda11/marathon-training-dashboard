
let state = {
  data: null,
  settings: null,
  week: 0
};

const $ = selector => document.querySelector(selector);

function pace(hours, distanceKm) {
  if (!Number.isFinite(hours) || !distanceKm || distanceKm <= 0) {
    return "–";
  }

  const totalSeconds = Math.round(hours * 3600 / distanceKm);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}/km`;
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
  ].filter(Boolean).join(" ").toLowerCase();
}

function isRun(s) {
  if (s.sport && String(s.sport.id) === "1") return true;

  const name = sessionSport(s);

  return (
    name.includes("run") ||
    name.includes("laufen") ||
    name.includes("jogging")
  );
}

function sessionDate(s) {
  return s.startTime ? String(s.startTime).slice(0, 10) : "";
}

function actualPace(s) {
  return pace(
    (s.durationMillis || 0) / 3600000,
    (s.distanceMeters || 0) / 1000
  );
}

function durationText(s) {
  const seconds = Math.round((s.durationMillis || 0) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;

  if (hours) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
  }

  return `${minutes}:${String(remaining).padStart(2, "0")} min`;
}

function weekSessions(w) {
  return (state.data?.sessions || [])
    .filter(s => {
      const date = sessionDate(s);
      return date >= w.start && date <= w.end && isRun(s);
    })
    .sort((a, b) =>
      String(a.startTime).localeCompare(String(b.startTime))
    );
}

function plannedDistanceKm(workout) {
  const text = `${workout.title || ""} ${workout.detail || ""}`;

  const range = text.match(
    /(\d+(?:[.,]\d+)?)\s*(?:–|-|bis)\s*(\d+(?:[.,]\d+)?)\s*km/i
  );

  if (range) {
    return (
      Number(range[1].replace(",", ".")) +
      Number(range[2].replace(",", "."))
    ) / 2;
  }

  const single = text.match(/(\d+(?:[.,]\d+)?)\s*km/i);

  return single ? Number(single[1].replace(",", ".")) : null;
}

function plannedPace(workout) {
  const text = `${workout.title || ""} ${workout.detail || ""}`;

  const match = text.match(
    /(?:pace|tempo|paceziel|zielpace)?\s*(\d{1,2}):([0-5]\d)\s*(?:-|–|bis)?\s*(\d{1,2}):([0-5]\d)?\s*\/?\s*km/i
  );

  if (!match) return null;

  const first = Number(match[1]) * 60 + Number(match[2]);
  const second = match[3] && match[4]
    ? Number(match[3]) * 60 + Number(match[4])
    : first;

  return { min: Math.min(first, second), max: Math.max(first, second) };
}

function matchWeek(weekIndex) {
  const week = state.data.plan[weekIndex];
  const runs = weekSessions(week);
  const assignments = new Map();
  const usedRuns = new Set();
  const candidates = [];

  week.sessions.forEach((workout, workoutIndex) => {
    const targetKm = plannedDistanceKm(workout);
    const text = `${workout.title || ""} ${workout.detail || ""}`;
    const isLongRun = /longrun|langer lauf/i.test(text);
    const plannedDate = new Date(`${workout.date}T12:00:00`);

    runs.forEach((run, runIndex) => {
      const date = sessionDate(run);
      if (!date) return;

      const runDate = new Date(`${date}T12:00:00`);
      const daysApart = Math.round(
        Math.abs(runDate - plannedDate) / 86400000
      );

      if (daysApart > 1) return;

      const actualKm = (run.distanceMeters || 0) / 1000;
      if (actualKm <= 0) return;

      if (isLongRun && targetKm && actualKm < targetKm * 0.78) {
        return;
      }

      if (!isLongRun && targetKm && actualKm < targetKm * 0.55) {
        return;
      }

      let score = daysApart * 20;

      if (targetKm) {
        score += Math.abs(actualKm - targetKm) / targetKm * 30;
      }

      const targetPace = plannedPace(workout);
      if (targetPace && run.distanceMeters && run.durationMillis) {
        const secondsPerKm = Math.round(
          run.durationMillis / 1000 / actualKm
        );

        if (secondsPerKm < targetPace.min - 90 ||
            secondsPerKm > targetPace.max + 90) {
          score += 8;
        }
      }

      if (score <= 55) {
        candidates.push({ workoutIndex, runIndex, score });
      }
    });
  });

  candidates.sort((a, b) => a.score - b.score);

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

function runFeedback(run, workout = null) {
  const actualKm = (run.distanceMeters || 0) / 1000;
  const hr = Number(run.hrAvg) || null;
  const maxHr = Number(run.hrMax) || null;
  const actualSecondsPerKm = actualKm > 0
    ? Math.round((run.durationMillis || 0) / 1000 / actualKm)
    : null;

  const comments = [];
  let title = "Lauf erfasst";

  if (!actualKm || !run.durationMillis) {
    return {
      title,
      text: "Es fehlen Distanz- oder Zeitdaten für eine vollständige Auswertung."
    };
  }

  if (workout) {
    const targetKm = plannedDistanceKm(workout);
    const targetPace = plannedPace(workout);

    if (targetKm) {
      const difference = actualKm - targetKm;
      const percentage = Math.round(Math.abs(difference) / targetKm * 100);

      if (difference >= 0) {
        comments.push(
          `Die Distanz lag ${km(difference * 1000)} km über dem geschätzten Soll.`
        );
      } else {
        comments.push(
          `Es fehlen rund ${km(Math.abs(difference) * 1000)} km zur geplanten Distanz (${percentage} %).`
        );
      }
    } else {
      comments.push("Für diese Einheit ist keine eindeutige Zieldistanz aus dem Plan erkennbar.");
    }

    if (targetPace && actualSecondsPerKm) {
      if (
        actualSecondsPerKm >= targetPace.min &&
        actualSecondsPerKm <= targetPace.max
      ) {
        comments.push("Die Pace lag im erkannten Zielbereich.");
      } else if (actualSecondsPerKm < targetPace.min) {
        comments.push("Du warst schneller als der erkannte Zielbereich.");
      } else {
        comments.push("Du warst langsamer als der erkannte Zielbereich.");
      }
    } else {
      comments.push("Eine verlässliche Pace-Vorgabe konnte aus dem Trainingstext nicht ausgelesen werden.");
    }
  } else {
    comments.push(
      "Dieser Lauf wurde keiner geplanten Einheit eindeutig zugeordnet. Er zählt zur Wochenbelastung, wird aber nicht als erfüllte Einheit gewertet."
    );
  }

  if (hr) {
    if (hr >= 165) {
      comments.push(
        `Der Durchschnittspuls von ${hr} bpm war relativ hoch. Vergleiche ihn mit der geplanten Intensität und deinen üblichen Werten.`
      );
    } else if (hr <= 145) {
      comments.push(
        `Der Durchschnittspuls von ${hr} bpm wirkt für einen lockeren Lauf grundsätzlich plausibel. Die individuelle Belastung hängt auch von deiner Tagesform ab.`
      );
    } else {
      comments.push(
        `Der Durchschnittspuls lag bei ${hr} bpm. Beurteile ihn zusammen mit Pace, Trainingsziel und Tagesform.`
      );
    }
  } else {
    comments.push("Es liegen keine Durchschnittspulsdaten vor.");
  }

  if (maxHr) {
    comments.push(`Maximalpuls: ${maxHr} bpm.`);
  }

  if (workout) {
    title = "Vergleich mit dem Trainingsplan";
  } else {
    title = "Zusätzlicher oder verschobener Lauf";
  }

  return {
    title,
    text: comments.join(" ")
  };
}

function weeklyFeedback(week, runs, assignments) {
  const today = new Date();
  const weekEnd = new Date(`${week.end}T23:59:59`);
  const completed = weekEnd < today;

  const totalKm = runs.reduce(
    (sum, run) => sum + (run.distanceMeters || 0),
    0
  ) / 1000;

  const totalDuration = runs.reduce(
    (sum, run) => sum + (run.durationMillis || 0),
    0
  );

  const heartRates = runs
    .map(run => Number(run.hrAvg))
    .filter(value => value > 0);

  const avgHr = heartRates.length
    ? Math.round(heartRates.reduce((a, b) => a + b, 0) / heartRates.length)
    : null;

  const load = runs.reduce(
    (sum, run) => sum + (Number(run.trainingLoad) || 0),
    0
  );

  const plannedCount = week.sessions.length;
  const completedCount = assignments.size;

  const plannedKm = week.sessions.reduce(
    (sum, workout) => sum + (plannedDistanceKm(workout) || 0),
    0
  );

  let title = completed ? "Wochenfeedback" : "Zwischenstand der Woche";

  const comments = [];

  comments.push(
    `Erfasst: ${runs.length} Läufe mit insgesamt ${totalKm.toFixed(1)} km und ${durationText({ durationMillis: totalDuration })} Laufzeit.`
  );

  comments.push(
    `${completedCount} von ${plannedCount} geplanten Einheiten wurden eindeutig zugeordnet.`
  );

  if (plannedKm > 0) {
    comments.push(
      `Die aus dem Plan ermittelte Zielstrecke beträgt ungefähr ${plannedKm.toFixed(1)} km.`
    );
  }

  if (avgHr) {
    comments.push(
      `Der mittlere Puls über die erfassten Läufe lag bei ${avgHr} bpm.`
    );
  }

  if (load > 0) {
    comments.push(`Die aufsummierte Polar Training Load beträgt ${Math.round(load)}.`);
  }

  if (!runs.length) {
    comments.push(
      "Es sind noch keine Läufe für diese Woche vorhanden. Prüfe die Synchronisierung, bevor du Schlüsse ziehst."
    );
  } else if (completedCount === plannedCount) {
    comments.push(
      "Alle geplanten Einheiten wurden zugeordnet. Starte die nächste Woche regulär und passe die Belastung bei ungewöhnlicher Müdigkeit an."
    );
  } else if (completed) {
    comments.push(
      "Die Woche ist beendet, aber nicht alle geplanten Einheiten wurden eindeutig zugeordnet. Fehlende Kilometer bitte nicht einfach nachholen."
    );
  } else {
    comments.push(
      "Die Woche läuft noch. Nutze die verbleibenden Tage gemäss Plan und vermeide es, verpasste harte Einheiten zu bündeln."
    );
  }

  if (load > 700) {
    comments.push(
      "Achtung: Die aufsummierte Training Load ist hoch. Plane Erholung ein und orientiere dich zusätzlich an deinem persönlichen Belastungsempfinden."
    );
  }

  return {
    title,
    text: comments.join(" "),
    completed,
    totalKm,
    totalDuration,
    avgHr,
    load,
    completedCount,
    plannedCount
  };
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

  const load = runs.reduce(
    (sum, run) => sum + (Number(run.trainingLoad) || 0),
    0
  );

  const heartRates = runs
    .map(run => Number(run.hrAvg))
    .filter(Boolean);

  const avg = heartRates.length
    ? Math.round(heartRates.reduce((a, b) => a + b, 0) / heartRates.length)
    : null;

  const total = runs.reduce(
    (sum, run) => sum + (run.distanceMeters || 0),
    0
  ) / 1000;

  if (load > 700) {
    return {
      title: "Belastung hoch",
      text: `Diese Woche liegen ca. ${Math.round(load)} Polar Training Load an. Kürze bei Müdigkeit die nächste harte Einheit und halte den langen Lauf locker.`
    };
  }

  if (avg && avg > 158) {
    return {
      title: "Herzfrequenz erhöht",
      text: `Der mittlere Puls der erfassten Läufe beträgt ${avg} bpm. Beurteile ihn zusammen mit Pace, Wetter, Tagesform und deinen üblichen Werten.`
    };
  }

  return {
    title: "Trainingsstand",
    text: `${total.toFixed(1)} km erfasst. Fehlende Einheiten nicht automatisch nachholen; die nächste Woche gemäss Plan angehen.`
  };
}

function render() {
  if (!state.data?.plan || !state.settings) return;

  const plan = state.data.plan;
  const weekSelect = $("#week");

  weekSelect.innerHTML = plan.map((week, index) =>
    `<option value="${index}">KW ${week.week} · ${week.start}–${week.end}</option>`
  ).join("");

  state.week = Math.max(0, Math.min(state.week, plan.length - 1));
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
  const runs = weekSessions(week);
  const runWorkout = new Map();

  assignments.forEach((run, workoutIndex) => {
    runWorkout.set(run, week.sessions[workoutIndex]);
  });

  $("#sessions").innerHTML = week.sessions.map((workout, index) => {
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
          ${actual ? `<div class="muted">
            Polar: ${km(actual.distanceMeters)} km · ${actualPace(actual)} ·
            Ø HF ${actual.hrAvg || "–"} · Load ${actual.trainingLoad || "–"}
          </div>` : ""}
        </div>
        <div class="${actual ? "match" : "match warn"}">
          ${actual ? "erfasst" : "offen"}
        </div>
      </div>
    `;
  }).join("");

  $("#runs").innerHTML = runs.length
    ? runs.map(run => {
        const workout = runWorkout.get(run) || null;
        const feedback = runFeedback(run, workout);

        return `
          <div class="run">
            <div class="runmain">
              <strong>${sessionDate(run)}</strong>
              <strong>${km(run.distanceMeters)} km</strong>
            </div>
            <div class="muted">
              Pace ${actualPace(run)} · Dauer ${durationText(run)} ·
              Ø HF ${run.hrAvg || "–"} bpm · Max HF ${run.hrMax || "–"} bpm ·
              Load ${run.trainingLoad || "–"}
            </div>
            <div class="advice">
              <strong>${feedback.title}</strong><br>
              ${feedback.text}
            </div>
          </div>
        `;
      }).join("")
    : `<div class="muted">Keine Läufe für diese Woche synchronisiert.</div>`;

  const weekly = weeklyFeedback(week, runs, assignments);

  $("#advice").innerHTML = `
    <div class="advice">
      <strong>${weekly.title}</strong><br>
      ${weekly.text}
    </div>
  `;

  const overview = adaptive(state.week);
  const adviceElement = $("#advice");

  adviceElement.innerHTML += `
    <div class="advice">
      <strong>${overview.title}</strong><br>
      ${overview.text}
    </div>
  `;

  const today = new Date();
  const upcoming = week.sessions.find(workout =>
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
  $("#sessionCount").textContent = `${allRuns.length} Läufe gespeichert`;

  const load = runs.reduce(
    (sum, run) => sum + (Number(run.trainingLoad) || 0),
    0
  );

  $("#load").textContent = load ? Math.round(load) : "–";
  $("#loadText").textContent = load > 700 ? "hoch" : load ? "normal" : "keine Daten";

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

    if (!dataResponse.ok || !settingsResponse.ok || !configResponse.ok) {
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

    $("#connect").style.display = config.connected ? "none" : "inline-block";
    $("#sync").style.display = config.connected ? "inline-block" : "none";

    render();
  } catch (error) {
    console.error("Dashboard-Ladefehler:", error);
    $("#status").textContent = "Fehler beim Laden – bitte Seite neu laden.";
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
    const response = await fetch("/api/sync", { method: "POST" });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Synchronisierung fehlgeschlagen.");
    }

    await load();

    alert(`Synchronisierung erfolgreich.\n${result.count} Trainingseinheiten geladen.`);
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
      headers: { "Content-Type": "application/json" },
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
