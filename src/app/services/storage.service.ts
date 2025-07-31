import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

const HIGH_SCORES_KEY = 'highScores';

export interface ScoreEntry {
  score: number;
  date: string;
}

@Injectable({
  providedIn: 'root'
})
export class StorageService {

  constructor() { }

  async getHighScores(): Promise<ScoreEntry[]> {
    const result = await Preferences.get({ key: HIGH_SCORES_KEY });
    return result.value ? JSON.parse(result.value) : [];
  }

  async saveHighScore(score: number): Promise<void> {
    const newEntry: ScoreEntry = {
      score,
      date: new Date().toISOString()
    };

    const scores = await this.getHighScores();

    const exists = scores.some(
      (entry) => entry.score === score && entry.date === newEntry.date
    );

    if (!exists) {
      scores.push(newEntry);
      scores.sort((a, b) => b.score - a.score);
      const top10 = scores.slice(0, 10);
      await Preferences.set({ key: HIGH_SCORES_KEY, value: JSON.stringify(top10) });
    }
  }

  async clearScores(): Promise<void> {
    await Preferences.remove({ key: HIGH_SCORES_KEY });
  }

}
