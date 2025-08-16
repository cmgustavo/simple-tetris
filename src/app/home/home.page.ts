import {Component, ElementRef, ViewChild, AfterViewInit, OnDestroy} from '@angular/core';
import {GameService} from '../services/game.service';
import { Router } from '@angular/router';
import {IonicModule, GestureController, Gesture, GestureDetail} from '@ionic/angular';
import {CommonModule} from '@angular/common';
import {ScoreEntry} from '../services/storage.service';
import {ScoresService} from '../services/scores.service';
import {ThemeService} from "../services/theme.service";
import {App} from "@capacitor/app";

@Component({
  selector: 'app-home',
  standalone: true,
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [IonicModule, CommonModule],
})
export class HomePage implements AfterViewInit, OnDestroy {
  @ViewChild('nextCanvas', {static: false}) nextCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('gestureArea', {static: true}) gestureArea!: ElementRef<HTMLElement>;
  @ViewChild('gameCanvas', {static: true}) canvasRef!: ElementRef<HTMLCanvasElement>;

  private gesture!: Gesture;
  private lastTapTime = 0;

  public score: number = 0;
  public highScores: ScoreEntry[] = [];
  public isPaused: boolean = true; // game starts in paused state
  public gameStarted = false;
  public gameFinished = false;
  private softDropTimeout: any;
  private isSoftDropping = false;

  constructor(
    private gameService: GameService,
    private gestureCtrl: GestureController,
    private scoresService: ScoresService,
    private router: Router,
    public themeService: ThemeService) {
  }

  async ngAfterViewInit() {
    const canvas = this.canvasRef.nativeElement;
    const screenWidth = window.innerWidth;

    // Set canvas width (e.g., max 300px)
    canvas.width = Math.min(300, screenWidth - 32);

    const gameCtx = this.canvasRef.nativeElement.getContext('2d');
    const nextCtx = this.nextCanvasRef.nativeElement.getContext('2d');
    if (gameCtx) this.gameService.init(gameCtx, nextCtx || undefined);

    // 1) Load the last in-progress score
    const lastScore = await this.scoresService.getCurrentScore();

    // 2) Try to promote it into Top 10 (only if it qualifies)
    if (lastScore > 0) {
      const inserted = await this.scoresService.maybePromoteToHighScores(lastScore);
      // 3) Clear the carried-over current score (so we don't insert it twice)
      await this.scoresService.clearCurrentScore();
    }

    // 4) Reset current displayed score to 0 (fresh session)
    this.score = 0;

    // keep UI synced with game service as you already do
    this.gameService.onScoreChange = (s) => {
      this.score = s;
      this.scoresService.setCurrentScore(s); // keep persisting during play
    };

    // (optional) auto-pause when app backgrounds & persist score
    App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) {
        this.isPaused = true;
        if (!this.gameService.isPaused()) this.gameService.togglePause();
        this.scoresService.setCurrentScore(this.gameService.getScore());
      }
    });

    // (optional) persist on tab close / web
    window.addEventListener('beforeunload', () => {
      this.scoresService.setCurrentScore(this.gameService.getScore());
    });

    // (optional) persist when tab becomes hidden (web)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.scoresService.setCurrentScore(this.gameService.getScore());
    });

    // --- Tunables ---
    const BOARD_COLS = 10;                  // set to your actual board width if different
    const CELL_PX = Math.floor(this.canvasRef.nativeElement.width / BOARD_COLS) || 24;

    const TAP_TIME_MS = 200;                // max press time to count as tap
    const TAP_MOVE_PX = 8;                  // max travel to still be a tap
    const LONG_PRESS_MS = 400;              // hold time to trigger hard drop
    const LONG_PRESS_MOVE_CANCEL_PX = 10;   // if moved more than this, cancel long-press

// --- State ---
    let startX = 0, lastX = 0, startY = 0, pressStart = 0;
    let accumX = 0;
    let longPressTimer: any = null;
    let longPressed = false;

    const cancelLongPress = () => {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    };
    const scheduleLongPress = () => {
      cancelLongPress();
      longPressed = false;
      longPressTimer = setTimeout(() => {
        if ((this.gameService as any).paused || (this.gameService as any).gameOver) return;
        longPressed = true;
        if (this.gameService.hardDrop) this.gameService.hardDrop();
      }, LONG_PRESS_MS);
    };

    const moveOnce = (dir: -1 | 1) => {
      if ((this.gameService as any).paused || (this.gameService as any).gameOver) return;
      // swap to direct methods if you have them: moveLeft()/moveRight()
      this.gameService.handleKey(dir === -1 ? 'ArrowLeft' : 'ArrowRight');
    };

    this.gesture = this.gestureCtrl.create({
      el: this.gestureArea.nativeElement,
      gestureName: 'tetris-gestures',
      direction: 'x',             // horizontal only
      threshold: 0,
      disableScroll: true,
      priority: 9999 as any,      // (Ionic 5) use 'priority'; Ionic 6+ also honors 'gesturePriority'
      gesturePriority: 9999 as any,

      onStart: (ev: any) => {
        pressStart = performance.now();
        startX = lastX = (ev.startX ?? ev.currentX ?? 0);
        startY = (ev.startY ?? ev.currentY ?? 0);
        accumX = 0;
        scheduleLongPress();
      },

      onMove: (ev: any) => {
        const x = (ev.currentX ?? (startX + (ev.deltaX ?? 0))) || 0;
        const y = (ev.currentY ?? (startY + (ev.deltaY ?? 0))) || 0;

        // cancel long-press if the user starts moving too much
        if (Math.hypot(x - startX, y - startY) > LONG_PRESS_MOVE_CANCEL_PX) {
          cancelLongPress();
        }

        // discrete horizontal moves: one step per crossed cell width
        const dx = x - lastX;
        lastX = x;
        accumX += dx;

        while (Math.abs(accumX) >= CELL_PX) {
          const dir: -1 | 1 = accumX > 0 ? 1 : -1;
          accumX -= dir * CELL_PX;
          moveOnce(dir);
        }
      },

      onEnd: (ev: any) => {
        const now = performance.now();
        cancelLongPress();

        // if hard drop already triggered during long press, stop here
        if (longPressed) return;

        const currentX = ev.currentX ?? ((startX + (ev.deltaX ?? 0)) || 0);
        const currentY = ev.currentY ?? ((startY + (ev.deltaY ?? 0)) || 0);

        const totalDx = Math.abs(currentX - startX);
        const totalDy = Math.abs(currentY - startY);
        const dt = now - pressStart;

        // Single tap -> rotate
        if (dt <= TAP_TIME_MS && totalDx < TAP_MOVE_PX && totalDy < TAP_MOVE_PX) {
          if (!(this.gameService as any).paused && !(this.gameService as any).gameOver) {
            // swap to direct method if available: this.gameService.rotate()
            this.gameService.handleKey('ArrowUp');
          }
        }
        // else: drag moves already applied in onMove
      }
    });

    this.gesture.enable(true);

    window.addEventListener('beforeunload', cancelLongPress);

    this.refreshScores();
    this.gameService.onGameOver = () => this.refreshScores();

    // keep keyboard for desktop testing
    const keyHandler = (e: KeyboardEvent) => this.gameService.handleKey(e.key);
    window.addEventListener('keydown', keyHandler);
  }

  ngOnDestroy() {
    this.gesture?.destroy();
    // remove any global listeners you added
    // (wrap the keyHandler above in a property if you want to remove it here)
  }

  async refreshScores() {
    this.highScores = await this.scoresService.getHighScores();
  }

  private keyHandler = (e: KeyboardEvent) => {
    this.gameService.handleKey(e.key);
  };

  pauseOrResume() {
    if (!this.gameFinished) {
      this.gameFinished = this.gameService.isGameOver();
      if (this.gameFinished) {
        this.gameStarted = false;
        this.isPaused = true;
        return;
      }
    }
    this.isPaused = !this.isPaused;
    this.gameService.togglePause();
  }

  newGame() {
    this.isPaused = false;
    this.gameStarted = true;
    this.gameService.newGame();
  }

  async clearScores() {
    await this.scoresService.clearScores();
    this.highScores = [];
  }

  goToSettings() {
    if (!this.isPaused && this.gameStarted) {
      this.pauseOrResume();
    }
    this.router.navigate(['/settings']);
  }

  moveLeft() {
    this.gameService.handleKey('ArrowLeft');
  }

  moveRight() {
    this.gameService.handleKey('ArrowRight');
  }

  rotate() {
    this.gameService.handleKey('ArrowUp');
  }

  softDrop() {
    this.gameService.handleKey('ArrowDown');
  }

  hardDrop() {
    this.gameService.hardDrop();
  }

  onSoftDropPress() {
    this.isSoftDropping = true;

    // Start soft dropping immediately
    this.softDrop();

    // If held for 400ms, convert to hard drop
    this.softDropTimeout = setTimeout(() => {
      if (this.isSoftDropping) {
        this.hardDrop();
      }
    }, 400);
  }

  onSoftDropRelease() {
    this.isSoftDropping = false;
    clearTimeout(this.softDropTimeout);
  }


}
