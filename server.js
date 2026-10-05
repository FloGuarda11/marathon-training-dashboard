import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

console.log('MARATHON DASHBOARD VERSION 2026-10-05-POLAR-FIX-2');

app.use(express.json());
app.use(express.static(__dirname));

const PORT = Number(process.env.PORT || 3000);

const BASE_URL =
  process.env.BASE_URL || `http://localhost:${PORT}`;

const CLIENT_ID = process.env.POLAR_CLIENT_ID;
const CLIENT_SECRET = process.env.POLAR_CLIENT_SECRET;
const SYNC_SECRET = process.env.SYNC_SECRET;

const DATA_DIR = path.join(__dirname, 'data');

const AUTH_FILE = path.join(DATA_DIR, 'auth.json');
const DATA_FILE = path.join(DATA_DIR, 'polar.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const OAUTH_STATE_FILE = path.join(DATA_DIR, 'oauth-state.json');

const SCOPES =
  'training_sessions:read training_targets:read profile:read sports:read';

const AUTH_URL =
  'https://auth.polar.com/oauth/authorize';

const TOKEN_URL =
  'https://auth.polar.com/oauth/token';

const API_BASE =
  'https://www.polaraccesslink.com/v4/data';


/* =========================================================
   HILFSFUNKTIONEN
   ========================================================= */

async function readJson(file, fallback) {
  try {
    return JSON.parse(
      await fs.readFile(file, 'utf8')
    );
  } catch {
    return fallback;
  }
}


async function writeJson(file, value) {
  await fs.mkdir(DATA_DIR, {
    recursive: true
  });

  const tmp = `${file}.tmp`;

  await fs.writeFile(
    tmp,
    JSON.stringify(value, null, 2),
    'utf8'
  );

  await fs.rename(tmp, file);
}


function b64url(value) {
  return Buffer
    .from(value)
    .toString('base64url');
}


function randomState() {
  return b64url(
    crypto.randomBytes(32)
  );
}


function isoDate(date) {
  return new Date(date)
    .toISOString()
    .slice(0, 10);
}


function addDays(dateString, days) {
  const date = new Date(
    `${dateString}T00:00:00Z`
  );

  date.setUTCDate(
    date.getUTCDate() + days
  );

  return isoDate(date);
}


/* =========================================================
   MARATHON TRAININGSPLAN
   ========================================================= */

function planWeek(weekIndex) {

  const start = addDays(
    '2026-10-05',
    weekIndex * 7
  );

  const phase =
    weekIndex < 8
      ? 'Basis'
      : weekIndex < 16
      ? 'Aufbau'
      : weekIndex < 23
      ? 'Marathonspezifisch'
      : 'Taper';


  const longKm = [
    14, 16, 18, 14,
    20, 22, 18, 24,
    20, 26, 22, 28,
    24, 30, 22, 30,
    24, 30, 26, 32,
    24, 30, 28, 32,
    24, 18, 12
  ][weekIndex];


  const quality = [

    '6×800 m @ 4:10–4:20/km, 400 m traben',

    '3×2 km @ 4:30–4:35/km, 3 min locker',

    '10×1 min schnell / 1 min locker',

    'Fahrtspiel 8×2 min zügig',

    '5×1 km @ 4:15–4:25/km, 2 min traben',

    '4×2 km @ 4:25–4:30/km, 3 min locker',

    '10×400 m @ 4:00–4:10/km, 200 m traben',

    '3×3 km @ 4:30/km, 3 min locker',

    '6×1 km @ 4:10–4:20/km, 2 min traben',

    '2×4 km @ 4:30/km, 4 min locker',

    '8×800 m @ 4:05–4:15/km, 400 m traben',

    '3×3 km @ 4:25–4:30/km, 3 min locker',

    '5×1.6 km @ 4:20–4:25/km, 3 min locker',

    '4×2 km @ 4:20–4:25/km, 3 min locker',

    '6×1 km @ 4:05–4:15/km, 2 min traben',

    '3×4 km @ 4:25/km, 4 min locker',

    '5×2 km @ 4:20–4:25/km, 3 min locker',

    '4×3 km @ 4:25/km, 3 min locker',

    '6×1 km @ 4:05–4:15/km, 2 min traben',

    '2×5 km @ 4:25/km, 5 min locker',

    '4×2 km @ 4:15–4:20/km, 3 min traben',

    '3×3 km @ 4:20–4:25/km, 3 min locker',

    '10×400 m @ 3:55–4:05/km, 200 m traben',

    '3×3 km @ 4:20–4:25/km, 3 min locker',

    '5×1 km @ 4:10–4:15/km, 2 min traben',

    '3×1 km @ 4:15/km, 2 min locker',

    '4×400 m locker-schnell, lange Pausen'

  ][weekIndex];


  let thu =
    '10–12 km locker @ 5:25–5:55/km';


  if (weekIndex >= 8 && weekIndex < 16) {
    thu =
      '12–14 km, darin 6–8 km @ 5:00–5:15/km';
  }


  if (weekIndex >= 16 && weekIndex < 23) {
    thu =
      '12–16 km, darin 8–10 km @ 4:45–5:00/km';
  }


  if (weekIndex === 23) {
    thu =
      '14 km, darin 10 km @ 4:30–4:35/km';
  }


  if (weekIndex === 24) {
    thu =
      '12 km locker, darin 5 km @ 4:35–4:45/km';
  }


  if (weekIndex === 25) {
    thu =
      '9 km locker, 3 km @ 4:30–4:40/km';
  }


  if (weekIndex === 26) {
    thu =
      '6 km sehr locker + 4 Steigerungen';
  }


  let sun =
    `${longKm} km langer Lauf @ 5:20–5:55/km`;


  if (weekIndex === 7) {
    sun =
      '24 km, letzte 5 km @ 5:00/km';
  }


  if (weekIndex === 9) {
    sun =
      '26 km, letzte 8 km @ 5:00/km';
  }


  if (weekIndex === 11) {
    sun =
      '28 km, letzte 8 km @ 4:55–5:00/km';
  }


  if (weekIndex === 13) {
    sun =
      '30 km, letzte 10 km @ 4:50–5:00/km';
  }


  if (weekIndex === 15) {
    sun =
      '30 km, 12 km @ 4:45–4:50/km im letzten Drittel';
  }


  if (weekIndex === 17) {
    sun =
      '30 km, 10 km @ 4:40–4:45/km';
  }


  if (weekIndex === 19) {
    sun =
      '32 km: 8 km @ 5:15 + 10 km @ 4:45 + 10 km @ 4:30–4:35 + 4 km locker';
  }


  if (weekIndex === 21) {
    sun =
      '30 km, 12 km @ 4:35–4:45/km';
  }


  if (weekIndex === 23) {
    sun =
      '32 km, davon 10 km @ 4:30–4:35/km';
  }


  if (weekIndex === 24) {
    sun =
      '24 km locker, letzte 5 km moderat';
  }


  if (weekIndex === 25) {
    sun =
      '18 km locker';
  }


  if (weekIndex === 26) {
    sun =
      '12 km sehr locker';
  }


  return {

    week: weekIndex + 1,

    start,

    end: addDays(start, 6),

    phase,

    sessions: [

      {
        id: `w${weekIndex}-tue`,
        day: 'Di',
        date: addDays(start, 1),
        type: 'quality',
        title: 'Qualität',
        detail: quality
      },

      {
        id: `w${weekIndex}-thu`,
        day: 'Do',
        date: addDays(start, 3),
        type: 'easy',
        title: 'Locker / Marathon',
        detail: thu
      },

      {
        id: `w${weekIndex}-sun`,
        day: 'So',
        date: addDays(start, 6),
        type: 'long',
        title: 'Langer Lauf',
        detail: sun
      }

    ]
  };
}


const PLAN = Array.from(
  { length: 27 },
  (_, index) => planWeek(index)
);


/* =========================================================
   POLAR TOKEN
   ========================================================= */

async function polarToken() {

  const auth =
    await readJson(
      AUTH_FILE,
      null
    );


  if (!auth?.refresh_token) {
    return null;
  }


  if (
    auth.expires_at &&
    Date.now() <
      auth.expires_at - 120000
  ) {
    return auth.access_token;
  }


  console.log(
    'POLAR TOKEN: refresh token wird verwendet'
  );


  const basic =
    Buffer
      .from(
        `${CLIENT_ID}:${CLIENT_SECRET}`
      )
      .toString('base64');


  const body =
    new URLSearchParams({

      grant_type:
        'refresh_token',

      refresh_token:
        auth.refresh_token

    });


  const response =
    await fetch(
      TOKEN_URL,
      {

        method: 'POST',

        headers: {

          Authorization:
            `Basic ${basic}`,

          'Content-Type':
            'application/x-www-form-urlencoded'

        },

        body

      }
    );


  if (!response.ok) {

    const errorText =
      await response.text();

    throw new Error(
      `Polar token refresh failed (${response.status}): ${errorText}`
    );
  }


  const token =
    await response.json();


  await writeJson(
    AUTH_FILE,
    {

      ...auth,

      ...token,

      expires_at:
        Date.now() +
        Number(token.expires_in || 0) * 1000

    }
  );


  return token.access_token;
}


/* =========================================================
   POLAR API REQUEST
   ========================================================= */

async function polarGet(endpoint, params = {}) {

  const token = await polarToken();

  if (!token) {
    throw new Error('POLAR_NOT_CONNECTED');
  }


  let url =
    `${API_BASE}${endpoint}`;


  const query = [];


  for (
    const [key, value]
    of Object.entries(params)
  ) {

    if (
      value !== undefined &&
      value !== null
    ) {

      query.push(
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
      );

    }

  }


  if (query.length > 0) {

    url +=
      `?${query.join('&')}`;

  }


  console.log(
    `POLAR API REQUEST: ${url}`
  );


  const response =
    await fetch(
      url,
      {

        method: 'GET',

        headers: {

          'Accept':
            'application/json',

          'Authorization':
            `Bearer ${token}`

        }

      }
    );


  const responseText =
    await response.text();


  console.log(
    `POLAR API RESPONSE: ${response.status}`
  );


  if (!response.ok) {

    console.error(
      'POLAR API ERROR:',
      responseText
    );

    throw new Error(
      `Polar API ${response.status}: ${responseText}`
    );

  }


  try {

    return JSON.parse(
      responseText
    );

  } catch {

    throw new Error(
      `Polar API returned invalid JSON: ${responseText}`
    );

  }

}


/* =========================================================
   POLAR SYNCHRONISIERUNG
   ========================================================= */

async function syncPolar() {

  console.log(
    'POLAR SYNC: starting'
  );


  /*
   * Polar AccessLink benötigt bei Training Sessions
   * einen Zeitraum mit "from" und "to".
   *
   * Wir laden die letzten 90 Tage.
   */

  const now =
    new Date();


  const toDate =
    new Date(now);

  toDate.setUTCDate(
    toDate.getUTCDate() + 1
  );


  const fromDate =
    new Date(now);

  fromDate.setUTCDate(
    fromDate.getUTCDate() - 90
  );


  const from =
    fromDate
      .toISOString()
      .slice(0, 10);


  const to =
    toDate
      .toISOString()
      .slice(0, 10);


  console.log(
    `POLAR SYNC: from=${from}`
  );

  console.log(
    `POLAR SYNC: to=${to}`
  );


  /* =======================================================
     TRAINING SESSIONS
     ======================================================= */

  const sessions =
    await polarGet(
      '/training-sessions/list',
      {
        from,
        to
      }
    );


  console.log(
    `POLAR SYNC: ${
      sessions.trainingSessions?.length || 0
    } Training Sessions erhalten`
  );


  /* =======================================================
     TRAINING TARGETS
     ======================================================= */

  let targets = {
    trainingTarget: []
  };


  try {

    targets =
      await polarGet(
        '/training-target/calendar-targets',
        {
          fromDate: from,
          toDate: to
        }
      );


    console.log(
      `POLAR SYNC: ${
        targets.trainingTarget?.length || 0
      } Training Targets erhalten`
    );

  } catch (error) {

    console.warn(
      'POLAR TARGETS:',
      error.message
    );

  }


  /* =======================================================
     DATEN SPEICHERN
     ======================================================= */

  const data = {

    syncedAt:
      new Date().toISOString(),

    sessions:
      sessions.trainingSessions || [],

    targets:
      targets.trainingTarget || []

  };


  await writeJson(
    DATA_FILE,
    data
  );


  console.log(
    'POLAR SYNC: completed'
  );


  return data;
}


/* =========================================================
   API: CONFIG
   ========================================================= */

app.get(
  '/api/config',
  async (req, res) => {

    const auth =
      await readJson(
        AUTH_FILE,
        null
      );


    res.json({

      connected:
        !!auth?.refresh_token,

      baseUrl:
        BASE_URL,

      raceDate:
        '2027-04-11'

    });

  }
);


/* =========================================================
   POLAR OAUTH START
   ========================================================= */

app.get(
  '/auth/polar',
  async (req, res) => {

    if (
      !CLIENT_ID ||
      !CLIENT_SECRET
    ) {

      return res
        .status(500)
        .send(
          'Polar ist noch nicht konfiguriert. Bitte Render Environment Variables prüfen.'
        );

    }


    const state =
      randomState();


    await writeJson(
      OAUTH_STATE_FILE,
      {

        state,

        expiresAt:
          Date.now() +
          10 * 60 * 1000

      }
    );


    const url =
      new URL(AUTH_URL);


    url.searchParams.set(
      'client_id',
      CLIENT_ID
    );


    url.searchParams.set(
      'response_type',
      'code'
    );


    url.searchParams.set(
      'scope',
      SCOPES
    );


    url.searchParams.set(
      'redirect_uri',
      `${BASE_URL}/auth/polar/callback`
    );


    url.searchParams.set(
      'state',
      state
    );


    console.log(
      'POLAR OAUTH: Weiterleitung zu Polar'
    );


    res.redirect(
      url.toString()
    );

  }
);


/* =========================================================
   POLAR OAUTH CALLBACK
   ========================================================= */

app.get(
  '/auth/polar/callback',
  async (req, res) => {

    try {

      console.log(
        'POLAR OAUTH: Callback erhalten'
      );


      if (!req.query.code) {

        return res
          .status(400)
          .send(
            'Kein Authorization Code von Polar erhalten.'
          );

      }


      const savedState =
        await readJson(
          OAUTH_STATE_FILE,
          null
        );


      if (
        !savedState ||
        savedState.expiresAt <
          Date.now() ||
        !req.query.state ||
        req.query.state !==
          savedState.state
      ) {

        return res
          .status(400)
          .send(
            'Ungültiger OAuth State. Bitte die Polar-Verbindung erneut starten.'
          );

      }


      await fs.rm(
        OAUTH_STATE_FILE,
        {
          force: true
        }
      );


      const basic =
        Buffer
          .from(
            `${CLIENT_ID}:${CLIENT_SECRET}`
          )
          .toString('base64');


      const body =
        new URLSearchParams({

          grant_type:
            'authorization_code',

          code:
            req.query.code,

          redirect_uri:
            `${BASE_URL}/auth/polar/callback`

        });


      console.log(
        'POLAR OAUTH: Authorization Code wird gegen Token getauscht'
      );


      const response =
        await fetch(
          TOKEN_URL,
          {

            method: 'POST',

            headers: {

              Authorization:
                `Basic ${basic}`,

              'Content-Type':
                'application/x-www-form-urlencoded'

            },

            body

          }
        );


      if (!response.ok) {

        const errorText =
          await response.text();


        return res
          .status(502)
          .send(
            `Polar Token-Austausch fehlgeschlagen (${response.status}): ${errorText}`
          );

      }


      const token =
        await response.json();


      console.log(
        'POLAR OAUTH: Token erfolgreich erhalten'
      );


      await writeJson(
        AUTH_FILE,
        {

          ...token,

          expires_at:
            Date.now() +
            Number(
              token.expires_in || 0
            ) * 1000,

          connectedAt:
            new Date().toISOString()

        }
      );


      console.log(
        'POLAR OAUTH: Verbindung erfolgreich'
      );


      res.redirect(
        '/?connected=1'
      );


    } catch (error) {

      console.error(
        'POLAR OAUTH ERROR:',
        error
      );


      res
        .status(500)
        .send(
          error.message
        );

    }

  }
);


/* =========================================================
   API: MANUELLE SYNCHRONISIERUNG
   ========================================================= */

app.post(
  '/api/sync',
  async (req, res) => {

    try {

      const data =
        await syncPolar();


      res.json({

        ok:
          true,

        syncedAt:
          data.syncedAt,

        count:
          data.sessions.length

      });


    } catch (error) {

      console.error(
        'SYNC ERROR:',
        error
      );


      const status =
        error.message ===
        'POLAR_NOT_CONNECTED'
          ? 401
          : 500;


      res
        .status(status)
        .json({

          ok:
            false,

          error:
            error.message

        });

    }

  }
);


/* =========================================================
   API: POLAR DATEN + TRAININGSPLAN
   ========================================================= */

app.get(
  '/api/data',
  async (req, res) => {

    const data =
      await readJson(
        DATA_FILE,
        {

          syncedAt:
            null,

          sessions:
            [],

          targets:
            []

        }
      );


    const auth =
      await readJson(
        AUTH_FILE,
        null
      );


    res.json({

      ...data,

      connected:
        !!auth?.refresh_token,

      plan:
        PLAN

    });

  }
);


/* =========================================================
   API: EINSTELLUNGEN SPEICHERN
   ========================================================= */

app.post(
  '/api/settings',
  async (req, res) => {

    const old =
      await readJson(
        SETTINGS_FILE,
        {}
      );


    const allowed = [

      'maxHr',

      'restHr',

      'goalPace',

      'targetMarathonHours'

    ];


    const next = {
      ...old
    };


    for (
      const key
      of allowed
    ) {

      if (
        req.body[key] != null
      ) {

        next[key] =
          req.body[key];

      }

    }


    await writeJson(
      SETTINGS_FILE,
      next
    );


    res.json(
      next
    );

  }
);


/* =========================================================
   API: EINSTELLUNGEN LESEN
   ========================================================= */

app.get(
  '/api/settings',
  async (req, res) => {

    const settings =
      await readJson(
        SETTINGS_FILE,
        {

          maxHr:
            187,

          restHr:
            55,

          goalPace:
            4.5,

          targetMarathonHours:
            3.17

        }
      );


    res.json(
      settings
    );

  }
);


/* =========================================================
   CRON ENDPOINT
   ========================================================= */

app.get(
  '/api/cron/sync',
  async (req, res) => {

    if (
      !SYNC_SECRET ||
      req.query.secret !==
        SYNC_SECRET
    ) {

      return res
        .status(401)
        .send(
          'Unauthorized'
        );

    }


    try {

      const data =
        await syncPolar();


      res.json({

        ok:
          true,

        syncedAt:
          data.syncedAt,

        count:
          data.sessions.length

      });


    } catch (error) {

      console.error(
        'CRON SYNC ERROR:',
        error
      );


      res
        .status(500)
        .json({

          ok:
            false,

          error:
            error.message

        });

    }

  }
);


/* =========================================================
   FRONTEND
   ========================================================= */

app.use(
  (req, res) => {

    res.sendFile(
      path.join(
        __dirname,
        'index.html'
      )
    );

  }
);


/* =========================================================
   SERVER START
   ========================================================= */

app.listen(
  PORT,
  () => {

    console.log(
      `Marathon Dashboard läuft auf ${BASE_URL}`
    );

  }
);
```
