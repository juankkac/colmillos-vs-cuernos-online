const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = Number(process.env.PORT || 10000);
const ROOT = __dirname;
const rooms = new Map();
const validAnimals = new Set(['bufalo','conejo','elefante','ciervo','tortuga','hipopotamo','carnero','jirafa','jabali','camello','koala','caballo','lobo','tigre','zorro','leopardo','mapache','cocodrilo','aguila','escorpion','nutria','murcielago','oso','serpiente','tiburon','delfin','pulpo','pirana','castor','capibara','puercoespin','ardilla','buho','halcon','pantera','rinoceronte']);
const publicFiles = new Set([
  'cvc_multijugador.html', 'cvc_online_v2.css', 'cvc_online_v2.js',
  'intro.jpeg', 'fondo.png',
  'exec-7264418b-bbb9-4f93-aade-3cbdadc27595.png',
  'exec-f436e953-9fee-4356-acf1-9d63ae294270.png',
  'exec-7154a9e1-6b60-46f0-ab36-97b7d2bed74c.png',
  'exec-386f48ed-4f0c-4bf1-91b5-1e3e2d9fa75a.png'
]);

const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.jpeg': 'image/jpeg', '.png': 'image/png'
};

const server = http.createServer((req, res) => {
  const name = req.url === '/' ? 'cvc_multijugador.html' : decodeURIComponent(req.url.slice(1).split('?')[0]);
  if (!publicFiles.has(name)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Archivo no encontrado');
  }
  fs.readFile(path.join(ROOT, name), (error, data) => {
    if (error) { res.writeHead(500); return res.end('Error interno'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(name)] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });
const send = (ws, type, data = {}) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type, ...data }));
const roomCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do { code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''); }
  while (rooms.has(code));
  return code;
};
const roomView = room => ({
  code: room.code,
  players: room.players.map(p => ({ name: p.name, number: p.number, connected: p.ws.readyState === WebSocket.OPEN })),
  ready: room.players.length === 2
});
const broadcastRoom = room => room.players.forEach(p => send(p.ws, 'room_state', roomView(room)));

wss.on('connection', ws => {
  ws.on('message', raw => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return send(ws, 'error', { message: 'Mensaje inválido.' }); }
    if (message.type === 'create_room') {
      const code = roomCode();
      const room = { code, players: [{ ws, name: cleanName(message.name), number: 1 }], teams: {}, created: Date.now() };
      rooms.set(code, room); ws.roomCode = code; ws.playerNumber = 1;
      send(ws, 'room_created', { ...roomView(room), you: 1 }); return;
    }
    if (message.type === 'join_room') {
      const code = String(message.code || '').trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) return send(ws, 'error', { message: 'La sala no existe.' });
      if (room.players.length >= 2) return send(ws, 'error', { message: 'La sala ya está completa.' });
      room.players.push({ ws, name: cleanName(message.name), number: 2 });
      ws.roomCode = code; ws.playerNumber = 2;
      send(ws, 'room_joined', { ...roomView(room), you: 2 });
      room.players.filter(p => p.ws !== ws).forEach(p => send(p.ws, 'room_state', roomView(room))); return;
    }
    if (message.type === 'select_team') {
      const room = rooms.get(ws.roomCode);
      const team = Array.isArray(message.team) ? [...new Set(message.team)] : [];
      if (!room || team.length !== 6 || team.some(id => !validAnimals.has(id))) {
        return send(ws, 'error', { message: 'El equipo debe contener seis animales válidos.' });
      }
      room.teams[ws.playerNumber] = team;
      room.players.forEach(p => send(p.ws, 'team_status', {
        confirmed: [1, 2].filter(n => Array.isArray(room.teams[n])),
        you: p.number
      }));
      if (room.teams[1] && room.teams[2]) {
        room.players.forEach(p => send(p.ws, 'teams_locked', {
          you: p.number,
          teams: { 1: room.teams[1], 2: room.teams[2] }
        }));
      }
      return;
    }
    if (message.type === 'game_event') {
      const room = rooms.get(ws.roomCode);
      if (!room) return;
      room.players.filter(p => p.ws !== ws).forEach(p => send(p.ws, 'game_event', { from: ws.playerNumber, event: message.event }));
    }
  });
  ws.on('close', () => {
    const room = rooms.get(ws.roomCode); if (!room) return;
    room.players = room.players.filter(p => p.ws !== ws);
    if (!room.players.length) rooms.delete(room.code); else broadcastRoom(room);
  });
});

function cleanName(value) {
  const name = String(value || 'Jugador').trim().replace(/[<>]/g, '').slice(0, 18);
  return name || 'Jugador';
}

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) if (!room.players.length || now - room.created > 6 * 60 * 60 * 1000) rooms.delete(code);
}, 10 * 60 * 1000).unref();

server.listen(PORT, '0.0.0.0', () => console.log(`Colmillos vs. Cuernos escuchando en puerto ${PORT}`));
