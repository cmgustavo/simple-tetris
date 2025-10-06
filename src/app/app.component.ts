import {Component} from '@angular/core';
import {Platform} from '@ionic/angular';
import {IonApp, IonRouterOutlet} from '@ionic/angular/standalone';
import {Capacitor} from '@capacitor/core';
import {StatusBar, Style} from '@capacitor/status-bar';
import {ScreenOrientation} from '@capacitor/screen-orientation';
import {ThemeService} from "./services/theme.service";

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  constructor(
    private platform: Platform,
    private themeService: ThemeService
  ) {
    this.platform.ready().then(() => this.bootstrap());
  }

  private async bootstrap() {
    try {
      if (Capacitor.isNativePlatform()) {
        await ScreenOrientation.lock({ orientation: 'portrait' });
        await StatusBar.setOverlaysWebView({overlay: false});
        await StatusBar.setStyle({style: Style.Light});
      }
      await this.themeService.init();
    } catch (e) {
      console.warn('StatusBar setup failed', e);
    }
  }
}
