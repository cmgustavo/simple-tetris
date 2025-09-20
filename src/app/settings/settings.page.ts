import {Component, OnInit, OnDestroy} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {AlertController, IonicModule, ModalController, Platform} from "@ionic/angular";
import {SettingsService, DifficultyOption} from '../services/settings.service';
import {ScoresService} from '../services/scores.service';
import {AppInfoService} from '../services/app-info.service';
import {HighScoresComponent} from '../components/high-scores/high-scores.component';
import {ScoreEntry} from "../services/storage.service";
import {Subject} from 'rxjs';
import {ThemeService, ThemeOption} from '../services/theme.service';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class SettingsPage implements OnInit, OnDestroy {

  options: ThemeOption[] = this.themeService.getThemeOptions();
  private destroy$ = new Subject<void>();

  onThemeChange(ev: CustomEvent) {
    console.log(ev);
    const id = ev.detail?.value as ReturnType<ThemeService['getThemeOptions']>[number]['id'];
    if (id) this.themeService.setTheme(id);
  }

  selectTheme(id: ThemeOption['id']) {
    // Update immediately when the row is tapped
    this.themeService.setTheme(id);
  }

  difficultyIndex = 1; // 0=Easy, 1=Normal, 2=Hard
  difficultyLabel = 'Normal';

  public appVersion = '';

  private difficultyMap: DifficultyOption[] = [
    {key: 'easy', label: 'Easy', dropMs: 900},
    {key: 'normal', label: 'Normal', dropMs: 650},
    {key: 'hard', label: 'Hard', dropMs: 450},
  ];

  constructor(private settings: SettingsService,
              private scoresService: ScoresService,
              private modalCtrl: ModalController,
              private alertCtrl: AlertController,
              private appInfo: AppInfoService,
              private platform: Platform,
              public themeService: ThemeService
  ) {
  }

  async ngOnInit() {
    this.options = this.themeService.getThemeOptions();

    // load persisted values
    const storedDiff = await this.settings.getDifficulty();
    const idx = this.difficultyMap.findIndex(d => d.key === storedDiff.key);
    this.difficultyIndex = idx >= 0 ? idx : 1;
    this.difficultyLabel = this.difficultyMap[this.difficultyIndex].label;

    // version from service (reads environment or package metadata)
    this.appVersion = this.appInfo.getVersion();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onDifficultyChange(idx: number) {
    this.difficultyIndex = idx;
    const opt = this.difficultyMap[idx] ?? this.difficultyMap[1];
    this.difficultyLabel = opt.label;
    this.settings.setDifficulty(opt);
  }

  async openHighScores() {
    const scores: ScoreEntry[] = await this.scoresService.getHighScores();
    const modal = await this.modalCtrl.create({
      component: HighScoresComponent,
      canDismiss: true,
      breakpoints: [0, 0.5, 0.9],
      initialBreakpoint: this.platform.is('mobile') ? 0.9 : 0.5,
      componentProps: {
        scores
      }
    });
    await modal.present();
  }

  async confirmClearScores() {
    const alert = await this.alertCtrl.create({
      header: 'Clear High Scores',
      message: 'This will permanently delete all stored high scores on this device.',
      buttons: [
        {text: 'Cancel', role: 'cancel'},
        {
          text: 'Delete',
          role: 'destructive',
          handler: async () => {
            await this.scoresService.clearScores();
          },
        },
      ],
    });
    await alert.present();
  }
}
