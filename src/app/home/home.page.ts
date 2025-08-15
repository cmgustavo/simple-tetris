import {Component, ElementRef, ViewChild, AfterViewInit, OnDestroy} from '@angular/core';
import {GameService} from '../services/game.service';
import { Router } from '@angular/router';
import {IonicModule, GestureController, Gesture, GestureDetail} from '@ionic/angular';
import {CommonModule} from '@angular/common';
import {ScoreEntry} from '../services/storage.service';
import {ScoresService} from '../services/scores.service';
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
  private softDropTimeout: any;
  private isSoftDropping = false;

  constructor(
    private gameService: GameService,
    private gestureCtrl: GestureController,
    private scoresService: ScoresService,
    private router: Router) {
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

    // thresholds (tweak to taste)
    const SWIPE_PX = 24;         // min travel to count as swipe
    const TAP_TIME_MS = 220;     // max duration for tap
    const TAP_TRAVEL_PX = 10;    // max movement for tap
    const FLICK_VELOCITY = 0.45; // px/ms for hard-drop flick down

    let startX = 0, startY = 0, startTime = 0;

    this.gesture = this.gestureCtrl.create({
      el: this.gestureArea.nativeElement,
      gestureName: 'tetris-gestures',
      onStart: (ev: GestureDetail) => {
        startX = ev.startX ?? 0;
        startY = ev.startY ?? 0;
        startTime = performance.now();
      },
      onEnd: (ev: GestureDetail) => {
        const currentX = ev.currentX ?? (startX + (ev.deltaX ?? 0));
        const currentY = ev.currentY ?? (startY + (ev.deltaY ?? 0));

        const dx = (ev.deltaX ?? (currentX - startX));
        const dy = (ev.deltaY ?? (currentY - startY));
        const adx = Math.abs(dx);
        const ady = Math.abs(dy);

        const dt = performance.now() - startTime; // ms
        const vx = adx / dt; // px/ms
        const vy = ady / dt;

        // ignore if paused or over (adjust if you want taps to still rotate)
        if ((this.gameService as any).paused || (this.gameService as any).gameOver) return;

        // TAP → rotate (and optional double-tap → hard drop)
        if (dt <= TAP_TIME_MS && adx < TAP_TRAVEL_PX && ady < TAP_TRAVEL_PX) {
          const now = performance.now();
          if (now - this.lastTapTime < 250 && this.gameService.hardDrop) {
            this.gameService.hardDrop(); // double-tap = hard drop
          } else {
            this.gameService.handleKey('ArrowUp'); // rotate
          }
          this.lastTapTime = now;
          return;
        }

        // Dominant axis decides
        if (adx > ady) {
          // horizontal swipe
          if (adx >= SWIPE_PX) {
            if (dx > 0) this.gameService.handleKey('ArrowRight');
            else this.gameService.handleKey('ArrowLeft');
          }
        } else {
          // vertical swipe
          if (ady >= SWIPE_PX) {
            if (dy > 0) {
              // down swipe → soft drop; flick down → hard drop
              if (vy > FLICK_VELOCITY && this.gameService.hardDrop) {
                this.gameService.hardDrop();
              } else {
                this.gameService.handleKey('ArrowDown');
              }
            } else {
              // up swipe → rotate
              this.gameService.handleKey('ArrowUp');
            }
          }
        }
      }
    });

    this.gesture.enable(true);
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
    this.pauseOrResume();
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
