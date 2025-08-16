import {Component} from '@angular/core';
import {Platform} from '@ionic/angular';
import {IonApp, IonRouterOutlet} from '@ionic/angular/standalone';
import {Capacitor} from '@capacitor/core';
import {StatusBar, Style} from '@capacitor/status-bar';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  constructor(private platform: Platform) {
    this.platform.ready().then(() => this.configureStatusBar());
  }

  private async configureStatusBar() {
    if (!Capacitor.isNativePlatform()) return; // skip on web/ionic serve
    try {
      await StatusBar.setOverlaysWebView({ overlay: false });

      await StatusBar.setStyle({ style: Style.Light }); // white icons
    } catch (e) {
      console.warn('StatusBar setup failed', e);
    }
  }
}
