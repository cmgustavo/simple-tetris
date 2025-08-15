import {Component, OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {AlertController, IonicModule, ModalController, Platform} from "@ionic/angular";
import {SettingsService, DifficultyOption, ThemeOption} from '../services/settings.service';
import {ScoresService} from '../services/scores.service';
import {AppInfoService} from '../services/app-info.service';
import {HighScoresComponent} from '../components/high-scores/high-scores.component';
import {ScoreEntry} from "../services/storage.service";


@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class SettingsPage implements OnInit {
  theme: ThemeOption = 'system';
  backgrounds = [
    {key: 'mintSky', var0: '#a8ff78', var1: '#78ffd6', var2: '#5ad1ff'},
    {key: 'pastelSun', var0: '#ffd8a8', var1: '#ffc6ff', var2: '#ff8fab'},
    {key: 'ocean', var0: '#89cff0', var1: '#a9def9', var2: '#84dcc6'},
    {key: 'mauve', var0: '#cdb4db', var1: '#ffc8dd', var2: '#ffafcc'},
    {key: 'sage', var0: '#d8e2dc', var1: '#bde0fe', var2: '#a2d2ff'},
    {key: 'citrus', var0: '#ffe066', var1: '#ffd43b', var2: '#ffa94d'},
    {key: 'violet', var0: '#b197fc', var1: '#9775fa', var2: '#845ef7'},
    {key: 'teal', var0: '#96f2d7', var1: '#63e6be', var2: '#38d9a9'},
    {key: 'rose', var0: '#ffd1dc', var1: '#ffcad4', var2: '#f4acb7'},
    {key: 'space', var0: '#3a0ca3', var1: '#4361ee', var2: '#4cc9f0'},
  ];
  selectedBackground = 'mintSky';
  bgAnimated = true;

  difficultyIndex = 1; // 0=Easy, 1=Normal, 2=Hard
  difficultyLabel = 'Normal';

  appVersion = '1.0.0';

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
              private platform: Platform) {
  }

  async ngOnInit() {
    // load persisted values
    this.theme = await this.settings.getTheme();
    this.selectedBackground = await this.settings.getBackgroundKey();
    this.bgAnimated = await this.settings.getBgAnimated();
    const storedDiff = await this.settings.getDifficulty();
    const idx = this.difficultyMap.findIndex(d => d.key === storedDiff.key);
    this.difficultyIndex = idx >= 0 ? idx : 1;
    this.difficultyLabel = this.difficultyMap[this.difficultyIndex].label;

    // version from service (reads environment or package metadata)
    this.appVersion = this.appInfo.getVersion();

    // apply on first load
    this.applyTheme(this.theme);
    this.applyBackground(this.selectedBackground, this.bgAnimated);
  }

  onThemeChange(next: ThemeOption) {
    this.applyTheme(next);
    this.settings.setTheme(next);
  }

  setBackground(key: string) {
    this.selectedBackground = key;
    this.applyBackground(key, this.bgAnimated);
    this.settings.setBackgroundKey(key);
  }

  toggleBgAnimated(on: boolean) {
    this.bgAnimated = on;
    this.applyBackground(this.selectedBackground, on);
    this.settings.setBgAnimated(on);
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
        { text: 'Cancel', role: 'cancel' },
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

  // --- helpers to apply UI changes ---
  private applyTheme(theme: ThemeOption) {
    const body = document.body;
    body.classList.remove('dark');
    if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      body.classList.add('dark');
    }
  }

  private applyBackground(key: string, animate: boolean) {
    const def = this.backgrounds.find(b => b.key === key) ?? this.backgrounds[0];
    const el = document.body; // or a dedicated app wrapper
    el.style.setProperty('--app-bg-0', def.var0);
    el.style.setProperty('--app-bg-1', def.var1);
    el.style.setProperty('--app-bg-2', def.var2);

    el.classList.toggle('bg-animated', !!animate);
  }

}
