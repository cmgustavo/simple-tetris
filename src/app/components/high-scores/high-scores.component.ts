import { Component, Input } from '@angular/core';
import { ModalController, IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { StorageService, ScoreEntry } from 'src/app/services/storage.service';
import { AlertController } from '@ionic/angular';

@Component({
  selector: 'app-high-scores',
  templateUrl: './high-scores.component.html',
  styleUrls: ['./high-scores.component.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule],
})
export class HighScoresComponent {
  @Input() scores: ScoreEntry[] = [];

  constructor(
    private modalCtrl: ModalController,
    private storage: StorageService,
    private alertCtrl: AlertController
  ) {}

  close() {
    this.modalCtrl.dismiss();
  }

  async confirmClear() {
    const alert = await this.alertCtrl.create({
      header: 'Clear High Scores',
      message: 'Are you sure you want to delete all high scores?',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Clear',
          role: 'destructive',
          handler: async () => {
            await this.storage.clearScores();
            this.modalCtrl.dismiss();
            this.scores = [];
          }
        }
      ]
    });

    await alert.present();
  }

}
