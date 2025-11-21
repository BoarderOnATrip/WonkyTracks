// WonkyTracks: Season 0 – Full game.js
// Track Draft + Contracts + Scoots

// -----------------------------------------------------------------------------
// DOM & Canvas
// -----------------------------------------------------------------------------
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const turnLabel = document.getElementById("turnLabel");
const diceLabel = document.getElementById("diceLabel");
const contractLabel = document.getElementById("contractLabel");
const p1Status = document.getElementById("p1Status");
const p2Status = document.getElementById("p2Status");
const winBanner = document.getElementById("winBanner");

// -----------------------------------------------------------------------------
// Game State
// -----------------------------------------------------------------------------
const GAME_STATE = {
  TRACK_DRAFT: "TRACK_DRAFT",
  PLAY: "PLAY",
  GAME_OVER: "GAME_OVER",
};

let gameState = GAME_STATE.TRACK_DRAFT;
let gameMode = "2P"; // placeholder, we treat everything as 2P local

// -----------------------------------------------------------------------------
// Board / Tiles
// -----------------------------------------------------------------------------
const TILE_LAND = 0;
const TILE_OBSTACLE = 1;
const TILE_RESOURCE = 2;
const TILE_COMMUNAL_BASE = 3; // Home Base

const tileSize = 40;
const cols = 11;
const rows = 26;

// Home Base in the center
const COMMUNAL_X = Math.floor(cols / 2);
const COMMUNAL_Y = Math.floor(rows / 2);

// Resource hubs: each 3x3 cross of a single type
const RESOURCE_HUBS = [
  { x: COMMUNAL_X,     y: COMMUNAL_Y - 6, type: "steel"     },
  { x: COMMUNAL_X - 3, y: COMMUNAL_Y + 5, type: "wood"      },
  { x: COMMUNAL_X + 3, y: COMMUNAL_Y + 5, type: "concrete"  },
];

let map = [];             // map[y][x] -> tile type
let resourceTypeMap = []; // resourceTypeMap[y][x] -> "concrete"|"wood"|"steel"|null

// -----------------------------------------------------------------------------
// Tracks & Scoots
// -----------------------------------------------------------------------------
let tracks = []; // { x, y, ownerId }

// Track Draft config
const STARTING_DRAFT_TRACKS = 6;
let draftTracksPlaced = { 1: 0, 2: 0 };
let draftCurrentPlayerId = 1;

// Mid-game track budget
const INITIAL_TRACK_BUDGET = 4;
const STEEL_TRACK_BONUS = 4;

// -----------------------------------------------------------------------------
// Players, Trucks, Contracts
// -----------------------------------------------------------------------------
let players = []; // { id, color, cash, stockpile:{c,w,s}, trackBudget }
let trucks = [];  // { id, ownerId, x, y, color, hasResource, resourceType, shakeX, shakeY, squash, dustTimer }

let currentPlayerIndex = 0; // 0 or 1
let currentTruckIndex = 0;  // 0 or 1 (one truck per player)

// Dice / Turn
let diceRoll = 0;
let originalRoll = 0;
let isAnimating = false;
let gameOver = false;

// Track placement per turn
let hasPlacedTrackThisTurn = false;

// Highlights for moves
let highlights = []; // { x, y, cost, isScoot }

// Contracts
const CONTRACTS = [
  { id: 1, require: { concrete: 3, wood: 2, steel: 1 }, reward: 500 },
  { id: 2, require: { concrete: 2, wood: 3, steel: 2 }, reward: 500 },
  { id: 3, require: { concrete: 4, wood: 1, steel: 2 }, reward: 500 },
];
let currentContractIndex = 0;
let currentContract = CONTRACTS[0];
const WIN_CASH = 1500;

// -----------------------------------------------------------------------------
// Utility Functions
// -----------------------------------------------------------------------------
function getTile(x, y) {
  if (y < 0 || y >= rows || x < 0 || x >= cols) return TILE_OBSTACLE;
  return map[y][x];
}

function trackAt(x, y) {
  return tracks.find(t => t.x === x && t.y === y) || null;
}

function getResourceTypeAt(x, y) {
  return resourceTypeMap[y][x];
}

function isInCommunalArea(x, y) {
  const dx = Math.abs(x - COMMUNAL_X);
  const dy = Math.abs(y - COMMUNAL_Y);
  // Cross + 3x3-ish mound
  if (dx <= 1 && dy <= 1) return true;
  if ((dx === 0 && dy <= 2) || (dy === 0 && dx <= 2)) return true;
  return false;
}

// -----------------------------------------------------------------------------
// Map Generation
// -----------------------------------------------------------------------------
function buildMap() {
  map = [];
  resourceTypeMap = [];

  // Base land
  for (let y = 0; y < rows; y++) {
    const row = [];
    const rRow = [];
    for (let x = 0; x < cols; x++) {
      row.push(TILE_LAND);
      rRow.push(null);
    }
    map.push(row);
    resourceTypeMap.push(rRow);
  }

  // Fjord-like obstacles at edges
  for (let x = 0; x < cols; x++) {
    if (Math.random() < 0.4 && !isInCommunalArea(x, 0)) {
      map[0][x] = TILE_OBSTACLE;
    }
    if (Math.random() < 0.4 && !isInCommunalArea(x, rows - 1)) {
      map[rows - 1][x] = TILE_OBSTACLE;
    }
  }
  for (let y = 1; y < rows - 1; y++) {
    if (Math.random() < 0.35 && !isInCommunalArea(0, y)) {
      map[y][0] = TILE_OBSTACLE;
    }
    if (Math.random() < 0.35 && !isInCommunalArea(cols - 1, y)) {
      map[y][cols - 1] = TILE_OBSTACLE;
    }
  }

  // Some random inlets inward
  const fjordCount = 4;
  for (let i = 0; i < fjordCount; i++) {
    const fromTop = Math.random() < 0.5;
    if (fromTop) {
      const x = Math.floor(Math.random() * cols);
      const depth = 2 + Math.floor(Math.random() * 3);
      for (let d = 0; d < depth && d < rows; d++) {
        if (!isInCommunalArea(x, d)) map[d][x] = TILE_OBSTACLE;
      }
    } else {
      const y = Math.floor(Math.random() * rows);
      const depth = 2 + Math.floor(Math.random() * 3);
      for (let d = 0; d < depth && d < cols; d++) {
        if (!isInCommunalArea(d, y)) map[y][d] = TILE_OBSTACLE;
      }
    }
  }

  // Stamp Home Base
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (isInCommunalArea(x, y)) {
        map[y][x] = TILE_COMMUNAL_BASE;
      }
    }
  }

  // Stamp resource hubs
  // Each hub: 3x3 cross (center + up/down/left/right)
  for (const hub of RESOURCE_HUBS) {
    const hx = hub.x;
    const hy = hub.y;
    const type = hub.type; // "concrete" | "wood" | "steel"

    const positions = [
      { x: hx,     y: hy     },
      { x: hx + 1, y: hy     },
      { x: hx - 1, y: hy     },
      { x: hx,     y: hy + 1 },
      { x: hx,     y: hy - 1 },
    ];

    for (const pos of positions) {
      if (pos.x < 0 || pos.x >= cols || pos.y < 0 || pos.y >= rows) continue;
      map[pos.y][pos.x] = TILE_RESOURCE;
      resourceTypeMap[pos.y][pos.x] = type;
    }
  }
}

// -----------------------------------------------------------------------------
// Players & Trucks
// -----------------------------------------------------------------------------
function createPlayersAndTrucks() {
  players = [
    {
      id: 1,
      color: "#ff0044",
      cash: 0,
      stockpile: { concrete: 0, wood: 0, steel: 0 },
      trackBudget: INITIAL_TRACK_BUDGET,
    },
    {
      id: 2,
      color: "#0066ff",
      cash: 0,
      stockpile: { concrete: 0, wood: 0, steel: 0 },
      trackBudget: INITIAL_TRACK_BUDGET,
    },
  ];

  trucks = [
    {
      id: "P1",
      ownerId: 1,
      x: COMMUNAL_X,
      y: COMMUNAL_Y,
      color: "#ff6699",
      hasResource: false,
      resourceType: null,
      shakeX: 0,
      shakeY: 0,
      squash: 1,
      dustTimer: 0,
    },
    {
      id: "P2",
      ownerId: 2,
      x: COMMUNAL_X,
      y: COMMUNAL_Y,
      color: "#66aaff",
      hasResource: false,
      resourceType: null,
      shakeX: 0,
      shakeY: 0,
      squash: 1,
      dustTimer: 0,
    },
  ];

  currentPlayerIndex = 0;
  currentTruckIndex = 0;
}

// -----------------------------------------------------------------------------
// Movement & Tracks
// -----------------------------------------------------------------------------
function canEnterTile(truck, x, y) {
  const tile = getTile(x, y);
  if (tile === TILE_OBSTACLE) return false;

  const tr = trackAt(x, y);
  if (tr && tr.ownerId !== truck.ownerId) return false; // enemy track blocks

  return true;
}

function movementCost(truck, fromX, fromY, toX, toY) {
  const dx = Math.abs(toX - fromX);
  const dy = Math.abs(toY - fromY);
  if (dx + dy !== 1) return Infinity; // orthogonal only

  const fromTr = trackAt(fromX, fromY);
  const toTr = trackAt(toX, toY);
  const fromTrack = !!fromTr && fromTr.ownerId === truck.ownerId;
  const toTrack = !!toTr && toTr.ownerId === truck.ownerId;

  if (!fromTrack && toTrack) return 0; // onto your track
  if (fromTrack && toTrack) return 0;  // along your track
  if (fromTrack && !toTrack) return 1; // leaving your track
  return 1;                            // normal
}

// Place a mid-game track on current truck tile (1 per turn)
function tryPlaceTrackThisTurn() {
  if (gameState !== GAME_STATE.PLAY) return;
  if (hasPlacedTrackThisTurn) return;

  const truck = trucks[currentTruckIndex];
  const player = players.find(p => p.id === truck.ownerId);
  if (!player || player.trackBudget <= 0) return;

  const x = truck.x;
  const y = truck.y;
  const tile = getTile(x, y);

  // Cannot place on Home Base, resource, obstacle, or existing track
  if (tile !== TILE_LAND) return;
  if (isInCommunalArea(x, y)) return;
  if (trackAt(x, y)) return;

  // Place track
  tracks.push({ x, y, ownerId: truck.ownerId });
  player.trackBudget -= 1;
  hasPlacedTrackThisTurn = true;

  updateHUD();
  draw();
}

// -----------------------------------------------------------------------------
// Resource Handling & Silos
// -----------------------------------------------------------------------------
function handleResourceAndBase(truck) {
  const tile = getTile(truck.x, truck.y);

  // Pick up from resource tile
  if (tile === TILE_RESOURCE && !truck.hasResource) {
    const rType = getResourceTypeAt(truck.x, truck.y) || "steel";
    truck.hasResource = true;
    truck.resourceType = rType;
    truck.dustTimer = 10;
  }

  // Deliver at Home Base
  if (truck.hasResource && tile === TILE_COMMUNAL_BASE) {
    const player = players.find(p => p.id === truck.ownerId);
    if (!player) return;

    const rType = truck.resourceType || "steel";
    truck.hasResource = false;
    truck.resourceType = null;

    // Add to silo
    if (!player.stockpile[rType]) player.stockpile[rType] = 0;
    player.stockpile[rType] += 1;

    // Steel bonus -> trackBudget
    if (rType === "steel") {
      player.trackBudget += STEEL_TRACK_BONUS;
    }

    updateHUD();
    autoOfferContractIfEligible(player);
  }
}

// -----------------------------------------------------------------------------
// Contracts
// -----------------------------------------------------------------------------
function formatContract(contract) {
  const req = contract.require;
  return `Contract ${contract.id}: ${req.concrete || 0} C, ${req.wood || 0} W, ${req.steel || 0} S → $${contract.reward}`;
}

// Simple auto-offer using window.confirm (no extra HTML for now)
function autoOfferContractIfEligible(player) {
  if (!currentContract) return;
  const req = currentContract.require;
  const stock = player.stockpile;

  // Check if eligible
  for (const key in req) {
    const need = req[key] || 0;
    if ((stock[key] || 0) < need) {
      return; // not enough
    }
  }

  // Only auto-offer on this player's turn
  if (players[currentPlayerIndex].id !== player.id) return;

  const msg = `You can fulfill ${formatContract(currentContract)}. Fulfill now?`;
  const yes = window.confirm(msg);
  if (yes) {
    fulfillCurrentContract(player);
  }
}

function fulfillCurrentContract(player) {
  if (!currentContract) return;
  const req = currentContract.require;
  const stock = player.stockpile;

  // Re-check (defensive)
  for (const key in req) {
    const need = req[key] || 0;
    if ((stock[key] || 0) < need) {
      return;
    }
  }

  // Deduct
  for (const key in req) {
    const need = req[key] || 0;
    stock[key] -= need;
  }

  // Pay
  player.cash += currentContract.reward;

  // Next contract
  currentContractIndex = (currentContractIndex + 1) % CONTRACTS.length;
  currentContract = CONTRACTS[currentContractIndex];

  updateHUD();
  checkCashWin(player);
}

function tryFulfillContract() {
  if (gameState !== GAME_STATE.PLAY) return;
  const player = players[currentPlayerIndex];
  fulfillCurrentContract(player);
}

function checkCashWin(player) {
  if (player.cash >= WIN_CASH) {
    gameOver = true;
    gameState = GAME_STATE.GAME_OVER;
    winBanner.textContent = `Player ${player.id} wins $${WIN_CASH}!`;
    winBanner.style.display = "block";
  }
}

// -----------------------------------------------------------------------------
// Scoot Network & Highlights
// -----------------------------------------------------------------------------
function computeHighlights() {
  highlights = [];
  if (gameOver || diceRoll <= 0 || gameState !== GAME_STATE.PLAY) return;

  const truck = trucks[currentTruckIndex];

  const dirs = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
  ];

  const addHighlight = (x, y, cost, isScoot) => {
    if (cost > diceRoll) return;
    if (!canEnterTile(truck, x, y)) return;
    if (highlights.some(h => h.x === x && h.y === y)) return;
    highlights.push({ x, y, cost, isScoot });
  };

  // Normal neighbors
  for (const d of dirs) {
    const nx = truck.x + d.dx;
    const ny = truck.y + d.dy;
    if (!canEnterTile(truck, nx, ny)) continue;
    const cost = movementCost(truck, truck.x, truck.y, nx, ny);
    if (cost <= diceRoll) addHighlight(nx, ny, cost, false);
  }

  // Scoot exits
  const isOwnTrack = (x, y) => {
    const tr = trackAt(x, y);
    return !!tr && tr.ownerId === truck.ownerId;
  };

  const visitedSet = new Set();
  const trackTiles = [];
  const queue = [];

  const tryAddStart = (x, y) => {
    if (!isOwnTrack(x, y)) return;
    const key = `${x},${y}`;
    if (visitedSet.has(key)) return;
    visitedSet.add(key);
    trackTiles.push({ x, y });
    queue.push({ x, y });
  };

  // Start from truck tile and adjacent tiles
  tryAddStart(truck.x, truck.y);
  for (const d of dirs) {
    tryAddStart(truck.x + d.dx, truck.y + d.dy);
  }

  while (queue.length) {
    const { x, y } = queue.shift();
    for (const d of dirs) {
      const nx = x + d.dx;
      const ny = y + d.dy;
      if (!isOwnTrack(nx, ny)) continue;
      const key = `${nx},${ny}`;
      if (visitedSet.has(key)) continue;
      visitedSet.add(key);
      trackTiles.push({ x: nx, y: ny });
      queue.push({ x: nx, y: ny });
    }
  }

  for (const t of trackTiles) {
    for (const d of dirs) {
      const nx = t.x + d.dx;
      const ny = t.y + d.dy;
      if (isOwnTrack(nx, ny)) continue;
      addHighlight(nx, ny, 1, true);
    }
  }
}

function findScootPath(truck, targetX, targetY) {
  const dirs = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
  ];

  const isOwnTrack = (x, y) => {
    const tr = trackAt(x, y);
    return !!tr && tr.ownerId === truck.ownerId;
  };

  const starts = [];
  const seenStart = new Set();

  const addStart = (x, y) => {
    if (!isOwnTrack(x, y)) return;
    const key = `${x},${y}`;
    if (seenStart.has(key)) return;
    seenStart.add(key);
    starts.push({ x, y });
  };

  if (isOwnTrack(truck.x, truck.y)) addStart(truck.x, truck.y);
  for (const d of dirs) addStart(truck.x + d.dx, truck.y + d.dy);

  if (starts.length === 0) return null;

  const queue = [];
  const visited = new Set();
  const parent = {};

  for (const s of starts) {
    const key = `${s.x},${s.y}`;
    queue.push(s);
    visited.add(key);
    parent[key] = null;
  }

  let exitNode = null;

  while (queue.length) {
    const { x, y } = queue.shift();
    if (Math.abs(x - targetX) + Math.abs(y - targetY) === 1) {
      exitNode = { x, y };
      break;
    }
    for (const d of dirs) {
      const nx = x + d.dx;
      const ny = y + d.dy;
      if (!isOwnTrack(nx, ny)) continue;
      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;
      visited.add(key);
      parent[key] = `${x},${y}`;
      queue.push({ x: nx, y: ny });
    }
  }

  if (!exitNode) return null;

  const trackPath = [];
  let key = `${exitNode.x},${exitNode.y}`;
  while (key) {
    const [sx, sy] = key.split(",").map(Number);
    trackPath.push({ x: sx, y: sy });
    key = parent[key];
  }
  trackPath.reverse();

  const fullPath = [];
  const firstTrack = trackPath[0];
  if (firstTrack.x !== truck.x || firstTrack.y !== truck.y) {
    fullPath.push({ x: truck.x, y: truck.y });
  }
  for (const node of trackPath) fullPath.push(node);
  fullPath.push({ x: targetX, y: targetY });

  return fullPath;
}

// -----------------------------------------------------------------------------
// Drawing
// -----------------------------------------------------------------------------
function drawTile(x, y, type) {
  if (type === TILE_COMMUNAL_BASE) {
    const dx = Math.abs(x - COMMUNAL_X);
    const dy = Math.abs(y - COMMUNAL_Y);
    ctx.fillStyle = (dx === 0 && dy === 0) ? "#ffffff" : "#e8fff5";
    ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);

    ctx.strokeStyle = "rgba(0, 255, 150, 0.8)";
    ctx.lineWidth = 3;
    ctx.strokeRect(
      x * tileSize + 1.5,
      y * tileSize + 1.5,
      tileSize - 3,
      tileSize - 3
    );
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#222";
    ctx.strokeRect(x * tileSize, y * tileSize, tileSize, tileSize);
    return;
  }

  if (type === TILE_RESOURCE) {
    const rType = getResourceTypeAt(x, y) || "steel";

    if (rType === "concrete") ctx.fillStyle = "#cccccc";
    else if (rType === "wood") ctx.fillStyle = "#bb8844";
    else ctx.fillStyle = "#99aaff"; // steel

    ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
    ctx.strokeStyle = "#222";
    ctx.strokeRect(x * tileSize, y * tileSize, tileSize, tileSize);

    // Letter label
    let label = "S";
    if (rType === "concrete") label = "C";
    else if (rType === "wood") label = "W";

    ctx.save();
    ctx.fillStyle = "#000";
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      label,
      x * tileSize + tileSize / 2,
      y * tileSize + tileSize / 2
    );
    ctx.restore();
    return;
  }

  if (type === TILE_OBSTACLE) ctx.fillStyle = "#555555";
  else ctx.fillStyle = "#aadd88";

  ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
  ctx.strokeStyle = "#222";
  ctx.strokeRect(x * tileSize, y * tileSize, tileSize, tileSize);
}

function drawTracks() {
  for (const t of tracks) {
    const owner = players.find(p => p.id === t.ownerId);
    const baseColor = owner ? owner.color : "#666666";

    const cx = t.x * tileSize + tileSize / 2;
    const cy = t.y * tileSize + tileSize / 2;
    const w = tileSize - 12;
    const h = 12;
    const r = h / 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = baseColor;

    ctx.beginPath();
    ctx.moveTo(-w / 2 + r, -h / 2);
    ctx.lineTo(w / 2 - r, -h / 2);
    ctx.quadraticCurveTo(w / 2, -h / 2, w / 2, 0);
    ctx.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
    ctx.lineTo(-w / 2 + r, h / 2);
    ctx.quadraticCurveTo(-w / 2, h / 2, -w / 2, 0);
    ctx.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillRect(-w / 2 + 3, -2, w - 6, 4);

    ctx.restore();
  }
}

function drawHighlights() {
  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 0, 0.35)";
  for (const h of highlights) {
    ctx.fillRect(h.x * tileSize, h.y * tileSize, tileSize, tileSize);
  }
  ctx.restore();
}

function drawTrucks() {
  for (let i = 0; i < trucks.length; i++) {
    const t = trucks[i];
    const shakeX = t.shakeX || 0;
    const shakeY = t.shakeY || 0;
    const squash = t.squash || 1;

    const cx = t.x * tileSize + tileSize / 2;
    const cy = t.y * tileSize + tileSize / 2;

    ctx.save();
    ctx.translate(cx + shakeX, cy + shakeY);
    ctx.scale(1.05, squash);

    const bodyW = tileSize * 0.5;
    const bodyH = tileSize * 0.25;
    const cabW = tileSize * 0.25;
    const cabH = tileSize * 0.22;

    ctx.fillStyle = t.color;
    ctx.fillRect(-bodyW * 0.6, -bodyH, bodyW, bodyH);
    ctx.fillRect(bodyW * 0.1, -cabH - 2, cabW, cabH);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(bodyW * 0.15, -cabH, cabW * 0.6, cabH * 0.5);

    ctx.fillStyle = "#333333";
    const wheelY = bodyH * 0.2;
    ctx.beginPath();
    ctx.arc(-bodyW * 0.3, wheelY, tileSize * 0.12, 0, Math.PI * 2);
    ctx.arc(bodyW * 0.2, wheelY, tileSize * 0.12, 0, Math.PI * 2);
    ctx.fill();

    if (t.hasResource) {
      ctx.fillStyle = "#ffcc33";
      ctx.beginPath();
      ctx.arc(-bodyW * 0.1, -bodyH - 4, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    if (t.dustTimer && t.dustTimer > 0) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = "#ffffff";
      for (let j = 0; j < 5; j++) {
        const dx = (Math.random() - 0.5) * 10 - 10;
        const dy = (Math.random() - 0.5) * 6 + 10;
        ctx.beginPath();
        ctx.arc(dx, dy, 3 + Math.random() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      t.dustTimer--;
    }

    // Outline current truck
    if (gameState === GAME_STATE.PLAY && i === currentTruckIndex) {
      ctx.strokeStyle = "#ffff00";
      ctx.lineWidth = 2;
      ctx.strokeRect(-bodyW, -bodyH - cabH - 4, bodyW * 2, bodyH + cabH + 10);
      ctx.lineWidth = 1;
    }

    ctx.restore();
  }
}

function drawDiceIcon(x, y, size, value) {
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 1.5;
  ctx.fillRect(x, y, size, size);
  ctx.strokeRect(x, y, size, size);

  ctx.fillStyle = "#000000";

  const cx = x + size / 2;
  const cy = y + size / 2;
  const r = size * 0.08;

  function dot(dx, dy) {
    ctx.beginPath();
    ctx.arc(cx + dx * size * 0.2, cy + dy * size * 0.2, r, 0, Math.PI * 2);
    ctx.fill();
  }

  switch (value) {
    case 1:
      dot(0, 0);
      break;
    case 2:
      dot(-1, -1);
      dot(1, 1);
      break;
    case 3:
      dot(-1, -1);
      dot(0, 0);
      dot(1, 1);
      break;
    case 4:
      dot(-1, -1);
      dot(-1, 1);
      dot(1, -1);
      dot(1, 1);
      break;
    case 5:
      dot(-1, -1);
      dot(-1, 1);
      dot(1, -1);
      dot(1, 1);
      dot(0, 0);
      break;
    case 6:
      dot(-1, -1);
      dot(-1, 0);
      dot(-1, 1);
      dot(1, -1);
      dot(1, 0);
      dot(1, 1);
      break;
  }

  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      drawTile(x, y, map[y][x]);
    }
  }

  drawHighlights();
  drawTracks();
  drawTrucks();
}

// -----------------------------------------------------------------------------
// HUD / Turn Flow
// -----------------------------------------------------------------------------
function updateHUD() {
  if (gameState === GAME_STATE.TRACK_DRAFT) {
    turnLabel.textContent = `Track Draft: Player ${draftCurrentPlayerId} place track (${draftTracksPlaced[1]}/${STARTING_DRAFT_TRACKS} & ${draftTracksPlaced[2]}/${STARTING_DRAFT_TRACKS})`;
    diceLabel.textContent = "Moves: -";
    contractLabel.textContent = "Draft phase – plan your network!";
    p1Status.textContent = "";
    p2Status.textContent = "";
    return;
  }

  const p1 = players[0];
  const p2 = players[1];

  if (currentContract) {
    contractLabel.textContent = formatContract(currentContract);
  } else {
    contractLabel.textContent = "No active contract";
  }

  const s1 = p1.stockpile;
  const s2 = p2.stockpile;

  p1Status.textContent =
    `P1: $${p1.cash} | Tracks:${p1.trackBudget} | C:${s1.concrete} W:${s1.wood} S:${s1.steel}`;
  p2Status.textContent =
    `P2: $${p2.cash} | Tracks:${p2.trackBudget} | C:${s2.concrete} W:${s2.wood} S:${s2.steel}`;

  if (gameState === GAME_STATE.PLAY) {
    const currentPlayer = players[currentPlayerIndex];
    turnLabel.textContent = `Player ${currentPlayer.id}'s turn`;
    diceLabel.textContent = diceRoll > 0 ? `Moves: ${diceRoll}` : "Moves: -";
  } else if (gameState === GAME_STATE.GAME_OVER) {
    turnLabel.textContent = "Game Over";
  }
}

function beginTurn() {
  if (gameOver || gameState !== GAME_STATE.PLAY) return;

  const currentPlayer = players[currentPlayerIndex];
  diceRoll = Math.floor(Math.random() * 6) + 1;
  originalRoll = diceRoll;
  hasPlacedTrackThisTurn = false;

  diceLabel.textContent = "Moves: " + diceRoll;
  currentTruckIndex = currentPlayerIndex; // 1 truck per player

  updateHUD();
  computeHighlights();
  draw();

  // Draw dice icon on HUD
  // (Simple placement: top-right corner of canvas)
  drawDiceIcon(canvas.width - 50, 10, 32, originalRoll);
}

function endTurn() {
  if (gameOver) return;

  currentPlayerIndex = (currentPlayerIndex + 1) % players.length;
  beginTurn();
}

// -----------------------------------------------------------------------------
// Input: Track Draft
// -----------------------------------------------------------------------------
function handleTrackDraftClick(x, y) {
  // Bounds
  if (x < 0 || x >= cols || y < 0 || y >= rows) return;
  if (gameState !== GAME_STATE.TRACK_DRAFT) return;

  const tile = getTile(x, y);

  // Only LAND
  if (tile !== TILE_LAND) return;

  // No tracks on Home Base or resources
  if (isInCommunalArea(x, y)) return;
  if (map[y][x] === TILE_RESOURCE) return;

  // No overlapping tracks
  if (trackAt(x, y)) return;

  const ownerId = draftCurrentPlayerId;

  // Check remaining draft tracks
  if (draftTracksPlaced[ownerId] >= STARTING_DRAFT_TRACKS) return;

  // Place track
  tracks.push({ x, y, ownerId });
  draftTracksPlaced[ownerId]++;

  const totalPlaced = draftTracksPlaced[1] + draftTracksPlaced[2];
  const totalNeeded = STARTING_DRAFT_TRACKS * 2;

  if (totalPlaced >= totalNeeded) {
    // Draft complete → switch to PLAY
    createPlayersAndTrucks();
    currentPlayerIndex = 0;
    currentTruckIndex = 0;
    gameState = GAME_STATE.PLAY;

    updateHUD();
    draw();
    beginTurn();
    return;
  }

  // Switch draft player
  draftCurrentPlayerId = (draftCurrentPlayerId === 1) ? 2 : 1;

  updateHUD();
  draw();
}

// -----------------------------------------------------------------------------
// Input: Movement
// -----------------------------------------------------------------------------
function handleMoveClick(x, y) {
  if (gameOver || diceRoll <= 0 || gameState !== GAME_STATE.PLAY) return;
  if (isAnimating) return;

  const t = trucks[currentTruckIndex];
  const h = highlights.find(hh => hh.x === x && hh.y === y);
  if (!h) return;
  if (h.cost > diceRoll) return;

  if (h.isScoot) {
    const path = findScootPath(t, h.x, h.y);
    if (!path || path.length < 2) {
      // fallback
      t.x = h.x;
      t.y = h.y;
      diceRoll -= h.cost;
      diceLabel.textContent = "Moves: " + diceRoll;
      handleResourceAndBase(t);
      if (diceRoll <= 0) {
        endTurn();
      } else {
        computeHighlights();
        draw();
      }
      return;
    }

    isAnimating = true;
    let idx = 1;

    const animateStep = () => {
      const step = path[idx];

      t.shakeX = (Math.random() - 0.5) * 4;
      t.shakeY = (Math.random() - 0.5) * 2;
      t.squash = 0.9 + Math.random() * 0.2;

      t.x = step.x;
      t.y = step.y;
      draw();
      idx++;

      if (idx < path.length) {
        setTimeout(animateStep, 80);
      } else {
        t.shakeX = 0;
        t.shakeY = 0;
        t.squash = 1;

        diceRoll -= h.cost;
        diceLabel.textContent = "Moves: " + diceRoll;
        handleResourceAndBase(t);
        isAnimating = false;

        if (diceRoll <= 0) {
          endTurn();
        } else {
          computeHighlights();
          draw();
        }
      }
    };

    animateStep();
    return;
  }

  // Normal move
  t.x = h.x;
  t.y = h.y;
  diceRoll -= h.cost;
  diceLabel.textContent = "Moves: " + diceRoll;

  handleResourceAndBase(t);

  if (diceRoll <= 0) {
    endTurn();
  } else {
    computeHighlights();
    draw();
  }
}

// -----------------------------------------------------------------------------
// Global Event Listeners
// -----------------------------------------------------------------------------
canvas.addEventListener("click", (e) => {
  if (isAnimating || gameOver) return;

  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left) / tileSize);
  const y = Math.floor((e.clientY - rect.top) / tileSize);

  if (gameState === GAME_STATE.TRACK_DRAFT) {
    handleTrackDraftClick(x, y);
  } else if (gameState === GAME_STATE.PLAY) {
    handleMoveClick(x, y);
  }
});

// Keydown: T = place track
window.addEventListener("keydown", (e) => {
  if (gameState !== GAME_STATE.PLAY) return;
  if (e.key === "t" || e.key === "T") {
    tryPlaceTrackThisTurn();
  }
});

// -----------------------------------------------------------------------------
// Game Lifecycle
// -----------------------------------------------------------------------------
function resetGameState() {
  buildMap();
  tracks = [];
  gameOver = false;
  isAnimating = false;
  winBanner.style.display = "none";
  winBanner.textContent = "";
  diceRoll = 0;
  originalRoll = 0;
  diceLabel.textContent = "Moves: -";

  players = [];
  trucks = [];

  currentContractIndex = 0;
  currentContract = CONTRACTS[currentContractIndex];

  draftTracksPlaced[1] = 0;
  draftTracksPlaced[2] = 0;
  draftCurrentPlayerId = 1;
  gameState = GAME_STATE.TRACK_DRAFT;

  updateHUD();
  draw();
}

function startGame(mode) {
  console.log("Starting WonkyTracks Season 0. Mode requested:", mode);
  gameMode = mode;
  resetGameState();
}

// Initial setup before any game started
buildMap();
draw();
updateHUD();

// Expose API to HTML
window.startGame = startGame;
window.tryFulfillContract = tryFulfillContract;
