import { Injectable } from '@angular/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { FaceApiService } from './face-api.service';

@Injectable({
  providedIn: 'root',
})
export class TtsService {
  public tssIsOn: boolean = false;
  public lang: string = 'pt-BR';

  private faceApiService?: FaceApiService;

  constructor() {}

  setFaceApiService(faceApiService: FaceApiService) {
    this.faceApiService = faceApiService;
  }

  async speak(text: string) {
    if (this.tssIsOn) {
      if (this.faceApiService) {
        this.faceApiService.setTalking(true);
      }

      try {
        await TextToSpeech.speak({
          text,
          lang: this.lang,
        });
      } finally {
        if (this.faceApiService) {
          this.faceApiService.setTalking(false);
        }
      }
    }
  }
}
