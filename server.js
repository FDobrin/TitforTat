// Install: npm install express cors
const express = require('express');
const cors = require('cors');
const { randomBytes } = require('crypto');

const app = express();
app.use(cors()); // consider restricting origin in production
app.use(express.json());

const MAX_ROUNDS = 30;

// In-memory store of games keyed by gameId
const games = {};

function newGame() {
  return {
    round: 1,
    scoreA: 0,
    scoreB: 0,
    choices: { A: null, B: null },
    names: { A: 'Player A', B: 'Player B' },
    history: [],
    finished: false
  };
}

function applyRules(game) {
  const a = game.choices.A;
  const b = game.choices.B;
  if (a === 'green' && b === 'green') { game.scoreA += 3; game.scoreB += 3; }
  else if (a === 'red' && b === 'red') { game.scoreA += 1; game.scoreB += 1; }
  else if (a === 'red' && b === 'green') { game.scoreA += 5; }
  else if (a === 'green' && b === 'red') { game.scoreB += 5; }
}

function winnerMessage(game) {
  if (game.scoreA > game.scoreB) return `The winner is... ${game.names.A}`;
  if (game.scoreB > game.scoreA) return `The winner is... ${game.names.B}`;
  return "The winner is... It's a Tie!";
}

function makeId() {
  // 12 hex chars ~ 48 bits; adjust length as needed
  return randomBytes(6).toString('hex');
}

// Create a new game and return its ID
app.post('/create', (req, res) => {
  const id = makeId();
  games[id] = newGame();
  res.status(201).json({ gameId: id });
});

// List all active games (for lobby)
app.get('/games', (req, res) => {
  const list = Object.entries(games).map(([id, g]) => ({
    id,
    names: g.names,
    round: g.round,
    finished: g.finished
  }));
  res.json(list);
});

// Get full state for players
app.get('/state/:id', (req, res) => {
  const game = games[req.params.id];
  if (!game) return res.status(404).json({ error: 'Game not found' });
  res.json({ ...game, message: game.finished ? winnerMessage(game) : '' });
});

// Get full state for spectators (same as state)
app.get('/spectate/:id', (req, res) => {
  const game = games[req.params.id];
  if (!game) return res.status(404).json({ error: 'Game not found' });
  res.json({ ...game, message: game.finished ? winnerMessage(game) : '' });
});

// Set player name for role A or B
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
  game.names[role] = name.trim();
  res.json(game);
});

// Submit a choice (red/green) for role A or B
app.post('/choice/:id', (req, res) => {
  const game = games[req.params.id];
  if (!game) return res.status(404).json({ error: 'Game not found' });

  const { role, color } = req.body;

  if (game.finished) {
    return res.json({ ...game, message: winnerMessage(game) });
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
      scoreB: game.scoreB
    });
    game.choices = { A: null, B: null };
    game.round += 1;
    if (game.round > MAX_ROUNDS) {
      game.finished = true;
    }
  }

  res.json({ ...game, message: game.finished ? winnerMessage(game) : '' });
});

// Replay: keep names, reset scores/round/history
app.post('/replay/:id', (req, res) => {
  const old = games[req.params.id];
  if (!old) return res.status(404).json({ error: 'Game not found' });
  games[req.params.id] = { ...newGame(), names: old.names };
  res.json(games[req.params.id]);
});

// Reset: reset everything including names
app.post('/reset/:id', (req, res) => {
  const id = req.params.id;
  if (!games[id]) {
    return res.status(404).json({ error: 'Game not found' });
  }
  games[id] = newGame();
  res.json(games[id]);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
