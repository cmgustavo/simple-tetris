import {Injectable} from '@angular/core';

export const HIGH_SCORES_KEY = 'highScores';
export const CURRENT_SCORE_KEY = 'currentScore';

export interface ScoreEntry {
  score: number;
  date: string;
}

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  constructor() {
  }
}
