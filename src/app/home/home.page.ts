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

  private gesture!: Gesture;

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
    await this.sounds.preload();
    this.gameService.gameContainerEl = this.gameContainer.nativeElement;

    this.calculateLayout();

    const gameCtx = this.canvasRef.nativeElement.getContext('2d');
    const nextCtx = this.nextCanvasRef?.nativeElement?.getContext('2d');
    if (gameCtx) {
      this.gameService.init(gameCtx, nextCtx || undefined, this.currentCellPx);
    }

    // 1) Load the last in-progress score
    const lastScore = await this.scoresService.getCurrentScore();

    // 2) Try to promote it into Top 10 (only if it qualifies)
    if (lastScore > 0) {
      await this.scoresService.maybePromoteToHighScores(lastScore);
      // 3) Clear the carried-over current score (so we don't insert it twice)
      await this.scoresService.clearCurrentScore();
    }

    // 4) Reset current displayed score to 0 (fresh session)
    this.score = 0;

    this.gameService.onScoreChange = (s) => {
      if (this.score !== s) {
        this.bumpScoreUI();
      }
      this.score = s;
      this.scoresService.setCurrentScore(s); // keep persisting during play
    };

    // Auto-pause when app backgrounds & persist score
    App.addListener('appStateChange', ({isActive}) => {
      if (!isActive) {
        this.isPaused = true;
        if (!this.gameService.isPaused()) this.gameService.togglePause();
        this.scoresService.setCurrentScore(this.gameService.getScore());
      }
    });

    window.addEventListener('beforeunload', () => {
      this.scoresService.setCurrentScore(this.gameService.getScore());
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.scoresService.setCurrentScore(this.gameService.getScore());
    });

    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);

    const TAP_TIME_MS = 200;                // max press time to count as tap
    const TAP_MOVE_PX = 8;                  // max travel to still be a tap
    const LONG_PRESS_MS = 400;              // hold time to trigger hard drop
    const LONG_PRESS_MOVE_CANCEL_PX = 10;   // if moved more than this, cancel long-press

    let startX = 0, lastX = 0, startY = 0, pressStart = 0;
    let accumX = 0;
    let longPressTimer: any = null;
    let longPressed = false;

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
        if ((this.gameService as any).paused || (this.gameService as any).gameOver) return;
        longPressed = true;
        if (this.gameService.hardDrop) this.gameService.hardDrop();
      }, LONG_PRESS_MS);
    };

    const moveOnce = (dir: -1 | 1) => {
      if ((this.gameService as any).paused || (this.gameService as any).gameOver) return;
      this.gameService.handleKey(dir === -1 ? 'ArrowLeft' : 'ArrowRight');
    };

    this.gesture = this.gestureCtrl.create({
      el: this.gestureArea.nativeElement,
      gestureName: 'tetris-gestures',
      direction: 'x',             // horizontal only
      threshold: 0,
      disableScroll: true,
      priority: 9999 as any,
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

        if (Math.hypot(x - startX, y - startY) > LONG_PRESS_MOVE_CANCEL_PX) {
          cancelLongPress();
        }

        const dx = x - lastX;
        lastX = x;
        accumX += dx;

        while (Math.abs(accumX) >= this.currentCellPx) {
          const dir: -1 | 1 = accumX > 0 ? 1 : -1;
          accumX -= dir * this.currentCellPx;
          moveOnce(dir);
        }
      },

      onEnd: (ev: any) => {
        const now = performance.now();
        cancelLongPress();

        if (longPressed) return;

        const currentX = ev.currentX ?? ((startX + (ev.deltaX ?? 0)) || 0);
        const currentY = ev.currentY ?? ((startY + (ev.deltaY ?? 0)) || 0);

        const totalDx = Math.abs(currentX - startX);
        const totalDy = Math.abs(currentY - startY);
        const dt = now - pressStart;

        if (dt <= TAP_TIME_MS && totalDx < TAP_MOVE_PX && totalDy < TAP_MOVE_PX) {
          if (!(this.gameService as any).paused && !(this.gameService as any).gameOver) {
            this.gameService.handleKey('ArrowUp');
          }
        }
      }
    });

    this.gesture.enable(true);

    window.addEventListener('beforeunload', cancelLongPress);

    this.refreshScores();
    this.gameService.onGameOver = () => {
      this.gameStarted = false;
      this.isPaused = true;
      this.gameFinished = true;
      this.refreshScores();
    };

    window.addEventListener('keydown', this.keyHandler);
  }

  ngOnDestroy() {
    this.gesture?.destroy();
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
