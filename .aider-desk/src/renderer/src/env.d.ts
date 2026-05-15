/// <reference types="vite/client" />

import { ApplicationAPI } from '@common/api';

declare global {
  interface Window {
    api: ApplicationAPI;
  }
}

export {};
