import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withHashLocation, withInMemoryScrolling } from '@angular/router';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';

bootstrapApplication(AppComponent, { providers: [provideZoneChangeDetection(), provideHttpClient(), provideRouter(routes, withHashLocation(), withInMemoryScrolling({ scrollPositionRestoration: 'top' }))] })
  .catch(error => console.error(error));
