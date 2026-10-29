import {Component, ElementRef, ViewChild, AfterViewInit, OnDestroy} from '@angular/core';
import {GameService} from '../services/game.service';
import {Router} from '@angular/router';
import {IonicModule, GestureController, Gesture} from '@ionic/angular';
import {CommonModule} from '@angular/common';
import {ScoreEntry} from '../services/storage.service';
import {ScoresService} from '../services/scores.service';
import {ThemeService} from "../services/theme.service";
import {SoundService} from '../services/sound.service';
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
  @ViewChild('gameContainer', {static: true}) gameContainer!: ElementRef<HTMLElement>;

  private gesture?: Gesture;
  private cleanupTouchListeners?: () => void;

  public score: number = 0;
  public scoreBump = false;
  public highScores: ScoreEntry[] = [];
  public isPaused: boolean = true; // game starts in paused state
  public gameStarted = false;
  public gameFinished = false;
  public currentCellPx = 24;
  public containerWidth = 320;
  private softDropTimeout: any;
  private isSoftDropping = false;

  constructor(
    private gameService: GameService,
    private gestureCtrl: GestureController,
    private scoresService: ScoresService,
    private router: Router,
    public themeService: ThemeService,
    private sounds: SoundService) {
  }

  calculateLayout() {
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    // Available width for the 10-column canvas:
    // Screen width minus page padding (32px) and canvas container padding (20px)
    const maxAvailableWidth = Math.min(300, screenWidth - 52);

    // Available height for the 20-row canvas:
    // Screen height minus header (~56px), top-ui-bar (~85px), container padding (20px), button (~50px), and spacing (~25px)
    const maxAvailableHeight = Math.max(200, screenHeight - 240);

    const maxBlockFromWidth = Math.floor(maxAvailableWidth / 10);
    const maxBlockFromHeight = Math.floor(maxAvailableHeight / 20);

    const blockSize = Math.max(14, Math.min(maxBlockFromWidth, maxBlockFromHeight, 30));
    this.currentCellPx = blockSize;
    this.containerWidth = blockSize * 10 + 20;
  }

  private onResize = () => {
    this.calculateLayout();
    this.gameService.resize(this.currentCellPx);
  };

  async ngAfterViewInit() {
    // 1) Synchronously initialize canvas, layout, and touch/keyboard controls first
    // so async storage/sound operations can never delay or block touch input.
    this.gameService.gameContainerEl = this.gameContainer.nativeElement;

    this.calculateLayout();

    const gameCtx = this.canvasRef.nativeElement.getContext('2d');
    const nextCtx = this.nextCanvasRef?.nativeElement?.getContext('2d');
    if (gameCtx) {
      this.gameService.init(gameCtx, nextCtx || undefined, this.currentCellPx);
    }

    this.setupTouchControls();

    this.gameService.onScoreChange = (s) => {
      if (this.score !== s) {
        this.bumpScoreUI();
      }
      this.score = s;
      this.scoresService.setCurrentScore(s);
    };

    this.gameService.onGameOver = () => {
      this.gameStarted = false;
      this.isPaused = true;
      this.gameFinished = true;
      this.refreshScores();
    };

    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
    window.addEventListener('keydown', this.keyHandler);

    window.addEventListener('beforeunload', () => {
      this.scoresService.setCurrentScore(this.gameService.getScore());
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.scoresService.setCurrentScore(this.gameService.getScore());
    });

    App.addListener('appStateChange', ({isActive}) => {
      if (!isActive) {
        this.isPaused = true;
        if (!this.gameService.isPaused()) this.gameService.togglePause();
        this.scoresService.setCurrentScore(this.gameService.getScore());
      }
    });

    // 2) Preload audio and load persisted scores asynchronously
    this.sounds.preload().catch(() => {});

    try {
      const lastScore = await this.scoresService.getCurrentScore();
      if (lastScore > 0) {
        await this.scoresService.maybePromoteToHighScores(lastScore);
        await this.scoresService.clearCurrentScore();
      }
    } catch {}

    this.score = 0;
    await this.refreshScores();
  }

  private isGameActive(): boolean {
    return this.gameStarted && !this.gameService.isPaused() && !this.gameService.isGameOver();
  }

  private setupTouchControls() {
    this.cleanupTouchListeners?.();

    const layoutEl = (this.gestureArea.nativeElement.closest('.game-layout') as HTMLElement) || this.gestureArea.nativeElement;

    const TAP_TIME_MS = 350;                // max press time to count as tap
    const TAP_MOVE_PX = 15;                 // max travel to still be a tap
    const SWIPE_MIN_PX = 12;                // min travel for quick flick/swipe
    const LONG_PRESS_MS = 450;              // hold time to trigger hard drop
    const LONG_PRESS_MOVE_CANCEL_PX = 12;   // if moved more than this, cancel long-press

    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    let pressStart = 0;
    let accumX = 0;
    let accumY = 0;
    let movedHorizontally = false;
    let movedVertically = false;
    let longPressTimer: any = null;
    let longPressed = false;
    let activeTouchId: number | null = null;
    let isMouseDragging = false;
    let lastTouchTimestamp = 0;

    const cancelLongPress = () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    };

    const scheduleLongPress = () => {
      cancelLongPress();
      longPressed = false;
      longPressTimer = setTimeout(() => {
        if (!this.isGameActive() || movedHorizontally || movedVertically) return;
        longPressed = true;
        this.gameService.hardDrop();
      }, LONG_PRESS_MS);
    };

    const isInteractiveTarget = (target: EventTarget | null): boolean => {
      const el = target as HTMLElement | null;
      if (!el || typeof el.closest !== 'function') return false;
      return !!el.closest('ion-button, ion-buttons, button, a, ion-header, ion-toolbar');
    };

    const onGestureStart = (x: number, y: number) => {
      pressStart = performance.now();
      startX = lastX = x;
      startY = lastY = y;
      accumX = 0;
      accumY = 0;
      movedHorizontally = false;
      movedVertically = false;
      scheduleLongPress();
    };

    const onGestureMove = (x: number, y: number) => {
      if (!this.isGameActive()) return;

      const dx = x - lastX;
      const dy = y - lastY;
      lastX = x;
      lastY = y;

      if (Math.hypot(x - startX, y - startY) > LONG_PRESS_MOVE_CANCEL_PX) {
        cancelLongPress();
      }

      accumX += dx;
      accumY += dy;

      const cellPx = Math.max(14, this.currentCellPx || 24);

      // Horizontal discrete steps (1 column per crossed cell width)
      while (Math.abs(accumX) >= cellPx) {
        const dir: -1 | 1 = accumX > 0 ? 1 : -1;
        accumX -= dir * cellPx;
        this.gameService.handleKey(dir === -1 ? 'ArrowLeft' : 'ArrowRight');
        movedHorizontally = true;
        accumY = 0;
        cancelLongPress();
      }

      // Vertical downward drag (soft drop 1 row per cell height)
      if (!movedHorizontally && Math.abs(y - startY) > Math.abs(x - startX)) {
        while (accumY >= cellPx) {
          accumY -= cellPx;
          this.gameService.handleKey('ArrowDown');
          movedVertically = true;
          cancelLongPress();
        }
      }
    };

    const onGestureEnd = (x: number, y: number) => {
      const now = performance.now();
      cancelLongPress();

      if (longPressed || !this.isGameActive()) return;

      const totalDx = x - startX;
      const totalDy = y - startY;
      const absDx = Math.abs(totalDx);
      const absDy = Math.abs(totalDy);
      const dt = now - pressStart;

      if (!movedHorizontally && !movedVertically) {
        if (dt <= TAP_TIME_MS && absDx < TAP_MOVE_PX && absDy < TAP_MOVE_PX) {
          // Single tap -> rotate piece
          this.gameService.handleKey('ArrowUp');
        } else if (absDx >= SWIPE_MIN_PX && absDx >= absDy) {
          // Quick horizontal flick shorter than a full cell -> move 1 column
          this.gameService.handleKey(totalDx > 0 ? 'ArrowRight' : 'ArrowLeft');
        } else if (totalDy <= -SWIPE_MIN_PX && absDy > absDx) {
          // Quick upward swipe -> rotate piece
          this.gameService.handleKey('ArrowUp');
        } else if (totalDy >= SWIPE_MIN_PX && absDy > absDx) {
          // Quick downward swipe -> hard drop on fast flick, otherwise soft drop
          if (totalDy >= 50 && dt < 220) {
            this.gameService.hardDrop();
          } else {
            this.gameService.handleKey('ArrowDown');
          }
        }
      }
    };

    const handleTouchStart = (ev: TouchEvent) => {
      lastTouchTimestamp = Date.now();
      if (isInteractiveTarget(ev.target) || !this.isGameActive()) {
        return;
      }
      if (ev.changedTouches.length === 0) return;

      const touch = ev.changedTouches[0];
      activeTouchId = touch.identifier;

      if (ev.cancelable) {
        ev.preventDefault();
      }

      onGestureStart(touch.clientX, touch.clientY);
    };

    const handleTouchMove = (ev: TouchEvent) => {
      if (activeTouchId === null) return;

      let touch: Touch | null = null;
      for (let i = 0; i < ev.changedTouches.length; i++) {
        if (ev.changedTouches[i].identifier === activeTouchId) {
          touch = ev.changedTouches[i];
          break;
        }
      }
      if (!touch) return;

      if (this.isGameActive() && ev.cancelable) {
        ev.preventDefault();
      }

      onGestureMove(touch.clientX, touch.clientY);
    };

    const handleTouchEnd = (ev: TouchEvent) => {
      if (activeTouchId === null) return;

      let touch: Touch | null = null;
      for (let i = 0; i < ev.changedTouches.length; i++) {
        if (ev.changedTouches[i].identifier === activeTouchId) {
          touch = ev.changedTouches[i];
          break;
        }
      }
      if (!touch) return;

      activeTouchId = null;
      onGestureEnd(touch.clientX, touch.clientY);
    };

    const handleTouchCancel = () => {
      activeTouchId = null;
      cancelLongPress();
    };

    const handleMouseDown = (ev: MouseEvent) => {
      if (Date.now() - lastTouchTimestamp < 1000) return;
      if (ev.button !== 0 || isInteractiveTarget(ev.target) || !this.isGameActive()) return;

      isMouseDragging = true;
      onGestureStart(ev.clientX, ev.clientY);
    };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isMouseDragging) return;
      onGestureMove(ev.clientX, ev.clientY);
    };

    const handleMouseUp = (ev: MouseEvent) => {
      if (!isMouseDragging) return;
      isMouseDragging = false;
      onGestureEnd(ev.clientX, ev.clientY);
    };

    layoutEl.addEventListener('touchstart', handleTouchStart, {passive: false});
    window.addEventListener('touchmove', handleTouchMove, {passive: false});
    window.addEventListener('touchend', handleTouchEnd, {passive: false});
    window.addEventListener('touchcancel', handleTouchCancel, {passive: false});

    layoutEl.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('beforeunload', cancelLongPress);

    this.cleanupTouchListeners = () => {
      cancelLongPress();
      layoutEl.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchCancel);
      layoutEl.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('beforeunload', cancelLongPress);
    };
  }

  ngOnDestroy() {
    this.gesture?.destroy();
    this.cleanupTouchListeners?.();
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('orientationchange', this.onResize);
    window.removeEventListener('keydown', this.keyHandler);
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
    this.gameFinished = false;
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
    this.softDrop();

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

  private bumpScoreUI() {
    this.scoreBump = false;
    setTimeout(() => (this.scoreBump = true));
    setTimeout(() => (this.scoreBump = false), 420);
  }
}
