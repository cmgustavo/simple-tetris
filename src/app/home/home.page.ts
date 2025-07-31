import {Component, ElementRef, ViewChild} from '@angular/core';
import {GameService} from '../services/game.service';
import { IonicModule, ModalController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { HighScoresComponent } from '../components/high-scores/high-scores.component';
import {StorageService, ScoreEntry} from '../services/storage.service';

@Component({
  selector: 'app-home',
  standalone: true,
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [IonicModule, CommonModule],
})
export class HomePage {
  @ViewChild('gameCanvas', { static: false }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('nextCanvas', { static: false }) nextCanvasRef!: ElementRef<HTMLCanvasElement>;

  public score: number = 0;
  public highScores: ScoreEntry[] = [];
  public isPaused: boolean = true; // game starts in paused state

  constructor(
    private gameService: GameService,
    private storage: StorageService,
    private modalCtrl: ModalController) {
  }

  ngAfterViewInit() {
    const canvas = this.canvasRef.nativeElement;
    const screenWidth = window.innerWidth;

    // Set canvas width (e.g., max 300px)
    canvas.width = Math.min(300, screenWidth - 32);

    const gameCtx = this.canvasRef.nativeElement.getContext('2d');
    const nextCtx = this.nextCanvasRef.nativeElement.getContext('2d');
    if (gameCtx) this.gameService.init(gameCtx, nextCtx || undefined);

    this.refreshScores();
    this.gameService.onGameOver = () => this.refreshScores();
    window.addEventListener('keydown', this.keyHandler);
    this.gameService.onScoreChange = (score) => {
      this.score = score;
    };
  }


  ngOnDestroy() {
    window.removeEventListener('keydown', this.keyHandler);
  }

  async refreshScores() {
    this.highScores = await this.storage.getHighScores();
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
    this.gameService.newGame();
  }

  async clearScores() {
    await this.storage.clearScores();
    this.highScores = [];
  }

  async showHighScores() {
    this.pauseOrResume();
    const scores: ScoreEntry[] = await this.storage.getHighScores();

    const modal = await this.modalCtrl.create({
      component: HighScoresComponent,
      componentProps: {
        scores
      }
    });

    await modal.present();
  }


}
