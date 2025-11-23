// WonkyTracks: Season 0 – game.js
// Track Draft + Scoots + Contracts + Peninsula edges + sprite trucks + neon tracks + draft overlay + random resources

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
// Assets (truck sprites)
// -----------------------------------------------------------------------------
// Expecting:
//   assets/truck_red.png   – Player 1
//   assets/truck_blue.png  – Player 2
const assets = {
  truckRed: new Image(),
  truckBlue: new Image(),
};
let assetsLoaded = false;

function loadAssets(onReady) {
  let toLoad = 2;

  function done() {
    toLoad--;
    if (toLoad === 0) {
      assetsLoaded = true;
      if (onReady) onReady();
    }
  }

  assets.truckRed.onload = done;
  assets.truckBlue.onload = done;

  assets.truckRed.src = "assets/truck_red.png";
  assets.truckBlue.src = "assets/truck_blue.png";
}

// -----------------------------------------------------------------------------
// Game State
// -----------------------------------------------------------------------------
const GAME_STATE = {
  TRACK_DRAFT: "TRACK_DRAFT",
  PLAY: "PLAY",
  GAME_OVER: "GAME_OVER",
};

let gameState = GAME_STATE.TRACK_DRAFT;
let gameMode = "2P"; // all local for now

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

// Resource hubs are now random each game
let resourceHubs = []; // [{x,y,type}...]

let map = [];             // map[y][x] -> tile type
let resourceTypeMap = []; // resourceTypeMap[y][x] -> "concrete"|"wood"|"steel"|null

// -----------------------------------------------------------------------------
// Tracks & Scoots
// -----------------------------------------------------------------------------
let tracks = []; // { x, y, ownerId }

// Track Draft config
const STARTING_DRAFT_TRACKS = 8;  // starting pre-placed tracks per player
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
// Map Generation – Peninsula Shape + Random Resources
// -----------------------------------------------------------------------------
function generateResourceHubs() {
  resourceHubs = [];
  const resourceTypes = ["steel", "wood", "concrete"];

  for (const type of resourceTypes) {
    let attempts = 0;
    while (attempts < 200) {
      attempts++;
      // Avoid very edges so the cross fits comfortably
      const hx = 2 + Math.floor(Math.random() * (cols - 4)); // 2..cols-3
      const hy = 2 + Math.floor(Math.random() * (rows - 4)); // 2..rows-3

      if (isInCommunalArea(hx, hy)) continue;

      const positions = [
        { x: hx,     y: hy     },
        { x: hx + 1, y: hy     },
        { x: hx - 1, y: hy     },
        { x: hx,     y: hy + 1 },
        { x: hx,     y: hy - 1 },
      ];

      let ok = true;
      for (const pos of positions) {
        if (pos.x < 0 || pos.x >= cols || pos.y < 0 || pos.y >= rows) {
          ok = false;
          break;
        }
        if (map[pos.y][pos.x] !== TILE_LAND) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;

      // Keep hubs a bit spread out
      let farEnough = true;
      for (const hub of resourceHubs) {
        const dist = Math.abs(hub.x - hx) + Math.abs(hub.y - hy);
        if (dist < 6) {
          farEnough = false;
          break;
        }
      }
      if (!farEnough) continue;

      resourceHubs.push({ x: hx, y: hy, type });
      break;
    }
  }

  // Stamp hubs onto map / resourceTypeMap
  for (const hub of resourceHubs) {
    const { x: hx, y: hy, type } = hub;
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

  // Sculpt a rough peninsula by carving left/right coasts inward
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

  // A few small interior "rock" patches
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      if (isInCommunalArea(x, y)) continue;
      if (map[y][x] !== TILE_LAND) continue;
      if (Math.random() < 0.03) {
        map[y][x] = TILE_OBSTACLE;
      }
    }
  }

  // Stamp Home Base last so it always wins
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (isInCommunalArea(x, y)) {
        map[y][x] = TILE_COMMUNAL_BASE;
      }
    }
  }

  // Now generate random resource hubs on remaining land
  generateResourceHubs();
}

// -----------------------------------------------------------------------------
// Players & Trucks
// -----------------------------------------------------------------------------
function createPlayersAndTrucks() {
  players = [
    {
      id: 1,
      color: "#ff0044", // red company
      cash: 0,
      stockpile: { concrete: 0, wood: 0, steel: 0 },
      trackBudget: INITIAL_TRACK_BUDGET,
    },
    {
      id: 2,
      color: "#0066ff", // blue company
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

// Place a mid-game track on current truck tile (1 per turn, no move cost)
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

function autoOfferContractIfEligible(player) {
  if (!currentContract) return;
  const req = currentContract.require;
  const stock = player.stockpile;

  for (const key in req) {
    const need = req[key] || 0;
    if ((stock[key] || 0) < need) return;
  }

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

  for (const key in req) {
    const need = req[key] || 0;
    if ((stock[key] || 0) < need) return;
  }

  for (const key in req) {
    const need = req[key] || 0;
    stock[key] -= need;
  }

  player.cash += currentContract.reward;

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
    ctx.fillText(
      label,
      x * tileSize + tileSize / 2,
      y * tileSize + tileSize / 2
    );
    ctx.restore();
    return;
  }

  if (type === TILE_OBSTACLE) {
    const distToEdge = Math.min(x, cols - 1 - x, y, rows - 1 - y);
    if (distToEdge <= 1 && !isInCommunalArea(x, y)) {
      ctx.fillStyle = "#66aadd"; // water-ish
    } else {
      ctx.fillStyle = "#555555"; // rock
    }
  } else {
    ctx.fillStyle = "#aadd88"; // land
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

    // Soft glow ring (mag-lev vibe)
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

    // Track bar
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
    ctx.scale(1, squash);

    let sprite = null;
    const owner = players.find(p => p.id === t.ownerId);
    if (owner && assetsLoaded) {
      if (owner.id === 1) sprite = assets.truckRed;
      else if (owner.id === 2) sprite = assets.truckBlue;
    }

    if (sprite && sprite.complete && sprite.width > 0) {
      const w = sprite.width;
      const h = sprite.height;
      const scale = tileSize / h;
      ctx.drawImage(
        sprite,
        -(w * scale) / 2,
        -(h * scale) / 2,
        w * scale,
        h * scale
      );
    } else {
      // fallback rectangle
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

    if (gameState === GAME_STATE.PLAY && i === currentTruckIndex) {
      ctx.strokeStyle = "#ffff00";
      ctx.lineWidth = 2;
      const box = tileSize * 0.7;
      ctx.strokeRect(-box / 2, -box / 2, box, box);
      ctx.lineWidth = 1;
    }

    ctx.restore();
  }
}

// Draft overlay: "Place your tracks" + big truck over Home Base
function drawTrackDraftOverlay() {
  if (gameState !== GAME_STATE.TRACK_DRAFT) return;

  const centerX = COMMUNAL_X * tileSize + tileSize / 2;
  const centerY = COMMUNAL_Y * tileSize + tileSize / 2;

  // Title text
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.font = "bold 28px sans-serif";
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillText("Place your tracks", centerX + 2, centerY - tileSize * 1.6 + 2);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("Place your tracks", centerX, centerY - tileSize * 1.6);
  ctx.restore();

  // Big hero truck representing current drafter
  ctx.save();
  ctx.translate(centerX, centerY - tileSize * 0.2); // a bit above center

  const ownerId = draftCurrentPlayerId;
  let sprite = null;
  if (assetsLoaded) {
    sprite = ownerId === 1 ? assets.truckRed : assets.truckBlue;
  }

  if (sprite && sprite.complete && sprite.width > 0) {
    const w = sprite.width;
    const h = sprite.height;
    const scale = (tileSize * 2.4) / h; // nice chunky size
    ctx.globalAlpha = 0.96;
    ctx.drawImage(
      sprite,
      -(w * scale) / 2,
      -(h * scale) / 2,
      w * scale,
      h * scale
    );
  } else {
    const color = ownerId === 1 ? "#ff0044" : "#0066ff";
    ctx.fillStyle = color;
    ctx.fillRect(-tileSize, -tileSize / 2, tileSize * 2, tileSize);
  }

  ctx.restore();
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
      dot(0, 0); break;
    case 2:
      dot(-1, -1); dot(1, 1); break;
    case 3:
      dot(-1, -1); dot(0, 0); dot(1, 1); break;
    case 4:
      dot(-1, -1); dot(-1, 1); dot(1, -1); dot(1, 1); break;
    case 5:
      dot(-1, -1); dot(-1, 1); dot(1, -1); dot(1, 1); dot(0, 0); break;
    case 6:
      dot(-1, -1); dot(-1, 0); dot(-1, 1);
      dot(1, -1); dot(1, 0); dot(1, 1); break;
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

  if (gameState === GAME_STATE.TRACK_DRAFT) {
    drawTrackDraftOverlay();
  }
}

// -----------------------------------------------------------------------------
// HUD / Turn Flow
// -----------------------------------------------------------------------------
function updateHUD() {
  const truckIcon = "🚚";

  if (gameState === GAME_STATE.TRACK_DRAFT) {
    const p1Placed = draftTracksPlaced[1];
    const p2Placed = draftTracksPlaced[2];

    turnLabel.textContent = `Track Draft – Player ${draftCurrentPlayerId}, place a track`;
    const currentPlaced = draftTracksPlaced[draftCurrentPlayerId];
    diceLabel.textContent = `Track ${currentPlaced + 1} of ${STARTING_DRAFT_TRACKS}`;

    if (currentContract) {
      contractLabel.textContent = formatContract(currentContract);
    } else {
      contractLabel.textContent = "No active contract";
    }

    p1Status.style.color = "#ff0044";
    p2Status.style.color = "#0066ff";

    p1Status.innerHTML =
      `${truckIcon}&nbsp;P1 tracks placed: ${p1Placed}/${STARTING_DRAFT_TRACKS}`;
    p2Status.innerHTML =
      `${truckIcon}&nbsp;P2 tracks placed: ${p2Placed}/${STARTING_DRAFT_TRACKS} (each player has ${STARTING_DRAFT_TRACKS})`;

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

  p1Status.style.color = p1.color;
  p2Status.style.color = p2.color;

  p1Status.innerHTML =
    `${truckIcon}&nbsp;P1: $${p1.cash} | Tracks:${p1.trackBudget} | C:${s1.concrete} W:${s1.wood} S:${s1.steel}`;
  p2Status.innerHTML =
    `${truckIcon}&nbsp;P2: $${p2.cash} | Tracks:${p2.trackBudget} | C:${s2.concrete} W:${s2.wood} S:${s2.steel}`;

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
  if (x < 0 || x >= cols || y < 0 || y >= rows) return;
  if (gameState !== GAME_STATE.TRACK_DRAFT) return;

  const tile = getTile(x, y);

  if (tile !== TILE_LAND) return;
  if (isInCommunalArea(x, y)) return;
  if (map[y][x] === TILE_RESOURCE) return;
  if (trackAt(x, y)) return;

  const ownerId = draftCurrentPlayerId;
  if (draftTracksPlaced[ownerId] >= STARTING_DRAFT_TRACKS) return;

  tracks.push({ x, y, ownerId });
  draftTracksPlaced[ownerId]++;

  const totalPlaced = draftTracksPlaced[1] + draftTracksPlaced[2];
  const totalNeeded = STARTING_DRAFT_TRACKS * 2;

  if (totalPlaced >= totalNeeded) {
    createPlayersAndTrucks();
    currentPlayerIndex = 0;
    currentTruckIndex = 0;
    gameState = GAME_STATE.PLAY;

    updateHUD();
    draw();
    beginTurn();
    return;
  }

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

// Initial setup: load art, then show board
loadAssets(() => {
  buildMap();
  draw();
  updateHUD();
});

// Expose API to HTML
window.startGame = startGame;
window.tryFulfillContract = tryFulfillContract;
