const app = document.querySelector('#onlineApp');
let socket;
let currentRoom;

function shell(content) { app.innerHTML = `<div class="online-shell"><section class="online-panel">${content}</section></div>`; }
function lobby(message = '') {
  shell(`<h1>COLMILLOS <span>VS. CUERNOS</span></h1><p class="tagline">MULTIJUGADOR · PRIMERA PRUEBA</p>${message ? `<p class="status error">${message}</p>` : ''}<div class="online-form"><input id="playerName" maxlength="18" placeholder="TU NOMBRE"><button onclick="createRoom()">CREAR SALA</button><div class="divider">O</div><input id="roomCode" maxlength="5" placeholder="CÓDIGO DE SALA"><button class="secondary" onclick="joinRoom()">UNIRME A UNA SALA</button></div><p>Uno crea la sala y comparte el código. El segundo jugador introduce ese código.</p>`);
}
function connect(action) {
  if (socket && socket.readyState === WebSocket.OPEN) return action();
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${protocol}//${location.host}`);
  socket.addEventListener('open', action, { once: true });
  socket.addEventListener('message', receive);
  socket.addEventListener('close', () => currentRoom && lobby('Se perdió la conexión con el servidor.'));
  socket.addEventListener('error', () => lobby('No fue posible conectar con el servidor.'));
}
function createRoom() {
  const name = document.querySelector('#playerName').value.trim() || 'Jugador 1';
  connect(() => socket.send(JSON.stringify({ type: 'create_room', name })));
}
function joinRoom() {
  const name = document.querySelector('#playerName').value.trim() || 'Jugador 2';
  const code = document.querySelector('#roomCode').value.trim().toUpperCase();
  if (code.length !== 5) return lobby('Escribe el código de cinco caracteres.');
  connect(() => socket.send(JSON.stringify({ type: 'join_room', name, code })));
}
function receive(event) {
  const data = JSON.parse(event.data);
  if (data.type === 'error') return lobby(data.message);
  if (data.type === 'room_created' || data.type === 'room_state') showRoom(data);
}
function showRoom(room) {
  currentRoom = room;
  const seats = [1, 2].map(number => {
    const player = room.players.find(p => p.number === number);
    return `<div class="player-seat ${player ? '' : 'empty'}"><b>JUGADOR ${number}</b><h2>${player ? player.name : 'Esperando…'}</h2></div>`;
  }).join('');
  shell(`<h2>SALA PRIVADA</h2><p>Comparte este código con tu amigo:</p><div class="room-code">${room.code}</div><div class="players">${seats}</div><p class="status ${room.ready ? '' : 'pulse'}">${room.ready ? '✓ Los dos jugadores están conectados. Próximo paso: selección de equipos sincronizada.' : 'Esperando al segundo jugador…'}</p><button class="online-button" onclick="copyCode('${room.code}')">COPIAR CÓDIGO</button>`);
}
function copyCode(code) { navigator.clipboard?.writeText(code); }
lobby();
