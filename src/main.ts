import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter, withPreloading, PreloadAllModules } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';

import { addIcons } from 'ionicons';
import {
  chevronBackOutline,
  chevronForwardOutline,
  chevronDownOutline,
  chevronUpOutline,
  refreshOutline,
  arrowDownCircleOutline,
  pauseOutline,
  playOutline,
  reloadOutline,
  settingsOutline,
  closeOutline
} from 'ionicons/icons';

addIcons({
  'chevron-back-outline': chevronBackOutline,
  'chevron-forward-outline': chevronForwardOutline,
  'chevron-down-outline': chevronDownOutline,
  'chevron-up-outline': chevronUpOutline,
  'refresh-outline': refreshOutline,
  'arrow-down-circle-outline': arrowDownCircleOutline,
  'pause-outline': pauseOutline,
  'play-outline': playOutline,
  'reload-outline': reloadOutline,
  'settings-outline': settingsOutline,
  'close-outline': closeOutline
});

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideRouter(routes, withPreloading(PreloadAllModules)),
  ],
});
