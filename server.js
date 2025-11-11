// Install: npm install express cors body-parser
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const MAX_ROUNDS = 30;
let games = {};

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
  return 'The winner is... It\'s a Tie!';
}

// --- REST endpoints ---

// Create new game
app.post('/create', (req, res) => {
  const id = Math.random().toString(36).substr(2, 6);
  games[id] = newGame();
  res.json({ gameId: id });
});

// List active games
app.get('/games', (req, res) => {
  const list = Object.entries(games).map(([id, g]) => ({
    id,
    names: g.names,
    round: g.round,
    finished: g.finished
  }));
  res.json(list);
});

// Get state
app.get('/state/:id', (req, res) => {
  const game = games[req.params.id];
  if (!game) return res.status(404).json({ error: 'Game not found' });
  res.json({ ...game, message: game.finished ? winnerMessage(game) : '' });
});

// Spectate
app.get('/spectate/:id', (req, res) => {
  const game = games[req.params.id];
  if (!game) return res.status(404).json({ error: 'Game not found' });
  res.json({ ...game, message: game.finished ? winnerMessage(game) : '' });
});

// Set name
app.post('/setName/:id', (req, res) => {
  const game = games[req.params.id];
  if (!game) return res.status(404).json({ error: 'Game not found' });
  const { role, name } = req.body;
  if (role === 'A' || role === 'B') game.names[role] = name || game.names[role];
  res.json(game);
});

// Choice
app.post('/choice/:id', (req, res) => {
  const game = games[req.params.id];
  if (!game) return res.status(404).json({ error: 'Game not found' });
  const { role, color } = req.body;
  if (!game.finished && (role === 'A' || role === 'B')) {
    game.choices[role] = color;
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
      game.round++;
      if (game.round > MAX_ROUNDS) game.finished = true;
    }
  }
  res.json({ ...game, message: game.finished ? winnerMessage(game) : '' });
});

// Replay
app.post('/replay/:id', (req, res) => {
  const game = games[req.params.id];
  if (!game) return res.status(404).json({ error: 'Game not found' });
  games[req.params.id] = { ...newGame(), names: game.names };
  res.json(games[req.params.id]);
});

// Reset
app.post('/reset/:id', (req, res) => {
  games[req.params.id] = newGame();
  res.json(games[req.params.id]);
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
