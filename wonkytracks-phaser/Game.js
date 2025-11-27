// WonkyTracks + Trap the Truck – game.js

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
const p1ConcreteCount = document.getElementById("p1ConcreteCount");
const p1WoodCount = document.getElementById("p1WoodCount");
const p1SteelCount = document.getElementById("p1SteelCount");
const p2ConcreteCount = document.getElementById("p2ConcreteCount");
const p2WoodCount = document.getElementById("p2WoodCount");
const p2SteelCount = document.getElementById("p2SteelCount");
const diceCanvas = document.getElementById("diceCanvas");
const diceCtx = diceCanvas ? diceCanvas.getContext("2d") : null;

// ---------------------------------------------------------------------------
// HUD Helpers
// ---------------------------------------------------------------------------
function updateSiloChips() {
  const setVal = (el, val) => {
    if (el) el.textContent = val ?? 0;
  };

  const p1 = players[0];
  const p2 = players[1];

  setVal(p1ConcreteCount, p1 ? p1.stockpile.concrete : 0);
  setVal(p1WoodCount,     p1 ? p1.stockpile.wood     : 0);
  setVal(p1SteelCount,    p1 ? p1.stockpile.steel    : 0);

  setVal(p2ConcreteCount, p2 ? p2.stockpile.concrete : 0);
  setVal(p2WoodCount,     p2 ? p2.stockpile.wood     : 0);
  setVal(p2SteelCount,    p2 ? p2.stockpile.steel    : 0);
}

// -----------------------------------------------------------------------------
// Assets (truck sprites)
// -----------------------------------------------------------------------------
const assets = {
  truckRed: new Image(),
  truckBlue: new Image(),
};
let assetsLoaded = false;

function loadAssets() {
  let toLoad = 2;
  function done() {
    toLoad--;
    if (toLoad === 0) assetsLoaded = true;
  }
  assets.truckRed.onload = done;
  assets.truckBlue.onload = done;
  assets.truckRed.onerror = done;
  assets.truckBlue.onerror = done;

  assets.truckRed.src = "assets/truck_red.png";
  assets.truckBlue.src = "assets/truck_blue.png";
}

// -----------------------------------------------------------------------------
// Game State (WonkyTracks)
// -----------------------------------------------------------------------------
const GAME_STATE = {
  PREVIEW: "PREVIEW",
  TRACK_DRAFT: "TRACK_DRAFT",
  PLAY: "PLAY",
  GAME_OVER: "GAME_OVER",
};

let gameState = GAME_STATE.PREVIEW;
let gameMode = "2P"; // "2P" or "CPU"

// Global mode (main only for stability; trap mode disabled)
const GameMode = { WONKY: "wonky" };
let currentMode = GameMode.WONKY;

// -----------------------------------------------------------------------------
// Board / Tiles (WonkyTracks)
// -----------------------------------------------------------------------------
const TILE_LAND = 0;
const TILE_OBSTACLE = 1;
const TILE_RESOURCE = 2;
const TILE_COMMUNAL_BASE = 3;

const tileSize = 40;
const cols = 11;
const rows = 26;

const COMMUNAL_X = Math.floor(cols / 2);
const COMMUNAL_Y = Math.floor(rows / 2);

let map = [];
let resourceTypeMap = []; // "concrete" | "wood" | "steel" | null

// -----------------------------------------------------------------------------
// Tracks (WonkyTracks)
// -----------------------------------------------------------------------------
let tracks = []; // { x, y, ownerId }

const STARTING_DRAFT_TRACKS = 8;
let draftTracksPlaced = { 1: 0, 2: 0 };
let draftCurrentPlayerId = 1;

const INITIAL_TRACK_BUDGET = 4;
const STEEL_TRACK_BONUS = 4;

// -----------------------------------------------------------------------------
// Players, Trucks, Contracts (WonkyTracks)
// -----------------------------------------------------------------------------
let players = []; // { id, color, cash, stockpile, trackBudget }
let trucks = [];  // { id, ownerId, x, y, color, hasResource, resourceType, shakeX, shakeY, squash, dustTimer }

let currentPlayerIndex = 0;
let currentTruckIndex = 0;

let diceRoll = 0;
let originalRoll = 0;
let hasPlacedTrackThisTurn = false;
let isAnimating = false;
let gameOver = false;

// Highlights {x,y,cost,isScoot}
let highlights = [];

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
// Utility (WonkyTracks)
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
  if (dx <= 1 && dy <= 1) return true;
  if ((dx === 0 && dy <= 2) || (dy === 0 && dx <= 2)) return true;
  return false;
}

// -----------------------------------------------------------------------------
// Map Generation – peninsula + random 2×2 resource hubs (WonkyTracks)
// -----------------------------------------------------------------------------
function buildMapBase() {
  map = [];
  resourceTypeMap = [];
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

  // Peninsula-ish coasts
  for (let y = 0; y < rows; y++) {
    let leftIndent = 0;
    let rightIndent = 0;
    if (y % 5 === 0) leftIndent = 2;
    else if (y % 3 === 0) leftIndent = 1;
    else if (Math.random() < 0.15) leftIndent = 1;

    if (y % 7 === 0) rightIndent = 2;
    else if (y % 4 === 0) rightIndent = 1;
    else if (Math.random() < 0.15) rightIndent = 1;

    for (let x = 0; x < leftIndent; x++) {
      if (isInCommunalArea(x, y)) continue;
      map[y][x] = TILE_OBSTACLE;
    }
    for (let x = cols - rightIndent; x < cols; x++) {
      if (isInCommunalArea(x, y)) continue;
      map[y][x] = TILE_OBSTACLE;
    }
  }

  // Interior rock patches
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      if (isInCommunalArea(x, y)) continue;
      if (map[y][x] !== TILE_LAND) continue;
      if (Math.random() < 0.03) map[y][x] = TILE_OBSTACLE;
    }
  }

  // Home Base stamped last
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (isInCommunalArea(x, y)) {
        map[y][x] = TILE_COMMUNAL_BASE;
      }
    }
  }
}

function generateResourceHubs() {
  const resourceTypes = ["steel", "wood", "concrete"];

  for (const type of resourceTypes) {
    let attempts = 0;
    while (attempts < 200) {
      attempts++;
      const hx = Math.floor(Math.random() * (cols - 1));
      const hy = Math.floor(Math.random() * (rows - 1));

      const positions = [
        { x: hx,     y: hy     },
        { x: hx + 1, y: hy     },
        { x: hx,     y: hy + 1 },
        { x: hx + 1, y: hy + 1 },
      ];

      let ok = true;
      for (const pos of positions) {
        if (isInCommunalArea(pos.x, pos.y)) { ok = false; break; }
        if (map[pos.y][pos.x] !== TILE_LAND) { ok = false; break; }
      }
      if (!ok) continue;

      // Keep hubs a bit apart
      let farEnough = true;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (resourceTypeMap[y][x]) {
            const dist = Math.abs(x - hx) + Math.abs(y - hy);
            if (dist < 5) { farEnough = false; break; }
          }
        }
        if (!farEnough) break;
      }
      if (!farEnough) continue;

      // Stamp hub
      for (const pos of positions) {
        map[pos.y][pos.x] = TILE_RESOURCE;
        resourceTypeMap[pos.y][pos.x] = type;
      }
      break;
    }
  }
}

function buildMap() {
  buildMapBase();
  generateResourceHubs();
}

// -----------------------------------------------------------------------------
// Players & Trucks (WonkyTracks)
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
// Movement & Tracks (WonkyTracks)
// -----------------------------------------------------------------------------
function canEnterTile(truck, x, y) {
  const tile = getTile(x, y);
  if (tile === TILE_OBSTACLE) return false;
  const tr = trackAt(x, y);
  if (tr && tr.ownerId !== truck.ownerId) return false;
  return true;
}

function movementCost(truck, fromX, fromY, toX, toY) {
  const dx = Math.abs(toX - fromX);
  const dy = Math.abs(toY - fromY);
  if (dx + dy !== 1) return Infinity;

  const fromTr = trackAt(fromX, fromY);
  const toTr = trackAt(toX, toY);
  const fromTrack = !!fromTr && fromTr.ownerId === truck.ownerId;
  const toTrack   = !!toTr && toTr.ownerId === truck.ownerId;

  if (!fromTrack && toTrack) return 0;
  if (fromTrack && toTrack)  return 0;
  if (fromTrack && !toTrack) return 1;
  return 1;
}

function tryPlaceTrackThisTurn() {
  if (currentMode !== GameMode.WONKY) return;
  if (gameState !== GAME_STATE.PLAY) return;
  if (hasPlacedTrackThisTurn) return;

  const truck = trucks[currentTruckIndex];
  const player = players.find(p => p.id === truck.ownerId);
  if (!player || player.trackBudget <= 0) return;

  const x = truck.x;
  const y = truck.y;
  const tile = getTile(x, y);

  if (tile !== TILE_LAND) return;
  if (isInCommunalArea(x, y)) return;
  if (trackAt(x, y)) return;

  tracks.push({ x, y, ownerId: truck.ownerId });
  player.trackBudget -= 1;
  hasPlacedTrackThisTurn = true;

  updateHUD();
  draw();
}

// -----------------------------------------------------------------------------
// Resource Handling & Silos (WonkyTracks)
// -----------------------------------------------------------------------------
function handleResourceAndBase(truck) {
  const tile = getTile(truck.x, truck.y);

  // Pick up
  if (tile === TILE_RESOURCE && !truck.hasResource) {
    const rType = getResourceTypeAt(truck.x, truck.y) || "steel";
    truck.hasResource = true;
    truck.resourceType = rType;
    truck.dustTimer = 10;
  }

  // Deliver
  if (truck.hasResource && tile === TILE_COMMUNAL_BASE) {
    const player = players.find(p => p.id === truck.ownerId);
    if (!player) return;

    const rType = truck.resourceType || "steel";
    truck.hasResource = false;
    truck.resourceType = null;

    if (!player.stockpile[rType]) player.stockpile[rType] = 0;
    player.stockpile[rType] += 1;

    if (rType === "steel") {
      player.trackBudget += STEEL_TRACK_BONUS;
    }

    updateHUD();
    updateSiloChips();
    autoOfferContractIfEligible(player);
  }
}

// -----------------------------------------------------------------------------
// Contracts (WonkyTracks)
// -----------------------------------------------------------------------------
function formatContract(contract) {
  const req = contract.require;
  return `Contract ${contract.id}: ${req.concrete || 0} C, ${req.wood || 0} W, ${req.steel || 0} S → $${contract.reward}`;
}

function autoOfferContractIfEligible(player) {
  if (!currentContract) return;
  const req = currentContract.require;
  const stock = player.stockpile;

  for (const key in req) {
    if ((stock[key] || 0) < (req[key] || 0)) return;
  }

  if (players[currentPlayerIndex].id !== player.id) return;

  const msg = `You can fulfill ${formatContract(currentContract)}. Fulfill now?`;
  if (window.confirm(msg)) {
    fulfillCurrentContract(player);
  }
}

function fulfillCurrentContract(player) {
  if (!currentContract) return;
  const req = currentContract.require;
  const stock = player.stockpile;

  for (const key in req) {
    if ((stock[key] || 0) < (req[key] || 0)) return;
  }
  for (const key in req) {
    stock[key] -= req[key] || 0;
  }

  player.cash += currentContract.reward;
  currentContractIndex = (currentContractIndex + 1) % CONTRACTS.length;
  currentContract = CONTRACTS[currentContractIndex];

  updateHUD();
  updateSiloChips();
  checkCashWin(player);
}

function tryFulfillContract() {
  if (currentMode !== GameMode.WONKY) return;
  if (gameState !== GAME_STATE.PLAY) return;
  const player = players[currentPlayerIndex];
  fulfillCurrentContract(player);
}

function checkCashWin(player) {
  if (player.cash >= WIN_CASH) {
    gameOver = true;
    gameState = GAME_STATE.GAME_OVER;
    highlights = [];
    winBanner.textContent = `Player ${player.id} wins $${WIN_CASH}!`;
    winBanner.style.display = "block";
    draw();
  }
}

// -----------------------------------------------------------------------------
// Scoot Network & Highlights (WonkyTracks)
// -----------------------------------------------------------------------------
function computeHighlights() {
  highlights = [];
  if (currentMode !== GameMode.WONKY) return;
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

  // One-step neighbors
  for (const d of dirs) {
    const nx = truck.x + d.dx;
    const ny = truck.y + d.dy;
    if (!canEnterTile(truck, nx, ny)) continue;
    const cost = movementCost(truck, truck.x, truck.y, nx, ny);
    if (cost <= diceRoll) addHighlight(nx, ny, cost, false);
  }

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
// Drawing (WonkyTracks)
// -----------------------------------------------------------------------------
function drawTile(x, y, type) {
  if (type === TILE_COMMUNAL_BASE) {
    const dx = Math.abs(x - COMMUNAL_X);
    const dy = Math.abs(y - COMMUNAL_Y);
    ctx.fillStyle = (dx === 0 && dy === 0) ? "#ffffff" : "#e8fff5";
    ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
    ctx.strokeStyle = "rgba(0,255,150,0.8)";
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
    else ctx.fillStyle = "#99aaff";
    ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
    ctx.strokeStyle = "#222";
    ctx.strokeRect(x * tileSize, y * tileSize, tileSize, tileSize);

    let label = "S";
    if (rType === "concrete") label = "C";
    else if (rType === "wood") label = "W";

    ctx.save();
    ctx.fillStyle = "#000";
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x * tileSize + tileSize / 2, y * tileSize + tileSize / 2);
    ctx.restore();
    return;
  }

  if (type === TILE_OBSTACLE) {
    const distToEdge = Math.min(x, cols - 1 - x, y, rows - 1 - y);
    ctx.fillStyle = (distToEdge <= 1 && !isInCommunalArea(x, y))
      ? "#66aadd" : "#555555";
  } else {
    ctx.fillStyle = "#aadd88";
  }

  ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
  ctx.strokeStyle = "#222";
  ctx.strokeRect(x * tileSize, y * tileSize, tileSize, tileSize);
}

function drawTracks() {
  for (const t of tracks) {
    const owner = players.find(p => p.id === t.ownerId);

    let baseColor;
    if (owner) {
      baseColor = owner.color;
    } else {
      if (t.ownerId === 1) baseColor = "#ff0044";
      else if (t.ownerId === 2) baseColor = "#0066ff";
      else baseColor = "#666666";
    }

    const cx = t.x * tileSize + tileSize / 2;
    const cy = t.y * tileSize + tileSize / 2;

    // glow
    ctx.save();
    ctx.translate(cx, cy);
    const glowRadius = tileSize * 0.8;
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, glowRadius);
    grad.addColorStop(0, "rgba(0,255,255,0.45)");
    grad.addColorStop(1, "rgba(0,255,255,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // bar
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

    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillRect(-w / 2 + 3, -2, w - 6, 4);

    ctx.restore();
  }
}

function drawHighlights() {
  ctx.save();
  ctx.fillStyle = "rgba(255,255,0,0.35)";
  for (const h of highlights) {
    ctx.fillRect(h.x * tileSize, h.y * tileSize, tileSize, tileSize);
  }
  ctx.restore();
}

function drawTrucks() {
  const ordered = trucks.map((t, idx) => ({ t, idx }));
  if (gameState === GAME_STATE.PLAY && currentTruckIndex < ordered.length) {
    const [active] = ordered.splice(currentTruckIndex, 1);
    if (active) ordered.push(active);
  }

  for (let i = 0; i < ordered.length; i++) {
    const t = ordered[i].t;
    const idx = ordered[i].idx;
    const cx = t.x * tileSize + tileSize / 2;
    const cy = t.y * tileSize + tileSize / 2;

    ctx.save();
    ctx.translate(cx + (t.shakeX || 0), cy + (t.shakeY || 0));
    ctx.scale(1, t.squash || 1);

    let sprite = null;
    const owner = players.find(p => p.id === t.ownerId);
    if (owner && assetsLoaded) {
      sprite = owner.id === 1 ? assets.truckRed : assets.truckBlue;
    }

    if (sprite && sprite.complete && sprite.width > 0) {
      const w = sprite.width;
      const h = sprite.height;
      const scale = tileSize / h;
      ctx.drawImage(sprite, -(w * scale) / 2, -(h * scale) / 2, w * scale, h * scale);
    } else {
      const bodyW = tileSize * 0.5;
      const bodyH = tileSize * 0.25;
      const cabW = tileSize * 0.25;
      const cabH = tileSize * 0.22;

      ctx.fillStyle = t.color;
      ctx.fillRect(-bodyW * 0.6, -bodyH, bodyW, bodyH);
      ctx.fillRect(bodyW * 0.1, -cabH - 2, cabW, cabH);
      ctx.fillStyle = "#fff";
      ctx.fillRect(bodyW * 0.15, -cabH, cabW * 0.6, cabH * 0.5);
      ctx.fillStyle = "#333";
      const wheelY = bodyH * 0.2;
      ctx.beginPath();
      ctx.arc(-bodyW * 0.3, wheelY, tileSize * 0.12, 0, Math.PI * 2);
      ctx.arc(bodyW * 0.2, wheelY, tileSize * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }

    if (t.hasResource) {
      ctx.fillStyle = "#ffcc33";
      ctx.beginPath();
      ctx.arc(0, -tileSize * 0.4, 6, 0, Math.PI * 2);
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

    if (gameState === GAME_STATE.PLAY && idx === currentTruckIndex) {
      ctx.strokeStyle = "#ffff00";
      ctx.lineWidth = 2;
      const box = tileSize * 0.7;
      ctx.strokeRect(-box / 2, -box / 2, box, box);
      ctx.lineWidth = 1;
    }

    ctx.restore();
  }
}

// Track draft overlay
function drawTrackDraftOverlay() {
  if (gameState !== GAME_STATE.TRACK_DRAFT) return;
  const centerX = COMMUNAL_X * tileSize + tileSize / 2;
  const centerY = COMMUNAL_Y * tileSize + tileSize / 2;

  ctx.save();
  ctx.translate(centerX, centerY);
  const ownerId = draftCurrentPlayerId;
  let sprite = null;
  if (assetsLoaded) {
    sprite = ownerId === 1 ? assets.truckRed : assets.truckBlue;
  }
  if (sprite && sprite.complete && sprite.width > 0) {
    const w = sprite.width;
    const h = sprite.height;
    const scale = (tileSize * 3.2) / h;
    ctx.globalAlpha = 0.96;
    ctx.drawImage(sprite, -(w * scale) / 2, -(h * scale) / 2, w * scale, h * scale);
  } else {
    ctx.fillStyle = ownerId === 1 ? "#ff0044" : "#0066ff";
    ctx.fillRect(-tileSize * 1.5, -tileSize * 0.75, tileSize * 3, tileSize * 1.5);
  }
  ctx.restore();

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 18px sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 3;
  const labelY = COMMUNAL_Y * tileSize - tileSize * 0.2;
  ctx.strokeText("Place your tracks", centerX, labelY);
  ctx.fillText("Place your tracks", centerX, labelY);
  ctx.restore();
}

// Preview overlay
function drawPreviewOverlay() {
  if (gameState !== GAME_STATE.PREVIEW) return;
  const centerX = COMMUNAL_X * tileSize + tileSize / 2;
  const centerY = COMMUNAL_Y * tileSize + tileSize / 2;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.font = "bold 32px sans-serif";
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillText("WonkyTracks", centerX + 2, centerY - tileSize * 2 + 2);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("WonkyTracks", centerX, centerY - tileSize * 2);

  ctx.font = "18px sans-serif";
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillText("Choose a mode to begin", centerX + 2, centerY - tileSize * 1 + 2);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("Choose a mode to begin", centerX, centerY - tileSize * 1);

  ctx.restore();
}

function draw() {
    // Always draw the Wonky board whenever this is called
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        drawTile(x, y, map[y][x]);
      }
    }
  
    drawHighlights();
    drawTracks();
    drawTrucks();
  
    if (gameState === GAME_STATE.PREVIEW) {
      drawPreviewOverlay();
    }
    if (gameState === GAME_STATE.TRACK_DRAFT) {
      drawTrackDraftOverlay();
    }
  }
  

// -----------------------------------------------------------------------------
// HUD / Turn Flow (both modes)
// -----------------------------------------------------------------------------
function updateHUD() {
  // Wonky silo counts (safe even if players = [])
  updateSiloChips();
  const truckIcon = "🚚";

  if (!turnLabel || !diceLabel) return;

  // Trap-the-Truck HUD branch
  if (currentMode === GameMode.TRAP_TRUCK) {
    const playerName = trapTruckTurn === 0 ? "P1 (Red)" : "P2 (Blue)";
    turnLabel.textContent = `Trap the Truck – ${playerName}`;
    diceLabel.textContent =
      trapTruckDice > 0
        ? `Roll: ${trapTruckDice}`
        : "Rolling…";

    if (contractLabel) {
      contractLabel.textContent =
        trapTruckGameOver
          ? trapTruckStatusMessage
          : "Goal: use tracks to box in your opponent.";
    }
    if (p1Status) p1Status.textContent = "P1 – Red Truck";
    if (p2Status) p2Status.textContent = "P2 – Blue Truck";
    return;
  }

  // Normal WonkyTracks HUD
  if (gameState === GAME_STATE.PREVIEW) {
    turnLabel.textContent = "Welcome to WonkyTracks";
    diceLabel.textContent = "Pick a mode to start";
    if (contractLabel) contractLabel.textContent = "Contracts will appear during play";
    if (p1Status) p1Status.textContent = "";
    if (p2Status) p2Status.textContent = "";
    return;
  }

  if (gameState === GAME_STATE.TRACK_DRAFT) {
    const p1Placed = draftTracksPlaced[1];
    const p2Placed = draftTracksPlaced[2];
    turnLabel.textContent = `Track Draft – Player ${draftCurrentPlayerId}, place a track`;
    const cur = draftTracksPlaced[draftCurrentPlayerId];
    diceLabel.textContent = `Track ${cur + 1} of ${STARTING_DRAFT_TRACKS}`;
    if (contractLabel) {
      contractLabel.textContent = currentContract ? formatContract(currentContract) : "No active contract";
    }

    if (p1Status) {
      p1Status.style.color = "#ff0044";
      p1Status.innerHTML = `${truckIcon}&nbsp;P1 tracks: ${p1Placed}/${STARTING_DRAFT_TRACKS}`;
    }
    if (p2Status) {
      p2Status.style.color = "#0066ff";
      p2Status.innerHTML = `${truckIcon}&nbsp;P2 tracks: ${p2Placed}/${STARTING_DRAFT_TRACKS}`;
    }
    return;
  }

  const p1 = players[0];
  const p2 = players[1];
  const s1 = p1.stockpile;
  const s2 = p2.stockpile;

  if (contractLabel) {
    contractLabel.textContent = currentContract ? formatContract(currentContract) : "No active contract";
  }

  if (p1Status) {
    p1Status.style.color = p1.color;
    p1Status.innerHTML = `${truckIcon}&nbsp;P1: $${p1.cash} | Tracks:${p1.trackBudget} | C:${s1.concrete} W:${s1.wood} S:${s1.steel}`;
  }
  if (p2Status) {
    p2Status.style.color = p2.color;
    p2Status.innerHTML = `${truckIcon}&nbsp;P2: $${p2.cash} | Tracks:${p2.trackBudget} | C:${s2.concrete} W:${s2.wood} S:${s2.steel}`;
  }

  if (gameState === GAME_STATE.PLAY) {
    const cp = players[currentPlayerIndex];
    turnLabel.textContent = `Player ${cp.id}'s turn`;
    diceLabel.textContent = diceRoll > 0 ? `Moves: ${diceRoll}` : "Moves: -";
  } else if (gameState === GAME_STATE.GAME_OVER) {
    turnLabel.textContent = "Game Over";
  }
}

// Dice animation flag (used by both modes)
let isDiceRolling = false;

function beginTurn() {
  if (currentMode !== GameMode.WONKY) return;
  if (gameOver || gameState !== GAME_STATE.PLAY) return;

  const currentPlayer = players[currentPlayerIndex];

  diceRoll = 0;
  originalRoll = 0;
  hasPlacedTrackThisTurn = false;
  currentTruckIndex = currentPlayerIndex;

  highlights = [];
  updateHUD();
  drawDiceVisual(0);
  draw();

  animateDiceRoll((finalVal) => {
    if (currentMode !== GameMode.WONKY) return;
    if (gameOver || gameState !== GAME_STATE.PLAY) return;

    diceRoll = finalVal;
    originalRoll = finalVal;

    updateHUD();
    computeHighlights();
    draw();

    if (gameMode === "CPU" && currentPlayer.id === 2) {
      runCpuTurn();
    }
  });
}

function endTurn() {
  if (currentMode !== GameMode.WONKY) return;
  if (gameOver) return;
  currentPlayerIndex = (currentPlayerIndex + 1) % players.length;
  beginTurn();
}

// -----------------------------------------------------------------------------
// Track Draft Helpers (incl. smarter CPU – WonkyTracks)
// -----------------------------------------------------------------------------
function placeDraftTrackAt(x, y, ownerId) {
  const tile = getTile(x, y);
  if (tile !== TILE_LAND) return false;
  if (isInCommunalArea(x, y)) return false;
  if (map[y][x] === TILE_RESOURCE) return false;
  if (trackAt(x, y)) return false;
  if (draftTracksPlaced[ownerId] >= STARTING_DRAFT_TRACKS) return false;

  tracks.push({ x, y, ownerId });
  draftTracksPlaced[ownerId]++;
  return true;
}

function checkDraftCompletionOrSwap() {
  const totalPlaced = draftTracksPlaced[1] + draftTracksPlaced[2];
  const totalNeeded = STARTING_DRAFT_TRACKS * 2;
  if (totalPlaced >= totalNeeded) {
    createPlayersAndTrucks();
    gameState = GAME_STATE.PLAY;
    currentPlayerIndex = 0;
    currentTruckIndex = 0;
    updateHUD();
    draw();
    beginTurn();
    return;
  }
  draftCurrentPlayerId = (draftCurrentPlayerId === 1 ? 2 : 1);
  updateHUD();
  draw();

  if (gameMode === "CPU" && draftCurrentPlayerId === 2) {
    cpuPlaceDraftTrack();
  }
}

function cpuPlaceDraftTrack() {
  if (gameState !== GAME_STATE.TRACK_DRAFT) return;

  let bestScore = -Infinity;
  let bestPos = null;

  const resourceTiles = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (map[y][x] === TILE_RESOURCE) {
        resourceTiles.push({ x, y });
      }
    }
  }

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const tile = getTile(x, y);
      if (tile !== TILE_LAND) continue;
      if (isInCommunalArea(x, y)) continue;
      if (map[y][x] === TILE_RESOURCE) continue;
      if (trackAt(x, y)) continue;

      const distHome = Math.abs(x - COMMUNAL_X) + Math.abs(y - COMMUNAL_Y);
      let distRes = Infinity;
      for (const r of resourceTiles) {
        const d = Math.abs(x - r.x) + Math.abs(y - r.y);
        if (d < distRes) distRes = d;
      }

      if (distRes === Infinity) continue;
      let score = -(distHome + distRes);
      score += Math.random() * 0.2;
      if (score > bestScore) {
        bestScore = score;
        bestPos = { x, y };
      }
    }
  }

  if (!bestPos) {
    let attempts = 0;
    while (attempts < 200 && gameState === GAME_STATE.TRACK_DRAFT && draftCurrentPlayerId === 2) {
      attempts++;
      const x = Math.floor(Math.random() * cols);
      const y = Math.floor(Math.random() * rows);
      if (placeDraftTrackAt(x, y, 2)) {
        checkDraftCompletionOrSwap();
        return;
      }
    }
    return;
  }

  placeDraftTrackAt(bestPos.x, bestPos.y, 2);
  checkDraftCompletionOrSwap();
}

// -----------------------------------------------------------------------------
// CPU Turn Logic (WonkyTracks)
// -----------------------------------------------------------------------------
function runCpuTurn() {
  if (currentMode !== GameMode.WONKY) return;
  if (gameMode !== "CPU") return;
  if (players[currentPlayerIndex].id !== 2) return;
  if (gameOver || gameState !== GAME_STATE.PLAY) return;

  const step = () => {
    if (currentMode !== GameMode.WONKY) return;
    if (gameOver || gameState !== GAME_STATE.PLAY) return;
    if (players[currentPlayerIndex].id !== 2) return;

    if (diceRoll <= 0) {
      endTurn();
      return;
    }

    const cpuPlayer = players[currentPlayerIndex];
    const cpuTruck = trucks[currentTruckIndex];

    if (!hasPlacedTrackThisTurn && cpuPlayer.trackBudget > 0 && !trackAt(cpuTruck.x, cpuTruck.y)) {
      if (Math.random() < 0.45) {
        tryPlaceTrackThisTurn();
      }
    }

    computeHighlights();
    if (highlights.length === 0) {
      diceRoll = 0;
      endTurn();
      return;
    }

    const choice = chooseCpuMove();
    handleMoveClick(choice.x, choice.y);

    if (!gameOver && gameState === GAME_STATE.PLAY && players[currentPlayerIndex].id === 2 && diceRoll > 0) {
      setTimeout(step, isAnimating ? 260 : 160);
    }
  };

  setTimeout(step, 350);
}

function chooseCpuMove() {
  const cpuTruck = trucks[currentTruckIndex];
  let best = highlights[0];
  let bestScore = -Infinity;

  const contract = currentContract;
  const cpuPlayer = players[currentPlayerIndex];
  const deficits = { concrete: 0, wood: 0, steel: 0 };
  if (contract && cpuPlayer) {
    const req = contract.require;
    deficits.concrete = Math.max((req.concrete || 0) - (cpuPlayer.stockpile.concrete || 0), 0);
    deficits.wood     = Math.max((req.wood     || 0) - (cpuPlayer.stockpile.wood     || 0), 0);
    deficits.steel    = Math.max((req.steel    || 0) - (cpuPlayer.stockpile.steel    || 0), 0);
  }

  const resourceTiles = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (map[y][x] === TILE_RESOURCE) resourceTiles.push({ x, y });
    }
  }

  for (const h of highlights) {
    const tile = getTile(h.x, h.y);
    let score = 0;

    score -= 0.1 * h.cost;

    const tr = trackAt(h.x, h.y);
    if (tr && tr.ownerId === cpuTruck.ownerId) score += 2;

    if (tile === TILE_RESOURCE && !cpuTruck.hasResource) score += 120;
    if (tile === TILE_COMMUNAL_BASE && cpuTruck.hasResource) score += 100;

    if (!cpuTruck.hasResource) {
      const rType = getResourceTypeAt(h.x, h.y);
      if (tile === TILE_RESOURCE && rType) {
        const needWeight = deficits[rType] > 0 ? 50 * deficits[rType] : 8;
        score += needWeight;
      }
      let bestDist = Infinity;
      for (const r of resourceTiles) {
        const d = Math.abs(h.x - r.x) + Math.abs(h.y - r.y);
        if (d < bestDist) bestDist = d;
      }
      if (bestDist < Infinity) score += (30 - bestDist);
    } else {
      const dHome = Math.abs(h.x - COMMUNAL_X) + Math.abs(h.y - COMMUNAL_Y);
      score += (30 - dHome);
    }

    score += Math.random() * 0.5;

    if (score > bestScore) {
      bestScore = score;
      best = h;
    }
  }
  return best;
}

// -----------------------------------------------------------------------------
// Input Handlers – shared canvas
// -----------------------------------------------------------------------------
function handleTrackDraftClick(x, y) {
  if (gameState !== GAME_STATE.TRACK_DRAFT) return;
  if (draftCurrentPlayerId === 2 && gameMode === "CPU") return;
  if (!placeDraftTrackAt(x, y, draftCurrentPlayerId)) return;
  checkDraftCompletionOrSwap();
}

function handleMoveClick(x, y) {
  if (gameOver || diceRoll <= 0 || gameState !== GAME_STATE.PLAY) return;
  if (isAnimating) return;

  const t = trucks[currentTruckIndex];
  const h = highlights.find(hh => hh.x === x && hh.y === y);
  if (!h || h.cost > diceRoll) return;

  if (h.isScoot) {
    const path = findScootPath(t, h.x, h.y);
    if (!path || path.length < 2) {
      t.x = h.x; t.y = h.y;
      diceRoll -= h.cost;
      handleResourceAndBase(t);
      diceRoll <= 0 ? endTurn() : (computeHighlights(), draw());
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
        t.shakeX = 0; t.shakeY = 0; t.squash = 1;
        diceRoll -= h.cost;
        handleResourceAndBase(t);
        isAnimating = false;
        diceRoll <= 0 ? endTurn() : (computeHighlights(), draw());
      }
    };

    animateStep();
    return;
  }

  t.x = h.x;
  t.y = h.y;
  diceRoll -= h.cost;
  handleResourceAndBase(t);
  diceRoll <= 0 ? endTurn() : (computeHighlights(), draw());
}

canvas.addEventListener("click", (e) => {
  if (isAnimating || gameOver || isDiceRolling) return;

  const rect = canvas.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;

  const x = Math.floor(cx / tileSize);
  const y = Math.floor(cy / tileSize);

  if (gameState === GAME_STATE.TRACK_DRAFT) {
    handleTrackDraftClick(x, y);
  } else if (gameState === GAME_STATE.PLAY) {
    if (gameMode === "CPU" && players[currentPlayerIndex].id === 2) return;
    handleMoveClick(x, y);
  }
});

window.addEventListener("keydown", (e) => {
  if (currentMode !== GameMode.WONKY) return;
  if (gameState !== GAME_STATE.PLAY) return;
  if (gameMode === "CPU" && players[currentPlayerIndex].id === 2) return;
  if (e.key === "t" || e.key === "T") {
    tryPlaceTrackThisTurn();
  }
});

// -----------------------------------------------------------------------------
// Dice animation (shared) + small dice visual
// -----------------------------------------------------------------------------
function animateDiceRoll(onDone) {
  if (!diceCtx) {
    const v = 1 + Math.floor(Math.random() * 6);
    if (onDone) onDone(v);
    return;
  }

  isDiceRolling = true;
  const frames = 12;
  const delay = 60;
  let current = 0;

  const tick = () => {
    if (current >= frames) {
      const finalVal = 1 + Math.floor(Math.random() * 6);
      drawDiceVisual(finalVal);
      isDiceRolling = false;
      if (onDone) onDone(finalVal);
      return;
    }
    const v = 1 + Math.floor(Math.random() * 6);
    drawDiceVisual(v);
    current++;
    setTimeout(tick, delay);
  };

  tick();
}

function drawDiceVisual(value) {
  if (!diceCtx) return;
  diceCtx.clearRect(0, 0, diceCanvas.width, diceCanvas.height);
  diceCtx.fillStyle = "#ffffff";
  diceCtx.strokeStyle = "#d0d0d0";
  diceCtx.lineWidth = 2;
  diceCtx.fillRect(8, 8, diceCanvas.width - 16, diceCanvas.height - 16);
  diceCtx.strokeRect(8, 8, diceCanvas.width - 16, diceCanvas.height - 16);

  const cx = diceCanvas.width / 2;
  const cy = diceCanvas.height / 2;
  const offset = 14;

  const dot = (dx, dy) => {
    diceCtx.beginPath();
    diceCtx.arc(cx + dx, cy + dy, 5, 0, Math.PI * 2);
    diceCtx.fillStyle = "#222";
    diceCtx.fill();
  };

  switch (value) {
    case 1: dot(0, 0); break;
    case 2: dot(-offset, -offset); dot(offset, offset); break;
    case 3: dot(-offset, -offset); dot(0, 0); dot(offset, offset); break;
    case 4: dot(-offset, -offset); dot(-offset, offset); dot(offset, -offset); dot(offset, offset); break;
    case 5: dot(-offset, -offset); dot(-offset, offset); dot(offset, -offset); dot(offset, offset); dot(0, 0); break;
    case 6: dot(-offset, -offset); dot(-offset, 0); dot(-offset, offset); dot(offset, -offset); dot(offset, 0); dot(offset, offset); break;
    default:
      diceCtx.fillStyle = "#444";
      diceCtx.fillRect(cx - 12, cy - 2, 24, 4);
      break;
  }
}

// -----------------------------------------------------------------------------
// Game Lifecycle (WonkyTracks main mode)
// -----------------------------------------------------------------------------
function resetGameState() {
  currentMode = GameMode.WONKY;
  canvas.width = 440;
  canvas.height = 1040;

  buildMap();
  tracks = [];
  gameOver = false;
  isAnimating = false;
  winBanner.style.display = "none";
  winBanner.textContent = "";
  diceRoll = 0;
  originalRoll = 0;
  draftTracksPlaced[1] = 0;
  draftTracksPlaced[2] = 0;
  draftCurrentPlayerId = 1;
  players = [];
  trucks = [];
  highlights = [];
  currentContractIndex = 0;
  currentContract = CONTRACTS[currentContractIndex];
  gameState = GAME_STATE.TRACK_DRAFT;
  updateHUD();
  updateSiloChips();
  drawDiceVisual(0);
  draw();
}

function startGame(mode) {
    currentMode = GameMode.WONKY;        // make sure we’re in main mode
    gameMode = mode === "CPU" ? "CPU" : "2P";
    resetGameState();                    // builds map + draws it
  }
  

// -----------------------------------------------------------------------------
// Trap the Truck mini-mode integration (clean rewrite)
// -----------------------------------------------------------------------------

// Two high-level modes sharing the same canvas
const GameMode = { WONKY: "wonky", TRAP_TRUCK: "trap-truck" };
let currentMode = GameMode.WONKY;

// --- Board definition --------------------------------------------------------
// 7x5 cross-shaped board, matching your mockup.
const TRAP_TRUCK_ROWS = 7;
const TRAP_TRUCK_COLS = 5;

// 1 = playable tile, 0 = empty
const TRAP_TRUCK_BOARD_MASK = [
  [0, 0, 0, 1, 0],
  [0, 0, 1, 1, 0],
  [0, 1, 1, 1, 0],
  [1, 1, 1, 1, 1],
  [0, 1, 1, 1, 0],
  [0, 0, 1, 1, 0],
  [0, 0, 0, 1, 0],
];

// Match Wonky players: 1 = Red, 2 = Blue
const TRAP_TRUCK_STARTS = [
  { ownerId: 1, r: 1, c: 3 }, // P1 red
  { ownerId: 2, r: 5, c: 2 }, // P2 blue
];

// --- Trap-the-Truck state ----------------------------------------------------
let trapTruckTracks = [];       // 2D [r][c] => null | 1 | 2
let trapTruckTrucks = [];       // [{ ownerId, r, c }]
let trapTruckTurn = 0;          // index into trapTruckTrucks (0 or 1)
let trapTruckDice = 0;          // 0 = not rolled yet
let trapTruckHighlights = [];   // [{ r, c }]
let trapTruckGameOver = false;

// Convenience for movement
const TRAP_DIRS = [
  { dr: -1, dc: 0 },
  { dr: 1,  dc: 0 },
  { dr: 0,  dc: -1 },
  { dr: 0,  dc: 1 },
];

function trapInBounds(r, c) {
  return (
    r >= 0 && r < TRAP_TRUCK_ROWS &&
    c >= 0 && c < TRAP_TRUCK_COLS &&
    TRAP_TRUCK_BOARD_MASK[r][c] === 1
  );
}

function trapCanEnter(ownerId, r, c) {
  if (!trapInBounds(r, c)) return false;

  // Opponent track blocks
  const trackOwner = trapTruckTracks[r][c];
  if (trackOwner && trackOwner !== ownerId) return false;

  // Opponent truck blocks
  for (const t of trapTruckTrucks) {
    if (t.r === r && t.c === c && t.ownerId !== ownerId) return false;
  }

  // Own tracks & own truck are passable (treated like track)
  return true;
}

function setCanvasSizeForTrap() {
  // Fit nicely in viewport, but keep a reasonable minimum size
  const margin = 80;
  const w = Math.max(360, Math.min(window.innerWidth - margin, 640));
  const h = Math.max(480, Math.min(window.innerHeight - margin, 900));
  canvas.width = w;
  canvas.height = h;
}

// Update HUD text for Trap-the-Truck
function updateTrapHud(extraMessage) {
  if (!turnLabel || !diceLabel || !contractLabel) return;

  const playerNum = trapTruckTurn + 1;
  const colorName = playerNum === 1 ? "Red" : "Blue";

  turnLabel.textContent = `Trap the Truck — P${playerNum} (${colorName})`;
  diceLabel.textContent = trapTruckDice > 0 ? `Roll: ${trapTruckDice}` : "Roll: -";

  if (extraMessage) {
    contractLabel.textContent = extraMessage;
  } else {
    contractLabel.textContent =
      "Goal: use tracks to box in your opponent.\n" +
      "P1 – Red truck, P2 – Blue truck.";
  }
}

// Initialise Trap-the-Truck state
function resetTrapTruck() {
  // Tracks
  trapTruckTracks = [];
  for (let r = 0; r < TRAP_TRUCK_ROWS; r++) {
    const row = [];
    for (let c = 0; c < TRAP_TRUCK_COLS; c++) row.push(null);
    trapTruckTracks.push(row);
  }

  // Trucks
  trapTruckTrucks = TRAP_TRUCK_STARTS.map(s => ({
    ownerId: s.ownerId,
    r: s.r,
    c: s.c,
  }));

  trapTruckTurn = 0;
  trapTruckDice = 0;
  trapTruckGameOver = false;
  trapTruckHighlights = [];

  updateTrapHud();
  drawTrapTruck();
  drawDiceVisual(0);
}

function startTrapTruckGame() {
  alert("Trap the Truck is disabled; please use the main WonkyTracks modes.");
  startGame("2P");
}

// Trap mode disabled; keep stub to avoid errors
function rollTrapTruckDice() { return; }

// Compute destinations that are exactly trapTruckDice steps away
function trapComputeHighlights() {
  trapTruckHighlights = [];
  if (trapTruckGameOver || trapTruckDice <= 0) return;

  const t = trapTruckTrucks[trapTruckTurn];
  const ownerId = t.ownerId;

  // BFS on the mask, storing distance in steps
  const dist = Array.from({ length: TRAP_TRUCK_ROWS }, () =>
    Array(TRAP_TRUCK_COLS).fill(-1)
  );

  const queue = [];
  dist[t.r][t.c] = 0;
  queue.push({ r: t.r, c: t.c });

  while (queue.length) {
    const { r, c } = queue.shift();
    const d = dist[r][c];

    for (const { dr, dc } of TRAP_DIRS) {
      const nr = r + dr;
      const nc = c + dc;
      if (!trapInBounds(nr, nc)) continue;
      if (!trapCanEnter(ownerId, nr, nc)) continue;

      const nd = d + 1;
      if (nd > trapTruckDice) continue;
      if (dist[nr][nc] !== -1 && dist[nr][nc] <= nd) continue;

      dist[nr][nc] = nd;
      queue.push({ r: nr, c: nc });
    }
  }

  // Only allow tiles at *exactly* distance N (the roll)
  for (let r = 0; r < TRAP_TRUCK_ROWS; r++) {
    for (let c = 0; c < TRAP_TRUCK_COLS; c++) {
      if (dist[r][c] === trapTruckDice && !(r === t.r && c === t.c)) {
        trapTruckHighlights.push({ r, c });
      }
    }
  }
}

// Handle a click on a Trap-the-Truck tile (r,c) in board coordinates
function tryTrapTruckMove(r, c) {
  if (trapTruckGameOver || isDiceRolling) return;
  if (currentMode !== GameMode.TRAP_TRUCK) return;
  if (trapTruckDice <= 0) return;

  const h = trapTruckHighlights.find(hh => hh.r === r && hh.c === c);
  if (!h) return; // not a legal destination

  const t = trapTruckTrucks[trapTruckTurn];

  // Move truck
  t.r = h.r;
  t.c = h.c;

  // Drop track on landing tile if empty
  if (!trapTruckTracks[h.r][h.c]) {
    trapTruckTracks[h.r][h.c] = t.ownerId;
  }

  // Clear current roll & highlights
  trapTruckDice = 0;
  trapTruckHighlights = [];
  drawTrapTruck();

  // Next player's turn
  trapTruckTurn = (trapTruckTurn + 1) % trapTruckTrucks.length;
  rollTrapTruckDice();
}

// Draw the Trap-the-Truck board
function drawTrapTruck() {
  const playableRows = TRAP_TRUCK_ROWS;
  const playableCols = TRAP_TRUCK_COLS;

  const margin = 40;
  const availableW = canvas.width - margin * 2;
  const availableH = canvas.height - margin * 2;
  const size = Math.floor(
    Math.min(availableW / playableCols, availableH / playableRows)
  );

  const boardW = playableCols * size;
  const boardH = playableRows * size;
  const offsetX = (canvas.width - boardW) / 2;
  const offsetY = (canvas.height - boardH) / 2;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Tiles & tracks
  for (let r = 0; r < playableRows; r++) {
    for (let c = 0; c < playableCols; c++) {
      if (!TRAP_TRUCK_BOARD_MASK[r][c]) continue;

      const x = offsetX + c * size;
      const y = offsetY + r * size;

      // base tile
      ctx.fillStyle = "#22aa55";
      ctx.fillRect(x, y, size, size);
      ctx.strokeStyle = "#111";
      ctx.strokeRect(x, y, size, size);

      // track, if any
      const trackOwner = trapTruckTracks[r][c];
      if (trackOwner) {
        ctx.fillStyle = trackOwner === 1 ? "#ff5575" : "#5da2ff";
        ctx.fillRect(
          x + size * 0.18,
          y + size * 0.18,
          size * 0.64,
          size * 0.64
        );
      }
    }
  }

  // Highlights (legal landing tiles)
  if (trapTruckDice > 0 && !trapTruckGameOver) {
    ctx.fillStyle = "rgba(255,255,0,0.35)";
    for (const h of trapTruckHighlights) {
      const x = offsetX + h.c * size;
      const y = offsetY + h.r * size;
      ctx.fillRect(x, y, size, size);
    }
  }

  // Trucks
  for (const t of trapTruckTrucks) {
    const x = offsetX + t.c * size + size / 2;
    const y = offsetY + t.r * size + size / 2;

    ctx.beginPath();
    ctx.arc(x, y, size * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = t.ownerId === 1 ? "#ff3344" : "#3344ff";
    ctx.fill();
    ctx.strokeStyle = "#000";
    ctx.stroke();
  }

  // Title
  ctx.fillStyle = "#000";
  ctx.font = "18px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(
    `Trap the Truck — P${trapTruckTurn + 1} roll: ${trapTruckDice || "-"}`,
    canvas.width / 2,
    offsetY - 15
  );
}

// Trap mode hooks removed for stability

// -----------------------------------------------------------------------------
// Initial preview
// -----------------------------------------------------------------------------
loadAssets();
buildMap();
gameState = GAME_STATE.PREVIEW;
currentMode = GameMode.WONKY;
updateHUD();
draw();
drawDiceVisual(0);

window.startGame = startGame;
window.tryFulfillContract = tryFulfillContract;
