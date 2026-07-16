const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = Number(process.env.PORT || 10000);
const ROOT = __dirname;
const rooms = new Map();
const validAnimals = new Set(['bufalo','conejo','elefante','ciervo','tortuga','hipopotamo','carnero','jirafa','jabali','camello','koala','caballo','lobo','tigre','zorro','leopardo','mapache','cocodrilo','aguila','escorpion','nutria','murcielago','oso','serpiente','tiburon','delfin','pulpo','pirana','castor','capibara','puercoespin','ardilla','buho','halcon','pantera','rinoceronte']);
const unitRows=[['bufalo',135,12,11,5,3,'Guardián'],['conejo',70,10,4,20,1,'Ágil'],['elefante',150,12,13,5,3,'Guardián'],['ciervo',82,12,6,17,1,'Armonioso'],['tortuga',140,9,14,4,3,'Guardián'],['hipopotamo',138,12,11,7,3,'Territorial'],['carnero',98,14,10,8,2,'Territorial'],['jirafa',86,9,8,15,1,'Armonioso'],['jabali',105,17,8,12,2,'Adaptable'],['camello',100,11,8,12,1,'Armonioso'],['koala',88,9,11,8,1,'Armonioso'],['caballo',95,12,6,20,1,'Ágil'],['lobo',92,18,6,16,2,'Cazador'],['tigre',102,21,6,16,2,'Emboscador'],['zorro',70,13,4,20,1,'Ágil'],['leopardo',90,21,6,16,2,'Emboscador'],['mapache',72,13,4,20,1,'Adaptable'],['cocodrilo',122,17,11,8,3,'Territorial'],['aguila',68,13,4,24,1,'Cazador'],['escorpion',92,17,8,12,2,'Emboscador'],['nutria',86,12,6,16,1,'Adaptable'],['murcielago',70,12,4,20,1,'Emboscador'],['oso',138,17,11,8,3,'Territorial'],['serpiente',70,17,4,20,1,'Emboscador'],['tiburon',105,20,7,16,2,'Cazador'],['delfin',92,11,8,18,1,'Guardián'],['pulpo',88,12,8,13,1,'Emboscador'],['pirana',68,16,4,21,1,'Cazador'],['castor',120,10,12,9,3,'Guardián'],['capibara',105,8,9,11,1,'Armonioso'],['puercoespin',118,11,13,8,3,'Guardián'],['ardilla',66,11,4,23,1,'Ágil'],['buho',76,12,6,19,1,'Cazador'],['halcon',82,18,5,22,2,'Cazador'],['pantera',94,20,6,18,2,'Emboscador'],['rinoceronte',148,14,13,7,3,'Territorial']];
const unitData=Object.fromEntries(unitRows.map(r=>[r[0],{id:r[0],hp:r[1],atk:r[2],def:r[3],spd:r[4],lives:r[5],instinct:r[6]}]));
const beats={Cazador:'Armonioso',Armonioso:'Territorial',Territorial:'Emboscador',Emboscador:'Ágil',Ágil:'Guardián',Guardián:'Cazador'};
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
        initializeWar(room);
        room.players.forEach(p => send(p.ws, 'teams_locked', {
          you: p.number,
          teams: { 1: room.teams[1], 2: room.teams[2] }
        }));
        setTimeout(()=>startChoice(room,60),700);
      }
      return;
    }
    if (message.type === 'pick_combatant') {
      const room=rooms.get(ws.roomCode); if(!room||!room.war)return;
      const candidate=room.war.units[ws.playerNumber].find(u=>u.id===message.id&&!u.eliminated);
      if(!candidate)return send(ws,'error',{message:'Ese animal no está disponible.'});
      room.war.picks[ws.playerNumber]=candidate.id;
      send(ws,'pick_saved',{round:room.war.round});
      if(room.war.picks[1]&&room.war.picks[2])resolveOnlineBattle(room);
      return;
    }
    if(message.type==='battle_continue'){
      const room=rooms.get(ws.roomCode);if(!room||!room.war||room.war.over)return;
      room.war.continued.add(ws.playerNumber);
      if(room.war.continued.size===2)startChoice(room,15);
      return;
    }
    if(message.type==='rematch_vote'){
      const room=rooms.get(ws.roomCode);if(!room||!room.war||!room.war.over)return;
      const mode=message.mode==='same'?'same':'new';room.rematchVotes=room.rematchVotes||{};room.rematchVotes[ws.playerNumber]=mode;
      room.players.forEach(p=>send(p.ws,'rematch_status',{votes:Object.keys(room.rematchVotes).map(Number),you:p.number}));
      if(room.rematchVotes[1]&&room.rematchVotes[2]){
        if(room.rematchVotes[1]==='same'&&room.rematchVotes[2]==='same'){
          initializeWar(room);room.players.forEach(p=>send(p.ws,'teams_locked',{you:p.number,teams:room.teams}));setTimeout(()=>startChoice(room,60),700);
        }else{
          clearTimeout(room.choiceTimer);room.teams={};room.war=null;room.rematchVotes={};room.players.forEach(p=>send(p.ws,'new_team_selection',{you:p.number}));
        }
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

function initializeWar(room){
  clearTimeout(room.choiceTimer);
  room.war={round:1,picks:{},previous:{},continued:new Set(),over:false,units:{}};
  for(const n of [1,2])room.war.units[n]=room.teams[n].map(id=>({...unitData[id],level:1,xp:0,livesLeft:unitData[id].lives,eliminated:false}));
}
function publicWar(room){return{round:room.war.round,units:room.war.units,teams:room.teams}}
function startChoice(room,seconds){
  if(!rooms.has(room.code)||room.players.length<2||room.war.over)return;
  clearTimeout(room.choiceTimer);room.war.picks={};room.war.continued=new Set();
  const deadline=Date.now()+seconds*1000;
  room.players.forEach(p=>send(p.ws,'choose_combatant',{...publicWar(room),you:p.number,deadline,seconds}));
  room.choiceTimer=setTimeout(()=>{for(const n of [1,2])if(!room.war.picks[n])room.war.picks[n]=autoCombatant(room,n);resolveOnlineBattle(room)},seconds*1000+100);
}
function autoCombatant(room,n){let alive=room.war.units[n].filter(u=>!u.eliminated),previous=alive.find(u=>u.id===room.war.previous[n]);return(previous||alive[Math.floor(Math.random()*alive.length)]).id}
function relation(a,b){if(a.instinct==='Adaptable'||b.instinct==='Adaptable')return 0;if(beats[a.instinct]===b.instinct)return 1;if(beats[b.instinct]===a.instinct)return-1;return 0}
function gainXp(u,n){u.xp+=n;while(u.xp>=3&&u.level<4){u.xp-=3;u.level++}if(u.level>=4)u.xp=Math.min(u.xp,2)}
function resolveOnlineBattle(room){
  clearTimeout(room.choiceTimer);let w=room.war;if(!w.picks[1]||!w.picks[2])return;
  let a=w.units[1].find(u=>u.id===w.picks[1]),b=w.units[2].find(u=>u.id===w.picks[2]);w.previous={1:a.id,2:b.id};
  const scaled=u=>({max:Math.round(u.hp*(1+(u.level-1)*.1)),atk:u.atk*(1+(u.level-1)*.1),def:u.def*(1+(u.level-1)*.1),spd:u.spd*(1+(u.level-1)*.1)}),sa=scaled(a),sb=scaled(b),hp=[sa.max,sb.max],stats=[sa,sb],log=[];
  for(let turn=1;turn<=60&&hp[0]>0&&hp[1]>0;turn++){
    let first=stats[0].spd>=stats[1].spd?0:1;
    for(const i of [first,1-first]){let j=1-i;if(hp[i]<=0||hp[j]<=0)continue;let attacker=i?a:b,defender=j?a:b,rel=relation(attacker,defender),crit=Math.random()<.12,damage=Math.max(3,Math.round((stats[i].atk*(rel>0?1.15:1)*(crit?1.5:1)-stats[j].def*.4)+(Math.random()*4-2)));hp[j]-=damage;log.push({turn,attacker:attacker.id,defender:defender.id,damage,critical:crit,hp:Math.max(0,hp[j]),max:stats[j].max})}
  }
  let loser=hp[0]<=0?1:2,winner=loser===1?2:1,L=loser===1?a:b,W=winner===1?a:b;L.livesLeft--;if(L.livesLeft<=0)L.eliminated=true;gainXp(W,2);gainXp(L,1);
  w.over=w.units[loser].every(u=>u.eliminated);if(w.over)room.rematchVotes={};let result={...publicWar(room),chosen:{1:a.id,2:b.id},winner,loser,log,finalHp:{1:Math.max(0,hp[0]),2:Math.max(0,hp[1])},maxHp:{1:sa.max,2:sb.max},warOver:w.over};
  room.players.forEach(p=>send(p.ws,'battle_result',{...result,you:p.number}));
  if(w.over)room.players.forEach(p=>send(p.ws,'war_over',{winner,you:p.number,units:w.units}));else w.round++;
}

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) if (!room.players.length || now - room.created > 6 * 60 * 60 * 1000) rooms.delete(code);
}, 10 * 60 * 1000).unref();

server.listen(PORT, '0.0.0.0', () => console.log(`Colmillos vs. Cuernos escuchando en puerto ${PORT}`));
