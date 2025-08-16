import {Injectable} from '@angular/core';
import {Preferences} from '@capacitor/preferences';

export interface DifficultyOption {
  key: 'easy' | 'normal' | 'hard';
  label: string;
  dropMs: number;
}

const KEYS = {
  THEME: 'settings.theme',
  BG_KEY: 'settings.background.key',
  BG_ANIM: 'settings.background.animated',
  DIFF: 'settings.difficulty',
};

@Injectable({
  providedIn: 'root'
})
export class SettingsService {

  constructor() {
  }

  async getBackgroundKey(): Promise<string> {
    const {value} = await Preferences.get({key: KEYS.BG_KEY});
    return value || 'mintSky';
  }

  async setBackgroundKey(key: string) {
    await Preferences.set({key: KEYS.BG_KEY, value: key});
  }

  async getBgAnimated(): Promise<boolean> {
    const {value} = await Preferences.get({key: KEYS.BG_ANIM});
    return value === null ? true : value === 'true';
  }

  async setBgAnimated(v: boolean) {
    await Preferences.set({key: KEYS.BG_ANIM, value: String(v)});
  }

  async getDifficulty(): Promise<DifficultyOption> {
    const {value} = await Preferences.get({key: KEYS.DIFF});
    if (value) return JSON.parse(value) as DifficultyOption;
    return {key: 'normal', label: 'Normal', dropMs: 650};
  }

  async setDifficulty(opt: DifficultyOption) {
    await Preferences.set({key: KEYS.DIFF, value: JSON.stringify(opt)});
  }
}
