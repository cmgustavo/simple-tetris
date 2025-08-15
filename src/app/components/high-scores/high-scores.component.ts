import {Component, Input} from '@angular/core';
import {ModalController, IonicModule} from '@ionic/angular';
import {CommonModule} from '@angular/common';
import {ScoreEntry} from 'src/app/services/storage.service';

@Component({
  selector: 'app-high-scores',
  templateUrl: './high-scores.component.html',
  styleUrls: ['./high-scores.component.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule],
})
export class HighScoresComponent {
  @Input() scores: ScoreEntry[] = [];

  constructor(private modalCtrl: ModalController) {
  }

  close() {
    this.modalCtrl.dismiss();
  }
}
