// Install: npm install express cors helmet express-rate-limit morgan
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const { randomBytes } = require('crypto');

const app = express();

// Middleware
app.use(helmet()); // security headers
app.use(cors()); // consider restricting origin in production
app.use(express.json());
app.use(morgan('tiny'));

// Basic rate limiter (adjust limits for your needs)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // limit each IP to 300 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false
});
app.use(apiLimiter);

const MAX_ROUNDS = 30;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // run cleanup hourly
const FINISHED_TTL_MS = 24 * 60 * 60 * 1000; // remove finished games older than 24h

// In-memory store of games keyed by gameId
const games = {};

/* Game factory */
function newGame() {
  const now = Date.now();
  return {
    round: 1,
    scoreA: 0,
    scoreB: 0,
    choices: { A: null, B: null },
    names: { A: 'Player A', B: 'Player B' },
    history: [],
    finished: false,
    createdAt: now,
    finishedAt: null // set when finished
  };
}

/* Apply scoring rules for a round */
function applyRules(game) {
  const a = game.choices.A;
  const b = game.choices.B;
  if (a === 'green' && b === 'green') { game.scoreA += 3; game.scoreB += 3; }
  else if (a === 'red' && b === 'red') { game.scoreA += 1; game.scoreB += 1; }
  else if (a === 'red' && b === 'green') { game.scoreA += 5; }
  else if (a === 'green' && b === 'red') { game.scoreB += 5; }
}

/* Human friendly winner message */
function winnerMessage(game) {
  if (game.scoreA > game.scoreB) return `The winner is... ${game.names.A}`;
  if (game.scoreB > game.scoreA) return `The winner is... ${game.names.B}`;
  return "The winner is... It's a Tie!";
}

/* Stronger id generation */
function makeId() {
  // 12 hex chars ~ 48 bits; adjust length if you want larger IDs
  return randomBytes(6).toString('hex');
}

/* Helper to produce the public state payload */
function publicState(game) {
  return { ...game, message: game.finished ? winnerMessage(game) : '' };
}

/* Create a new game and return its ID */
app.post('/create', (req, res) => {
  const id = makeId();
  games[id] = newGame();
  res.status(201).json({ gameId: id });
});

/* List all active games (for lobby) */
app.get('/games', (req, res) => {
  const list = Object.entries(games).map(([id, g]) => ({
    id,
    names: g.names,
    round: g.round,
    finished: g.finished,
    createdAt: g.createdAt,
    finishedAt: g.finishedAt
  }));
  res.json(list);
});

/* Get full state for players */
app.get('/state/:id', (req, res) => {
  const game = games[req.params.id];
  if (!game) return res.status(404).json({ error: 'Game not found' });
  res.json(publicState(game));
});

/* Get full state for spectators (same as state) */
app.get('/spectate/:id', (req, res) => {
  const game = games[req.params.id];
  if (!game) return res.status(404).json({ error: 'Game not found' });
  res.json(publicState(game));
});

/* Set player name for role A or B */
app.post('/setName/:id', (req, res) => {
  const game = games[req.params.id];
  if (!game) return res.status(404).json({ error: 'Game not found' });

  const { role, name } = req.body;
  if (role !== 'A' && role !== 'B') {
    return res.status(400).json({ error: 'Invalid role. Must be "A" or "B".' });
  }
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Invalid name.' });
  }
  // Simple sanitization: trim; further sanitization should be done client-side or on render
  game.names[role] = name.trim();
  res.json(publicState(game));
});

/* Submit a choice (red/green) for role A or B */
app.post('/choice/:id', (req, res) => {
  const game = games[req.params.id];
  if (!game) return res.status(404).json({ error: 'Game not found' });

  const { role, color } = req.body;

  if (game.finished) {
    return res.json(publicState(game));
  }

  if (role !== 'A' && role !== 'B') {
    return res.status(400).json({ error: 'Invalid role. Must be "A" or "B".' });
  }
  if (color !== 'red' && color !== 'green') {
    return res.status(400).json({ error: 'Invalid color. Must be "red" or "green".' });
  }

  game.choices[role] = color;

  // If both have chosen, score round and advance
  if (game.choices.A && game.choices.B) {
    applyRules(game);
    game.history.push({
      round: game.round,
      aChoice: game.choices.A,
      bChoice: game.choices.B,
      scoreA: game.scoreA,
      scoreB: game.scoreB,
      timestamp: Date.now()
    });
    game.choices = { A: null, B: null };
    game.round += 1;
    if (game.round > MAX_ROUNDS) {
      game.finished = true;
      game.finishedAt = Date.now();
    }
  }

  res.json(publicState(game));
});

/* Replay: keep names, reset scores/round/history */
app.post('/replay/:id', (req, res) => {
  const old = games[req.params.id];
  if (!old) return res.status(404).json({ error: 'Game not found' });
  const preservedNames = old.names;
  games[req.params.id] = { ...newGame(), names: preservedNames, createdAt: Date.now() };
  res.json(publicState(games[req.params.id]));
});

/* Reset: reset everything including names */
app.post('/reset/:id', (req, res) => {
  const id = req.params.id;
  if (!games[id]) return res.status(404).json({ error: 'Game not found' });
  games[id] = newGame();
  res.json(publicState(games[id]));
});

/* Admin/utility: delete a finished game (optional, for manual cleanup) */
app.delete('/game/:id', (req, res) => {
  const id = req.params.id;
  if (!games[id]) return res.status(404).json({ error: 'Game not found' });
  delete games[id];
  res.json({ success: true });
});

/* Automated cleanup for finished games older than FINISHED_TTL_MS */
setInterval(() => {
  try {
    const now = Date.now();
    for (const [id, g] of Object.entries(games)) {
      if (g.finished && g.finishedAt && now - g.finishedAt > FINISHED_TTL_MS) {
        delete games[id];
        // Optionally: log cleanup
        console.log(`Cleaned up finished game ${id}`);
      }
    }
  } catch (err) {
    console.error('Error during cleanup:', err);
  }
}, CLEANUP_INTERVAL_MS);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
