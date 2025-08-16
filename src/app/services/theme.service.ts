import {Injectable} from '@angular/core';
import {Preferences} from '@capacitor/preferences';
import {BehaviorSubject} from 'rxjs';

type ThemeId =
  'aurora-mint' |
  'peachy-sky' |
  'lavender-breeze' |
  'sea-foam' |
  'sunset-sorbet';

export interface ThemeOption {
  id: ThemeId;
  name: string;
  preview: string; // small CSS gradient for list preview (optional)
  className: string; // CSS class applied to home content
}

const STORAGE_KEY = 'app_theme_id';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {

  constructor() {
  }

  // Five pastel gradient themes
  readonly themes: ThemeOption[] = [
    {
      id: 'aurora-mint',
      name: 'Aurora Mint',
      preview: 'linear-gradient(135deg, #B5EAD7 0%, #A3C4F3 100%)',
      className: 'theme-aurora-mint',
    },
    {
      id: 'peachy-sky',
      name: 'Peachy Sky',
      preview: 'linear-gradient(135deg, #FFDAC1 0%, #A3C4F3 100%)',
      className: 'theme-peachy-sky',
    },
    {
      id: 'lavender-breeze',
      name: 'Lavender Breeze',
      preview: 'linear-gradient(135deg, #CBAACB 0%, #B5EAD7 100%)',
      className: 'theme-lavender-breeze',
    },
    {
      id: 'sea-foam',
      name: 'Sea Foam',
      preview: 'linear-gradient(135deg, #E2F0CB 0%, #B5EAD7 100%)',
      className: 'theme-sea-foam',
    },
    {
      id: 'sunset-sorbet',
      name: 'Sunset Sorbet',
      preview: 'linear-gradient(135deg, #FFB3C6 0%, #FFD6A5 100%)',
      className: 'theme-sunset-sorbet',
    },
  ];

  private _currentThemeId$ = new BehaviorSubject<ThemeId>(this.themes[0].id);
  private _themeClass$ = new BehaviorSubject<string>(this.themes[0].className);

  /** Emits the active theme’s CSS class (bind this to ion-content on Home) */
  readonly themeClass$ = this._themeClass$.asObservable();

  /** Emits the active theme id (bind in Settings) */
  readonly themeId$ = this._currentThemeId$.asObservable();

  /** Call once on app start */
  async init() {
    const { value } = await Preferences.get({ key: STORAGE_KEY });

    // choose the first theme as default
    const defaultTheme = this.themes[0];
    const saved = this.themes.find(t => t.id === (value as ThemeId));
    const theme = saved ?? defaultTheme;

    this._currentThemeId$.next(theme.id);
    this._themeClass$.next(theme.className);
    this.applyCssVariables(theme.id);
  }

  /** Set & persist */
  async setTheme(id: ThemeId) {
    const theme = this.themes.find(t => t.id === id);
    if (!theme) return;
    this._currentThemeId$.next(theme.id);
    this._themeClass$.next(theme.className);
    await Preferences.set({ key: STORAGE_KEY, value: id });
    this.applyCssVariables(id);
  }

  /** Expose options to Settings UI */
  getThemeOptions(): ThemeOption[] {
    return this.themes;
  }

  /** Map theme → CSS variable (used only by Home screen) */
  private applyCssVariables(id: ThemeId) {
    const root = document.documentElement;
    // Default fallback
    let gradient = 'none';

    switch (id) {
      case 'aurora-mint':
        gradient = 'linear-gradient(135deg, #B5EAD7 0%, #A3C4F3 100%)';
        break;
      case 'peachy-sky':
        gradient = 'linear-gradient(135deg, #FFDAC1 0%, #A3C4F3 100%)';
        break;
      case 'lavender-breeze':
        gradient = 'linear-gradient(135deg, #CBAACB 0%, #B5EAD7 100%)';
        break;
      case 'sea-foam':
        gradient = 'linear-gradient(135deg, #E2F0CB 0%, #B5EAD7 100%)';
        break;
      case 'sunset-sorbet':
        gradient = 'linear-gradient(135deg, #FFB3C6 0%, #FFD6A5 100%)';
        break;
    }

    // This variable will be read by the Home page only
    root.style.setProperty('--home-gradient', gradient);
  }
}
