import {Injectable} from '@angular/core';
import {Preferences} from '@capacitor/preferences';
import {HIGH_SCORES_KEY, CURRENT_SCORE_KEY, ScoreEntry} from "./storage.service";

@Injectable({
  providedIn: 'root'
})
export class ScoresService {

  constructor() {
  }

  async getHighScores(): Promise<ScoreEntry[]> {
    const result = await Preferences.get({key: HIGH_SCORES_KEY});
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
      await Preferences.set({key: HIGH_SCORES_KEY, value: JSON.stringify(top10)});
    }
  }

  async maybePromoteToHighScores(score: number): Promise<boolean> {
    if (score <= 0) return false;

    const result = await Preferences.get({key: HIGH_SCORES_KEY});
    const scores: ScoreEntry[] = result.value ? JSON.parse(result.value) : [];

    // Does it qualify? (list not full OR better than the current #10)
    const qualifies =
      scores.length < 10 ||
      score > Math.min(...scores.map(s => s.score));

    if (!qualifies) return false;

    scores.push({score, date: new Date().toISOString()});
    // Sort desc, keep top 10
    scores.sort((a, b) => b.score - a.score);
    const top10 = scores.slice(0, 10);

    await Preferences.set({key: HIGH_SCORES_KEY, value: JSON.stringify(top10)});
    return true;
  }

  async clearScores(): Promise<void> {
    await Preferences.remove({key: HIGH_SCORES_KEY});
    await Preferences.remove({key: CURRENT_SCORE_KEY});
  }

  async getCurrentScore(): Promise<number> {
    const res = await Preferences.get({key: CURRENT_SCORE_KEY});
    return res.value ? Number(res.value) : 0;
  }

  async setCurrentScore(score: number): Promise<void> {
    await Preferences.set({key: CURRENT_SCORE_KEY, value: String(score)});
  }

  async clearCurrentScore(): Promise<void> {
    await Preferences.remove({key: CURRENT_SCORE_KEY});
  }
}
