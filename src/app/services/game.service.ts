import {Injectable, NgZone} from '@angular/core';
import {ScoresService} from './scores.service';
import {HapticsService} from './haptics.service';
import {SoundService} from './sound.service';

const COLS = 10;
//const ROWS = 20;
const BLOCK_SIZE = 25; // px per block (adjust to your design)

// Get the available height (in pixels)
const screenHeight = window.innerHeight;

// Reserve some space for UI elements (score, buttons, etc.)
const reservedSpace = 400; // px
const availableHeight = screenHeight - reservedSpace;

// Compute how many rows fit
let ROWS = Math.floor(availableHeight / BLOCK_SIZE);

// Clamp it to a reasonable range
if (ROWS > 20) ROWS = 20;
if (ROWS < 18) ROWS = 18;

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

@Injectable({
  providedIn: 'root'
})
export class GameService {

  // Base config (you can tweak these)
  private BASE_DROP_MS = 900;      // <- main speed: 900ms per step (slower)
  private SOFT_DROP_FACTOR = 0.20; // soft drop: 20% of normal interval (5x faster)
  private MIN_DROP_MS = 120;       // clamp if you add levels later

  // Runtime state
  private dropInterval = this.BASE_DROP_MS; // current falling interval
  private softDropping = false;

  // Animation timing
  private lastTime = 0;
  private dropCounter = 0;

  public onGameOver: (() => void) | null = null;
  private ctx!: CanvasRenderingContext2D;
  private board: number[][] = [];
  private currentPiece: {
    shape: number[][],
    color: string,
    x: number,
    y: number,
    drawX: number;
    colorIndex: number;
  } | null = null;
  private score = 0;
  private gameOver = false;
  private paused = false;
  private blockSize = 20;
  private nextShapeIndex: number = Math.floor(Math.random() * SHAPES.length);
  private nextCtx: CanvasRenderingContext2D | null = null;
  public onScoreChange: ((score: number) => void) | null = null;

  gameContainerEl?: HTMLElement; // set from component after ViewInit
  onScore?: (delta: number) => void; // inject from component

  constructor(
    private scoresService: ScoresService,
    private haptics: HapticsService,
    private sound: SoundService,
    private zone: NgZone) {
  }

  private notifyScoreChange() {
    // call this whenever score changes or resets
    this.onScoreChange?.(this.score);
    this.scoresService.setCurrentScore(this.score); // persist
  }

  private addScore(points: number) {
    this.score += points;
    this.notifyScoreChange();
  }

  init(ctx: CanvasRenderingContext2D, nextCtx?: CanvasRenderingContext2D) {
    this.ctx = ctx;
    if (nextCtx) this.nextCtx = nextCtx;

    const canvasWidth = ctx.canvas.width;
    this.blockSize = Math.floor(canvasWidth / COLS);
    ctx.canvas.height = this.blockSize * ROWS;

    // Do not initialize a new game automatically
    //this.newGame();
  }

  start() {
    this.score = 0;
    this.notifyScoreChange(); // persist 0
    this.lastTime = performance.now();
    requestAnimationFrame(this.frame);
  }

  private frame = (time: number) => {
    const delta = time - this.lastTime;
    this.lastTime = time;
    this.dropCounter += delta;

    const currentInterval = this.softDropping
      ? Math.max(this.dropInterval * this.SOFT_DROP_FACTOR, 40) // cap very fast soft drop
      : this.dropInterval;

    if (!this.paused && !this.gameOver && this.dropCounter >= currentInterval) {
      this.dropCounter = 0;
      this.update(); // this does y++ and merge/clear if needed
    }

    // no smooth fall: draw without progress
    this.draw(0);
    requestAnimationFrame(this.frame);
  };

  newGame() {
    this.score = 0;
    if (this.onScoreChange) this.onScoreChange(this.score);
    this.gameOver = false;
    this.paused = false;
    this.board = Array.from({length: ROWS}, () => Array(COLS).fill(0));
    this.spawnPiece();
    this.setBaseSpeed(1000); // 1s per step

    // Start the new animation loop
    this.lastTime = performance.now();
    this.dropCounter = 0;
    requestAnimationFrame(this.frame);

    this.draw(); // Optional initial draw
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
    const blockSize = 20;

    // Center shape in mini-canvas
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

    // Set next shape index for future
    this.nextShapeIndex = Math.floor(Math.random() * SHAPES.length);

    this.drawNextShape(); // draw to mini canvas
  }


  private update() {
    if (this.gameOver || !this.currentPiece) return;

    this.currentPiece.y++;

    if (this.collides()) {
      this.currentPiece.y--;
      // >>> Trigger haptics + sound for locking
      this.onPieceLocked();
      this.merge();

      this.clearLines();
      this.spawnPiece();


      if (this.collides()) {
        this.gameOver = true;
        if (this.score > 0) {
          this.scoresService.maybePromoteToHighScores(this.score);
          this.scoresService.clearCurrentScore(); // no longer “in progress”
        }
      }
    }

    this.draw();
  }

  private collides(): boolean {
    const {shape, x, y} = this.currentPiece!;
    return this.checkCollision(shape, x, y);
  }

  private merge() {
    const {shape, x, y, color} = this.currentPiece!;
    shape.forEach((row, dy) =>
      row.forEach((val, dx) => {
        if (val && this.board[y + dy]) this.board[y + dy][x + dx] = COLORS.indexOf(color) + 1;
      })
    );
  }

  private draw(fallProgress: number = 0) {
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

    this.board.forEach((row, y) =>
        row.forEach((val, x) => {
          if (val) {
            // Fill the block
            this.ctx.fillStyle = COLORS[val - 1];
            this.ctx.fillRect(
              x * this.blockSize,
              y * this.blockSize,
              this.blockSize,
              this.blockSize
            );

// Add a border
            this.ctx.strokeStyle = '#bbb'; // Dark pastel outline (same as background or slightly darker)
            this.ctx.lineWidth = 0.2;
            this.ctx.strokeRect(
              x * this.blockSize + 0.5,
              y * this.blockSize + 0.5,
              this.blockSize - 1,
              this.blockSize - 1
            );
          }
        })
    );

    if (this.currentPiece) {
      const {shape, x, y, color} = this.currentPiece;
      // Smooth horizontal movement
      this.currentPiece.drawX += (x - this.currentPiece.drawX) * 0.3;

      const ghostY = this.getGhostY();
      this.ctx.globalAlpha = 0.3; // ghost transparency
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
      this.ctx.globalAlpha = 1; // reset transparency

      // Smooth falling animation
      //const isLanding = this.checkCollision(shape, x, y + 1);
      //const animProgress = isLanding ? 0 : fallProgress;
      const animProgress = 0; // disable falling animation for better UX

      // Draw actual falling piece
      this.ctx.fillStyle = color;
      shape.forEach((row, dy) =>
        row.forEach((val, dx) => {
          if (val) {
            this.ctx.fillRect(
              (this.currentPiece!.drawX + dx) * this.blockSize,
              (y + dy + animProgress) * this.blockSize,
              this.blockSize,
              this.blockSize
            );
          }
        })
      );
    }

    // Score display
    this.ctx.fillStyle = '#000';
    this.ctx.font = '16px Arial';
    //this.ctx.fillText('Score: ' + this.score, 5, 20);

    // Paused and Game Over overlays
    if (this.paused && !this.gameOver) {
      const centerX = (COLS * this.blockSize) / 2;
      const centerY = (ROWS * this.blockSize) / 2;

      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      this.ctx.fillRect(this.blockSize, centerY - 35, (COLS - 2) * this.blockSize, 55);

      this.ctx.fillStyle = '#fff';
      this.ctx.font = '20px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('Paused', centerX, centerY);
      this.ctx.textAlign = 'start';
    }

    if (this.gameOver) {
      const centerX = (COLS * this.blockSize) / 2;
      const centerY = (ROWS * this.blockSize) / 2;

      // Dark background box
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      this.ctx.fillRect(this.blockSize, centerY - 35, (COLS - 2) * this.blockSize, 85);

      // "Game Over" text
      this.ctx.fillStyle = '#fff';
      this.ctx.font = '20px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('Game Over', centerX, centerY - 5);

      // Final Score
      this.ctx.font = '16px Arial';
      this.ctx.fillText(`Final Score: ${this.score}`, centerX, centerY + 20);

      this.ctx.textAlign = 'start'; // Reset alignment
    }
  }

  handleKey(key: string) {
    if (!this.currentPiece || this.gameOver) return;

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
          this.onPieceLocked();
          this.merge();
          this.clearLines();
          this.spawnPiece();
          if (this.collides()) {
            // Game over condition
            // this.newGame();
            return;
          }
        }
        break;
      case 'ArrowUp':
        this.rotate();
        break;
      case 'Enter':
        this.hardDrop();
        return; // already drew
      case 'p':
      case 'P':
        this.togglePause();
        return; // already drew
      default:
        return; // ignore other keys
    }

    this.draw();
  }

  private rotate() {
    if (!this.currentPiece) return;

    const shape = this.currentPiece.shape;
    const rotated = shape[0].map((_, i) => shape.map(row => row[i]).reverse());

    const original = this.currentPiece.shape;
    this.currentPiece.shape = rotated;
    if (this.collides()) {
      this.currentPiece.shape = original; // revert if invalid
    }
  }

  private clearLines() {
    let linesCleared = 0;
    this.board = this.board.filter(row => {
      const full = row.every(cell => cell);
      if (full) linesCleared++;
      return !full;
    });

    while (this.board.length < ROWS) {
      this.board.unshift(Array(COLS).fill(0));
    }

    this.score += linesCleared * 100;
    if (this.onScoreChange) this.onScoreChange(this.score);

    // >>> Trigger haptics + sound for line clear / tetris
    this.onLinesCleared(linesCleared);

    this.notifyScoreChange();
  }

  togglePause() {
    if (this.gameOver) return;

    this.paused = !this.paused;
    this.scoresService.setCurrentScore(this.score);
    this.draw(); // refresh to show "Paused" overlay if needed
  }

  private placePiece() {
    if (!this.currentPiece) return;
    const {shape, x, y, colorIndex} = this.currentPiece;

    shape.forEach((row, dy) => {
      row.forEach((val, dx) => {
        if (val) {
          this.board[y + dy][x + dx] = colorIndex;
        }
      });
    });

    this.clearLines(); // Clear completed lines
    this.spawnPiece(); // Spawn the next piece
    this.dropCounter = 0; // Reset drop timer
  }


  hardDrop() {
    if (!this.currentPiece) return;

    this.currentPiece.y = this.getGhostY();
    this.placePiece();
    this.draw();
  }

  /** Set the base falling speed in milliseconds per grid step */
  public setBaseSpeed(ms: number) {
    this.BASE_DROP_MS = Math.max(ms, this.MIN_DROP_MS);
    this.dropInterval = this.BASE_DROP_MS;
  }

  /** Set current level -> faster fall (optional) */
  public setLevel(level: number) {
    // Example curve: speed up by 8% each level
    const factor = Math.pow(0.92, level);
    this.dropInterval = Math.max(this.BASE_DROP_MS * factor, this.MIN_DROP_MS);
  }

  /** Enable/disable soft drop while a button/gesture is held */
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

  public isGameOver(): boolean {
    return this.gameOver;
  }

  /** Call when the falling piece permanently locks into the board */
  async onPieceLocked() {
    // Haptics & thud
    this.bumpClass(this.gameContainerEl, 'lock-thud', 100);
    this.sound.play('lock');
  }

  /** Call when you’ve computed how many lines were cleared on this lock */
  async onLinesCleared(cleared: number) {
    if (!cleared) return;

    if (cleared < 3) {
      this.sound.play('line');
      this.haptics.selection(); // a tiny click
      this.bumpClass(this.gameContainerEl, 'line-flash', 360);
    } else {
      // Tetris!
      this.sound.play('tetris');
      this.haptics.success();
      this.bumpClass(this.gameContainerEl, 'tetris-burst', 520);
    }

    // Score example (tune to your rules)
    const delta = this.scoreFor(cleared);
    this.onScore?.(delta);
  }

  private scoreFor(cleared: number) {
    switch (cleared) {
      case 1:
        return 40;
      case 2:
        return 100;
      case 3:
        return 300;
      case 4:
        return 1200; // Tetris
      default:
        return 0;
    }
  }

  public bumpClass(el?: HTMLElement, cls?: string, ms = 300) {
    if (!el || !cls) return;
    this.zone.runOutsideAngular(() => {
      el.classList.remove(cls);
      (el as any).offsetWidth;
      // next tick to restart animation
      requestAnimationFrame(() => {
        el.classList.add(cls);
        setTimeout(() => el.classList.remove(cls), ms);
      });
    });
  }

}
