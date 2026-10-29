import {Injectable, NgZone} from '@angular/core';
import {ScoresService} from './scores.service';
import {HapticsService} from './haptics.service';
import {SoundService} from './sound.service';

const COLS = 10;
const ROWS = 20;

const COLORS = [
  '#A3C4F3', // Soft Blue
  '#FFB3C6', // Soft Pink
  '#B5EAD7', // Mint
  '#FFDAC1', // Peach
  '#E2F0CB', // Light Green
  '#CBAACB', // Lavender
  '#FFD6A5'  // Pastel Orange
];

const SHAPES = [
  [[1, 1, 1, 1]], // I
  [[1, 1], [1, 1]], // O
  [[0, 1, 0], [1, 1, 1]], // T
  [[1, 0, 0], [1, 1, 1]], // L
  [[0, 0, 1], [1, 1, 1]], // J
  [[1, 1, 0], [0, 1, 1]], // S
  [[0, 1, 1], [1, 1, 0]], // Z
];

interface LockSheen {
  cells: { x: number; y: number }[];
  startTime: number;
  duration: number;
}

interface FloatingScore {
  text: string;
  x: number;
  y: number;
  startY: number;
  startTime: number;
  duration: number;
  isTetris: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  startTime: number;
  duration: number;
}

@Injectable({
  providedIn: 'root'
})
export class GameService {

  // Base config
  private BASE_DROP_MS = 900;      // main speed: 900ms per step
  private SOFT_DROP_FACTOR = 0.20; // soft drop: 20% of normal interval
  private MIN_DROP_MS = 120;

  // Runtime state
  private dropInterval = this.BASE_DROP_MS;
  private softDropping = false;

  // Animation timing
  private lastTime = 0;
  private dropCounter = 0;
  private animationFrameId: number | null = null;

  public onGameOver: (() => void) | null = null;
  private ctx!: CanvasRenderingContext2D;
  private board: number[][] = Array.from({length: ROWS}, () => Array(COLS).fill(0));
  private currentPiece: {
    shape: number[][];
    color: string;
    x: number;
    y: number;
    drawX: number;
    colorIndex: number;
  } | null = null;

  private score = 0;
  private gameOver = false;
  private paused = false;
  private blockSize = 20;
  private dpr = 1;
  private nextShapeIndex: number = Math.floor(Math.random() * SHAPES.length);
  private nextCtx: CanvasRenderingContext2D | null = null;
  public onScoreChange: ((score: number) => void) | null = null;

  // Delicate animations state
  private lockSheen: LockSheen | null = null;
  private isClearingLines = false;
  private clearingRows: number[] = [];
  private clearStartTime = 0;
  private clearDuration = 300; // ms
  private floatingScores: FloatingScore[] = [];
  private particles: Particle[] = [];

  gameContainerEl?: HTMLElement;
  onScore?: (delta: number) => void;

  constructor(
    private scoresService: ScoresService,
    private haptics: HapticsService,
    private sound: SoundService,
    private zone: NgZone
  ) {}

  private notifyScoreChange() {
    this.onScoreChange?.(this.score);
    this.scoresService.setCurrentScore(this.score);
  }

  public addScore(points: number) {
    this.score += points;
    this.notifyScoreChange();
  }

  init(ctx: CanvasRenderingContext2D, nextCtx?: CanvasRenderingContext2D, cssBlockSize: number = 24) {
    this.ctx = ctx;
    if (nextCtx) {
      this.nextCtx = nextCtx;
      this.setupNextCanvas();
    }
    this.resize(cssBlockSize);
  }

  private setupNextCanvas() {
    if (!this.nextCtx) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    const nextCssWidth = 85;
    const nextCssHeight = 80;
    this.nextCtx.canvas.width = Math.round(nextCssWidth * this.dpr);
    this.nextCtx.canvas.height = Math.round(nextCssHeight * this.dpr);
    this.nextCtx.canvas.style.width = `${nextCssWidth}px`;
    this.nextCtx.canvas.style.height = `${nextCssHeight}px`;
    this.drawNextShape();
  }

  resize(cssBlockSize: number) {
    if (!this.ctx) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.blockSize = Math.floor(cssBlockSize * this.dpr);

    const cssWidth = cssBlockSize * COLS;
    const cssHeight = cssBlockSize * ROWS;

    this.ctx.canvas.width = this.blockSize * COLS;
    this.ctx.canvas.height = this.blockSize * ROWS;
    this.ctx.canvas.style.width = `${cssWidth}px`;
    this.ctx.canvas.style.height = `${cssHeight}px`;

    this.draw();
  }

  start() {
    this.score = 0;
    this.notifyScoreChange();
    this.lastTime = performance.now();
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.animationFrameId = requestAnimationFrame(this.frame);
  }

  private frame = (time: number) => {
    const delta = time - this.lastTime;
    this.lastTime = time;

    if (!this.paused && !this.gameOver) {
      if (this.isClearingLines) {
        this.updateLineClear(time);
      } else {
        this.dropCounter += delta;
        const currentInterval = this.softDropping
          ? Math.max(this.dropInterval * this.SOFT_DROP_FACTOR, 40)
          : this.dropInterval;

        if (this.dropCounter >= currentInterval) {
          this.dropCounter = 0;
          this.update();
        }
      }
    }

    this.draw(time);
    this.animationFrameId = requestAnimationFrame(this.frame);
  };

  newGame() {
    this.score = 0;
    if (this.onScoreChange) this.onScoreChange(this.score);
    this.gameOver = false;
    this.paused = false;
    this.board = Array.from({length: ROWS}, () => Array(COLS).fill(0));
    this.lockSheen = null;
    this.isClearingLines = false;
    this.clearingRows = [];
    this.particles = [];
    this.floatingScores = [];
    this.spawnPiece();
    this.setBaseSpeed(1000);

    this.lastTime = performance.now();
    this.dropCounter = 0;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.animationFrameId = requestAnimationFrame(this.frame);

    this.draw();
  }

  private checkCollision(shape: number[][], offsetX: number, offsetY: number): boolean {
    return shape.some((row, y) =>
      row.some((value, x) =>
        value &&
        (
          offsetY + y >= ROWS ||
          offsetX + x < 0 ||
          offsetX + x >= COLS ||
          this.board[offsetY + y]?.[offsetX + x]
        )
      )
    );
  }

  private getGhostY(): number {
    if (!this.currentPiece) return 0;
    let ghostY = this.currentPiece.y;
    while (!this.checkCollision(this.currentPiece.shape, this.currentPiece.x, ghostY + 1)) {
      ghostY++;
    }
    return ghostY;
  }

  private drawNextShape() {
    if (!this.nextCtx) return;

    const ctx = this.nextCtx;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    const shape = SHAPES[this.nextShapeIndex];
    const color = COLORS[this.nextShapeIndex];
    const blockSize = Math.floor(18 * this.dpr);

    const offsetX = (ctx.canvas.width - shape[0].length * blockSize) / 2;
    const offsetY = (ctx.canvas.height - shape.length * blockSize) / 2;

    ctx.fillStyle = color;
    shape.forEach((row, y) =>
      row.forEach((val, x) => {
        if (val) {
          ctx.fillRect(
            offsetX + x * blockSize,
            offsetY + y * blockSize,
            blockSize,
            blockSize
          );
        }
      })
    );
  }

  private spawnPiece() {
    const shapeIndex = this.nextShapeIndex;
    const shape = SHAPES[shapeIndex];
    const color = COLORS[shapeIndex];

    this.currentPiece = {
      shape,
      color,
      x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2),
      y: 0,
      drawX: 0,
      colorIndex: shapeIndex + 1
    };
    this.currentPiece.drawX = this.currentPiece.x;

    this.nextShapeIndex = Math.floor(Math.random() * SHAPES.length);
    this.drawNextShape();
  }

  private update() {
    if (this.gameOver || !this.currentPiece || this.isClearingLines) return;

    this.currentPiece.y++;

    if (this.collides()) {
      this.currentPiece.y--;
      this.lockCurrentPiece();
    }
  }

  private collides(): boolean {
    if (!this.currentPiece) return false;
    const {shape, x, y} = this.currentPiece;
    return this.checkCollision(shape, x, y);
  }

  /** Unified, elegant piece locking with delicate sheen feedback */
  private lockCurrentPiece() {
    if (!this.currentPiece || this.gameOver) return;

    const piece = this.currentPiece;
    const lockedCells: { x: number; y: number }[] = [];

    // 1. Merge into board
    piece.shape.forEach((row, dy) => {
      row.forEach((val, dx) => {
        if (val && this.board[piece.y + dy]) {
          this.board[piece.y + dy][piece.x + dx] = piece.colorIndex;
          lockedCells.push({ x: piece.x + dx, y: piece.y + dy });
        }
      });
    });

    // 2. Play lock feedback
    this.onPieceLocked();

    // 3. Register delicate lock sheen on the cells (no container jump)
    this.lockSheen = {
      cells: lockedCells,
      startTime: performance.now(),
      duration: 160
    };

    this.currentPiece = null;

    // 4. Check for completed lines
    const fullRowIndices: number[] = [];
    this.board.forEach((row, y) => {
      if (row.every(cell => cell > 0)) {
        fullRowIndices.push(y);
      }
    });

    if (fullRowIndices.length > 0) {
      this.startLineClear(fullRowIndices);
    } else {
      this.spawnPiece();
      if (this.collides()) {
        this.triggerGameOver();
      }
    }
  }

  private startLineClear(rows: number[]) {
    this.isClearingLines = true;
    this.clearingRows = rows;
    this.clearStartTime = performance.now();
    this.clearDuration = 300;

    const clearedCount = rows.length;
    const deltaScore = this.scoreFor(clearedCount);

    // Audio & Haptics & container sheen
    this.onLinesCleared(clearedCount);

    // Calculate center of cleared rows for floating score badge
    const avgRow = rows.reduce((sum, r) => sum + r, 0) / rows.length;
    const centerY = (avgRow + 0.5) * this.blockSize;
    const centerX = (COLS * this.blockSize) / 2;

    const isTetris = clearedCount === 4;
    const label = isTetris ? `TETRIS! +${deltaScore}` : `+${deltaScore}`;

    this.floatingScores.push({
      text: label,
      x: centerX,
      y: centerY,
      startY: centerY,
      startTime: performance.now(),
      duration: 750,
      isTetris
    });

    this.spawnClearSparkles(rows);
  }

  private updateLineClear(now: number) {
    if (!this.isClearingLines) return;

    if (now - this.clearStartTime >= this.clearDuration) {
      const clearedSet = new Set(this.clearingRows);
      const clearedCount = this.clearingRows.length;

      // Collapse rows
      this.board = this.board.filter((_, idx) => !clearedSet.has(idx));
      while (this.board.length < ROWS) {
        this.board.unshift(Array(COLS).fill(0));
      }

      const deltaScore = this.scoreFor(clearedCount);
      this.score += deltaScore;
      this.notifyScoreChange();
      this.onScore?.(deltaScore);

      this.isClearingLines = false;
      this.clearingRows = [];

      this.spawnPiece();
      if (this.collides()) {
        this.triggerGameOver();
      }
    }
  }

  private spawnClearSparkles(rows: number[]) {
    const count = rows.length * 8;
    for (let i = 0; i < count; i++) {
      const row = rows[Math.floor(Math.random() * rows.length)];
      const col = Math.random() * COLS;
      const angle = (Math.random() * Math.PI * 2);
      const speed = (0.4 + Math.random() * 1.6) * this.dpr;
      this.particles.push({
        x: col * this.blockSize,
        y: (row + 0.5) * this.blockSize,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.3 * this.dpr,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        size: (2 + Math.random() * 2.5) * this.dpr,
        startTime: performance.now(),
        duration: 400 + Math.random() * 250
      });
    }
  }

  private triggerGameOver() {
    this.gameOver = true;
    if (this.score > 0) {
      this.scoresService.maybePromoteToHighScores(this.score);
      this.scoresService.clearCurrentScore();
    }
    this.onGameOver?.();
  }

  private drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ) {
    if (typeof (ctx as any).roundRect === 'function') {
      (ctx as any).roundRect(x, y, w, h, r);
    } else {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arcTo(x + w, y, x + w, y + r, r);
      ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h);
      ctx.arcTo(x, y + h, x, y + h - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
    }
  }

  private draw(time: number = performance.now()) {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, COLS * this.blockSize, ROWS * this.blockSize);

    // Draw grid lines
    this.ctx.strokeStyle = '#bbb';
    this.ctx.lineWidth = 0.2;

    for (let x = 0; x <= COLS; x++) {
      this.ctx.beginPath();
      this.ctx.moveTo(x * this.blockSize, 0);
      this.ctx.lineTo(x * this.blockSize, ROWS * this.blockSize);
      this.ctx.stroke();
    }

    for (let y = 0; y <= ROWS; y++) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y * this.blockSize);
      this.ctx.lineTo(COLS * this.blockSize, y * this.blockSize);
      this.ctx.stroke();
    }

    // Set of clearing rows for animation
    const clearingSet = this.isClearingLines ? new Set(this.clearingRows) : null;
    const clearProgress = this.isClearingLines
      ? Math.min(1, Math.max(0, (time - this.clearStartTime) / this.clearDuration))
      : 0;

    // Draw board blocks
    this.board.forEach((row, y) => {
      const isClearingRow = clearingSet?.has(y);

      row.forEach((val, x) => {
        if (!val) return;

        const baseColor = COLORS[val - 1];

        if (isClearingRow) {
          // Delicate 2-phase line clear animation
          this.ctx.save();
          if (clearProgress < 0.35) {
            // Phase 1: Soft luminous glow & bright highlight
            const flashRatio = clearProgress / 0.35;
            this.ctx.fillStyle = baseColor;
            this.ctx.fillRect(
              x * this.blockSize,
              y * this.blockSize,
              this.blockSize,
              this.blockSize
            );
            this.ctx.fillStyle = `rgba(255, 255, 255, ${flashRatio * 0.75})`;
            this.ctx.fillRect(
              x * this.blockSize,
              y * this.blockSize,
              this.blockSize,
              this.blockSize
            );
          } else {
            // Phase 2: Delicate dissolve & shrink fade
            const dissolveRatio = (clearProgress - 0.35) / 0.65;
            const alpha = Math.max(0, 1 - dissolveRatio);
            const scale = 1 - dissolveRatio * 0.35;
            const size = this.blockSize * scale;
            const offset = (this.blockSize - size) / 2;

            this.ctx.globalAlpha = alpha;
            this.ctx.fillStyle = baseColor;
            this.ctx.fillRect(
              x * this.blockSize + offset,
              y * this.blockSize + offset,
              size,
              size
            );

            this.ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.5})`;
            this.ctx.fillRect(
              x * this.blockSize + offset,
              y * this.blockSize + offset,
              size,
              size
            );
          }
          this.ctx.restore();
        } else {
          // Normal block
          this.ctx.fillStyle = baseColor;
          this.ctx.fillRect(
            x * this.blockSize,
            y * this.blockSize,
            this.blockSize,
            this.blockSize
          );

          // Subtle border
          this.ctx.strokeStyle = '#bbb';
          this.ctx.lineWidth = 0.2;
          this.ctx.strokeRect(
            x * this.blockSize + 0.5,
            y * this.blockSize + 0.5,
            this.blockSize - 1,
            this.blockSize - 1
          );
        }
      });
    });

    // Delicate lock sheen on recently locked piece
    if (this.lockSheen) {
      const elapsed = time - this.lockSheen.startTime;
      if (elapsed < this.lockSheen.duration) {
        const t = elapsed / this.lockSheen.duration;
        const alpha = (1 - t) * 0.45;
        this.ctx.save();
        this.ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        this.ctx.strokeStyle = `rgba(255, 255, 255, ${(1 - t) * 0.8})`;
        this.ctx.lineWidth = 1.2 * this.dpr;

        this.lockSheen.cells.forEach(cell => {
          this.ctx.fillRect(
            cell.x * this.blockSize,
            cell.y * this.blockSize,
            this.blockSize,
            this.blockSize
          );
          this.ctx.strokeRect(
            cell.x * this.blockSize + 0.5,
            cell.y * this.blockSize + 0.5,
            this.blockSize - 1,
            this.blockSize - 1
          );
        });
        this.ctx.restore();
      } else {
        this.lockSheen = null;
      }
    }

    // Draw active falling piece & ghost piece (hidden while lines dissolve)
    if (this.currentPiece && !this.isClearingLines) {
      const {shape, x, y, color} = this.currentPiece;
      this.currentPiece.drawX += (x - this.currentPiece.drawX) * 0.3;

      const ghostY = this.getGhostY();
      this.ctx.globalAlpha = 0.3;
      this.ctx.fillStyle = color;
      shape.forEach((row, dy) =>
        row.forEach((val, dx) => {
          if (val) {
            this.ctx.fillRect(
              (x + dx) * this.blockSize,
              (ghostY + dy) * this.blockSize,
              this.blockSize,
              this.blockSize
            );
          }
        })
      );
      this.ctx.globalAlpha = 1;

      // Draw actual piece
      this.ctx.fillStyle = color;
      shape.forEach((row, dy) =>
        row.forEach((val, dx) => {
          if (val) {
            this.ctx.fillRect(
              (this.currentPiece!.drawX + dx) * this.blockSize,
              (y + dy) * this.blockSize,
              this.blockSize,
              this.blockSize
            );
          }
        })
      );
    }

    // Draw floating score badges & sparkles
    this.drawFloatingScoresAndParticles(time);

    // Paused and Game Over overlays
    if (this.paused && !this.gameOver) {
      const centerX = (COLS * this.blockSize) / 2;
      const centerY = (ROWS * this.blockSize) / 2;

      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      this.ctx.fillRect(this.blockSize, centerY - (25 * this.dpr), (COLS - 2) * this.blockSize, 50 * this.dpr);

      this.ctx.fillStyle = '#fff';
      this.ctx.font = `bold ${Math.round(20 * this.dpr)}px Arial`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('Paused', centerX, centerY);
      this.ctx.textAlign = 'start';
      this.ctx.textBaseline = 'alphabetic';
    }

    if (this.gameOver) {
      const centerX = (COLS * this.blockSize) / 2;
      const centerY = (ROWS * this.blockSize) / 2;

      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      this.ctx.fillRect(this.blockSize, centerY - (40 * this.dpr), (COLS - 2) * this.blockSize, 80 * this.dpr);

      this.ctx.fillStyle = '#fff';
      this.ctx.font = `bold ${Math.round(20 * this.dpr)}px Arial`;
      this.ctx.textAlign = 'center';
      this.ctx.fillText('Game Over', centerX, centerY - (8 * this.dpr));

      this.ctx.font = `${Math.round(15 * this.dpr)}px Arial`;
      this.ctx.fillText(`Final Score: ${this.score}`, centerX, centerY + (20 * this.dpr));

      this.ctx.textAlign = 'start';
    }
  }

  private drawFloatingScoresAndParticles(now: number) {
    // 1. Draw particles
    this.particles = this.particles.filter(p => {
      const elapsed = now - p.startTime;
      if (elapsed >= p.duration) return false;

      const progress = elapsed / p.duration;
      const alpha = Math.max(0, 1 - progress);
      const currentX = p.x + p.vx * (elapsed / 16);
      const currentY = p.y + p.vy * (elapsed / 16);

      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      this.ctx.fillStyle = p.color;
      this.ctx.beginPath();
      this.ctx.arc(currentX, currentY, p.size * (1 - progress * 0.3), 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();

      return true;
    });

    // 2. Draw floating score badges
    this.floatingScores = this.floatingScores.filter(f => {
      const elapsed = now - f.startTime;
      if (elapsed >= f.duration) return false;

      const progress = elapsed / f.duration;
      const currentY = f.startY - progress * 26 * this.dpr;
      const alpha = progress < 0.35 ? 1 : Math.max(0, 1 - (progress - 0.35) / 0.65);

      this.ctx.save();
      this.ctx.globalAlpha = alpha;

      const fontSize = Math.round((f.isTetris ? 15 : 13) * this.dpr);
      this.ctx.font = `bold ${fontSize}px system-ui, -apple-system, Roboto, sans-serif`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';

      const textMetrics = this.ctx.measureText(f.text);
      const textWidth = textMetrics.width;
      const padX = 10 * this.dpr;
      const padY = 5 * this.dpr;
      const pillW = textWidth + padX * 2;
      const pillH = fontSize + padY * 2;
      const pillX = f.x - pillW / 2;
      const pillY = currentY - pillH / 2;

      // Soft pill background with subtle shadow
      this.ctx.fillStyle = f.isTetris ? 'rgba(255, 248, 225, 0.95)' : 'rgba(255, 255, 255, 0.95)';
      this.ctx.shadowColor = 'rgba(0, 0, 0, 0.12)';
      this.ctx.shadowBlur = 6 * this.dpr;
      this.ctx.shadowOffsetY = 2 * this.dpr;

      const radius = pillH / 2;
      this.drawRoundedRect(this.ctx, pillX, pillY, pillW, pillH, radius);
      this.ctx.fill();

      // Reset shadow for text and stroke
      this.ctx.shadowColor = 'transparent';
      this.ctx.shadowBlur = 0;
      this.ctx.shadowOffsetY = 0;

      // Delicate stroke
      this.ctx.strokeStyle = f.isTetris ? 'rgba(255, 179, 0, 0.6)' : 'rgba(94, 146, 250, 0.35)';
      this.ctx.lineWidth = 1 * this.dpr;
      this.drawRoundedRect(this.ctx, pillX, pillY, pillW, pillH, radius);
      this.ctx.stroke();

      // Text color
      this.ctx.fillStyle = f.isTetris ? '#E65100' : '#2B5EE3';
      this.ctx.fillText(f.text, f.x, currentY);

      this.ctx.restore();

      return true;
    });
  }

  handleKey(key: string) {
    if (!this.currentPiece || this.gameOver || this.isClearingLines || this.paused) return;

    switch (key) {
      case 'ArrowLeft':
        this.currentPiece.x--;
        if (this.collides()) this.currentPiece.x++;
        break;
      case 'ArrowRight':
        this.currentPiece.x++;
        if (this.collides()) this.currentPiece.x--;
        break;
      case 'ArrowDown':
        this.currentPiece.y++;
        if (this.collides()) {
          this.currentPiece.y--;
          this.lockCurrentPiece();
          return;
        }
        break;
      case 'ArrowUp':
        this.rotate();
        break;
      case 'Enter':
        this.hardDrop();
        return;
      case 'p':
      case 'P':
        this.togglePause();
        return;
      default:
        return;
    }

    this.draw();
  }

  private rotate() {
    if (!this.currentPiece) return;

    const shape = this.currentPiece.shape;
    const rotated = shape[0].map((_, i) => shape.map(row => row[i]).reverse());

    const originalShape = this.currentPiece.shape;
    const originalX = this.currentPiece.x;
    this.currentPiece.shape = rotated;

    if (this.collides()) {
      // Wall kick: try nudging horizontally by 1 or 2 cells so pieces near borders can still rotate
      const kicks = [-1, 1, -2, 2];
      let kicked = false;
      for (const dx of kicks) {
        if (!this.checkCollision(rotated, originalX + dx, this.currentPiece.y)) {
          this.currentPiece.x = originalX + dx;
          this.currentPiece.drawX = this.currentPiece.x;
          kicked = true;
          break;
        }
      }
      if (!kicked) {
        this.currentPiece.shape = originalShape;
        this.currentPiece.x = originalX;
      }
    }
  }

  togglePause() {
    if (this.gameOver) return;

    this.paused = !this.paused;
    this.scoresService.setCurrentScore(this.score);
    this.draw();
  }

  hardDrop() {
    if (!this.currentPiece || this.gameOver || this.isClearingLines || this.paused) return;

    this.currentPiece.y = this.getGhostY();
    this.lockCurrentPiece();
    this.draw();
  }

  public setBaseSpeed(ms: number) {
    this.BASE_DROP_MS = Math.max(ms, this.MIN_DROP_MS);
    this.dropInterval = this.BASE_DROP_MS;
  }

  public setLevel(level: number) {
    const factor = Math.pow(0.92, level);
    this.dropInterval = Math.max(this.BASE_DROP_MS * factor, this.MIN_DROP_MS);
  }

  public setSoftDropping(on: boolean) {
    this.softDropping = on;
  }

  public isPaused(): boolean {
    return this.paused;
  }

  public getScore(): number {
    return this.score;
  }

  public getBoardCols(): number {
    return COLS;
  }

  public getBoardRows(): number {
    return ROWS;
  }

  public isGameOver(): boolean {
    return this.gameOver;
  }

  /** Call when the falling piece permanently locks into the board */
  async onPieceLocked() {
    this.bumpClass(this.gameContainerEl, 'lock-thud', 100);
    this.sound.play('lock');
    this.haptics.selection();
  }

  /** Call when lines are cleared */
  async onLinesCleared(cleared: number) {
    if (!cleared) return;

    if (cleared < 4) {
      this.sound.play('line');
      this.haptics.selection();
      this.bumpClass(this.gameContainerEl, 'line-flash', 320);
    } else {
      this.sound.play('tetris');
      this.haptics.success();
      this.bumpClass(this.gameContainerEl, 'tetris-burst', 500);
    }
  }

  public scoreFor(cleared: number): number {
    switch (cleared) {
      case 1:
        return 100;
      case 2:
        return 250;
      case 3:
        return 500;
      case 4:
        return 1200;
      default:
        return 0;
    }
  }

  private bumpClass(el: HTMLElement | undefined, cls: string, durationMs: number) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), durationMs);
  }
}
