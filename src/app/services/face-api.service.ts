import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { lastValueFrom, timeout } from 'rxjs';
import { TtsService } from './tts.service';

declare var faceapi: any;

export const DETECTION_INTERVAL = 800;

enum EmotionsColors {
  angry = '#FF0000',
  disgusted = '#228B22',
  fearful = '#8A0DE5',
  happy = '#F8E451',
  neutral = '#808080',
  sad = '#1E90FF',
  surprised = '#FF7C2B'
}

@Injectable({
  providedIn: 'root'
})
export class FaceApiService {
  modelLoadError = false;

  currentEyesSide?: string;
  currentDirection?: string;
  currentEmotion = '';
  emotionPorcentage = '';
  expressionColor = EmotionsColors.neutral;
  expressionMsg = 'Sem expressão definida 👻';

  currentAge = '';
  currentGender = '';
  ageAndGenderMsg = '';

  lastSendedExpression?: string;
  lastSendedEyes?: string;

  landmarkIntervals: NodeJS.Timeout[] = [];

  firstDetectionMessageSaid = false;
  firstDetectionMessageTimestamp: number = Date.now() - 60000;

  lastChangeExpressionSended = Date.now() - 60000;

  useVirtualFace = localStorage.getItem('use_virtual_face') === 'false' ? false : true;

  private rosbridgeWs?: WebSocket;
  private rosbridgeConnected = false;
  private reconnectTimeout?: any;

  constructor(private translate: TranslateService, private http: HttpClient, private tts: TtsService) { }

  async loadModels() {
    try {
      const MODEL_URL = '/assets/models';

      console.log('Carregando modelos...');

      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
        faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL)
      ]);

      console.log('Modelos carregados com sucesso');
    } catch (error) {
      this.modelLoadError = true;
      console.error('Erro ao carregar modelos:', error);
    }
  }

  setAgeAndGender(data: any) {
    this.currentGender = data?.gender;

    let msg = '';
    if (this.currentGender) {
      if (data.age <= 4) {
        msg = (this.currentGender === 'male' ? 'um bebê' : 'uma bebê');
      } else if (data.age > 4 && data.age < 12) {
        msg = (this.currentGender === 'male' ? 'um menininho, criança' : 'uma menininha, criança');
      } else if (data.age > 12 && data.age < 18) {
        msg = (this.currentGender === 'male' ? 'um menino' : 'um menina');
      } else if (data.age > 18 && data.age < 30) {
        msg = (this.currentGender === 'male' ? 'um jovem adulto' : 'um jovem adulta');
      } else if (data.age > 30 && data.age < 70) {
        msg = (this.currentGender === 'male' ? 'um adulto' : 'um adulta');
      } else if (data.age > 80) {
        msg = (this.currentGender === 'male' ? 'um senhor' : 'uma senhora');
      }

      msg = `E é ${msg}`;
    }

    this.ageAndGenderMsg = msg;
  }

  setExpression(detection: any) {
    if (detection) {
      let mostProbEmotion = '';
      let mostProbEmotionValue = 0;

      for (const [emotion, value] of Object.entries(detection.expressions)) {
        if (!mostProbEmotion || typeof value === 'number' && value > mostProbEmotionValue) {
          mostProbEmotion = emotion;
          mostProbEmotionValue = value as number;
        }
      }

      if (mostProbEmotionValue > 0.95) {
        this.currentEmotion = mostProbEmotion;
        this.expressionColor = EmotionsColors[mostProbEmotion as keyof typeof EmotionsColors];
        this.emotionPorcentage = (mostProbEmotionValue * 100).toFixed(2) + '%';
      }

      let expressionMsg = 'Sem expressão definida 👻';

      if (this.currentEmotion === 'angry') {
        expressionMsg = (this.currentGender === 'male' ? 'Você está nervoso 😡' : 'Está nervosa 😡');
      } else if (this.currentEmotion === 'disgusted') {
        expressionMsg = 'Você está com nojo 🤮';
      } else if (this.currentEmotion === 'fearful') {
        expressionMsg = 'Você está com medo 😨';
      } else if (this.currentEmotion === 'happy') {
        expressionMsg = 'Você está feliz 😀';
      } else if (this.currentEmotion === 'neutral') {
        expressionMsg = (this.currentGender === 'male' ? 'Você está neutro 😶' : 'Está neutra 😶');
      } else if (this.currentEmotion === 'sad') {
        expressionMsg = 'Você está triste 😞';
      } else if (this.currentEmotion === 'surprised') {
        expressionMsg = (this.currentGender === 'male' ? 'Você está surpreso 😯' : 'Está surpresa 😯');
      }

      if (mostProbEmotionValue <= 0.8 && !expressionMsg.includes('neutro')) {
        if (expressionMsg.includes('está')) {
          expressionMsg = expressionMsg.replace('está', 'está um pouco');
        }
      }

      if (mostProbEmotionValue >= 0.999) {
        if (expressionMsg.includes('está') && !expressionMsg.includes('neutro')) {
          expressionMsg = expressionMsg.replace('está', 'está muito');
        }
      }

      this.expressionMsg = expressionMsg;
    } else {
      this.currentEmotion = '';
      this.emotionPorcentage = '';
    }

    if (Date.now() - this.lastChangeExpressionSended > 300) {
      this.lastChangeExpressionSended = Date.now();
      this.changeRobotFace(this.currentEmotion);
    }
  }

  async onPlay(videoElement: HTMLVideoElement, id?: string) {
    if (this.modelLoadError) {
      console.log('Erro ao carregar modelos, abortando...');
      return;
    }

    setInterval(async () => {
      const detection = await faceapi.detectSingleFace(videoElement, new faceapi.TinyFaceDetectorOptions())
        .withFaceExpressions();

      if (detection && detection.detection) {
        if (!this.firstDetectionMessageSaid && Date.now() - this.firstDetectionMessageTimestamp > 15000) {
          this.firstDetectionMessageSaid = true;
          this.firstDetectionMessageTimestamp = Date.now();

          const randomNumber = Math.floor(Math.random() * 5) + 1;
          this.tts.speak(this.translate.instant(`detector.welcome${randomNumber}`));
        }

        const displaySize = {
          width: videoElement.width || videoElement.videoWidth,
          height: videoElement.height || videoElement.videoHeight
        };

        const x = detection.detection.box.x + detection.detection.box.width / 2;
        const y = detection.detection.box.y + detection.detection.box.height / 2;
        const sectionWidth = displaySize.width / 10;
        const sectionHeight = displaySize.height / 10;

        if (x < sectionWidth) this.currentEyesSide = '82';
        else if (x < sectionWidth * 2) this.currentEyesSide = '74';
        else if (x < sectionWidth * 3) this.currentEyesSide = '66';
        else if (x < sectionWidth * 4 || x < sectionWidth * 6) this.currentEyesSide = undefined;
        else if (x < sectionWidth * 7) this.currentEyesSide = '42';
        else if (x < sectionWidth * 8) this.currentEyesSide = '50';
        else this.currentEyesSide = '58';

        if (y < sectionHeight * 2) {
          if (x < sectionWidth * 2) this.currentDirection = 'NE+';
          else if (x < sectionWidth * 3) this.currentDirection = 'NE';
          else if (x < sectionWidth * 4) this.currentDirection = 'N';
          else if (x < sectionWidth * 6) this.currentDirection = 'N';
          else if (x < sectionWidth * 7) this.currentDirection = 'N';
          else if (x < sectionWidth * 8) this.currentDirection = 'NW';
          else this.currentDirection = 'NW+';
        } else if (y < sectionHeight * 4) {
          if (x < sectionWidth * 2) this.currentDirection = 'E+';
          else if (x < sectionWidth * 3) this.currentDirection = 'E';
          else if (x < sectionWidth * 4) this.currentDirection = 'center';
          else if (x < sectionWidth * 6) this.currentDirection = 'center';
          else if (x < sectionWidth * 7) this.currentDirection = 'W';
          else if (x < sectionWidth * 8) this.currentDirection = 'W';
          else this.currentDirection = 'W+';
        } else if (y < sectionHeight * 6) {
          if (x < sectionWidth * 2) this.currentDirection = 'E+';
          else if (x < sectionWidth * 3) this.currentDirection = 'E';
          else if (x < sectionWidth * 4) this.currentDirection = 'center';
          else if (x < sectionWidth * 6) this.currentDirection = 'center';
          else if (x < sectionWidth * 7) this.currentDirection = 'W';
          else if (x < sectionWidth * 8) this.currentDirection = 'W';
          else this.currentDirection = 'W+';
        } else if (y < sectionHeight * 8) {
          if (x < sectionWidth * 2) this.currentDirection = 'SE+';
          else if (x < sectionWidth * 3) this.currentDirection = 'SE';
          else if (x < sectionWidth * 4) this.currentDirection = 'S';
          else if (x < sectionWidth * 6) this.currentDirection = 'S';
          else if (x < sectionWidth * 7) this.currentDirection = 'S';
          else if (x < sectionWidth * 8) this.currentDirection = 'SW';
          else this.currentDirection = 'SW+';
        } else {
          if (x < sectionWidth * 2) this.currentDirection = 'SE+';
          else if (x < sectionWidth * 3) this.currentDirection = 'SE';
          else if (x < sectionWidth * 4) this.currentDirection = 'S+';
          else if (x < sectionWidth * 6) this.currentDirection = 'S+';
          else if (x < sectionWidth * 7) this.currentDirection = 'S+';
          else if (x < sectionWidth * 8) this.currentDirection = 'SW';
          else this.currentDirection = 'SW+';
        }
      } else {
        this.firstDetectionMessageSaid = false;
      }

      this.setExpression(detection);
    }, DETECTION_INTERVAL);
  }

  async drawLandmarks(videoElement: HTMLVideoElement, canvas: HTMLCanvasElement, id?: string) {
    const displaySize = {
      width: videoElement.width || videoElement.videoWidth,
      height: videoElement.height || videoElement.videoHeight
    };

    faceapi.matchDimensions(canvas, displaySize);

    if (this.modelLoadError) {
      console.log('Erro ao carregar modelos, abortando...');
      return;
    }

    this.landmarkIntervals.push(setInterval(async () => {
      const detection = await faceapi.detectSingleFace(videoElement, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withAgeAndGender();

      const context = canvas.getContext('2d');

      if (context) {
        context.clearRect(0, 0, canvas.width, canvas.height);
      }

      if (detection) {
        this.setAgeAndGender(detection);

        if (displaySize.width === 0 || displaySize.height === 0) {
          console.error('Dimensões do vídeo são inválidas:', displaySize);
          return;
        }

        const resizedDetections = faceapi.resizeResults(detection, displaySize);

        faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);
      } else {
        this.expressionMsg = 'Sem expressão definida 👻';
      }
    }, DETECTION_INTERVAL));
  }

  clearLandmarkIntervals() {
    this.landmarkIntervals.forEach(element => {
      clearInterval(element);
    });
  }

  private connectRosbridge() {
    if (!this.useVirtualFace) return;
    if (this.rosbridgeWs?.readyState === WebSocket.OPEN) return;

    const rosbridgeUrl = localStorage.getItem('robot_ws') || 'ws://localhost:9090';

    try {
      this.rosbridgeWs = new WebSocket(rosbridgeUrl);

      this.rosbridgeWs.onopen = () => {
        this.rosbridgeConnected = true;
        if (this.reconnectTimeout) {
          clearTimeout(this.reconnectTimeout);
          this.reconnectTimeout = undefined;
        }
      };

      this.rosbridgeWs.onclose = () => {
        this.rosbridgeConnected = false;
        if (this.useVirtualFace) {
          this.reconnectTimeout = setTimeout(() => this.connectRosbridge(), 5000);
        }
      };

      this.rosbridgeWs.onerror = () => {
        this.rosbridgeConnected = false;
      };
    } catch (e) {
      this.rosbridgeConnected = false;
    }
  }

  private disconnectRosbridge() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
    }
    if (this.rosbridgeWs) {
      this.rosbridgeWs.close();
      this.rosbridgeWs = undefined;
    }
    this.rosbridgeConnected = false;
  }

  changeRobotFace(expression: string) {
    if (this.useVirtualFace)
    {
      this.changeRobotVirtualFace(expression);
    }
    else
    {
      this.changeRobotLedFace(expression);
    }
  }

  changeRobotLedFace(expression: string) {
    // Uses Esp32 with LED values via API
    if (this.lastSendedExpression === expression) return;

    this.lastSendedExpression = expression;

    let expressionValues = [];

    if (expression === 'angry') {
      expressionValues.push('26');
      expressionValues.push('21');
    }
    else if (expression === 'disgusted') {
      expressionValues.push('26');
      expressionValues.push('37');
    }
    else if (expression === 'fearful') {
      expressionValues.push('34');
      expressionValues.push('21');
    }
    else if (expression === 'happy' || expression === '') {
      expressionValues.push('9');
    }
    else if (expression === 'sad') {
      expressionValues.push('17');
    }
    else if (expression === 'surprised') {
      expressionValues.push('34');
      expressionValues.push('45');
    }
    else {
      if (this.currentEyesSide) expressionValues.push(this.currentEyesSide);
      else expressionValues.push('10');

      expressionValues.push('37');
    }

    const robot_api = localStorage.getItem('robot_api') || 'http://192.168.1.100:5000';

    lastValueFrom(
      this.http.post(`${robot_api}/led/changeExpression`, { expressionValues }).pipe(timeout(1000))
    ).catch(e => console.log('Erro ao enviar expressão para o robô'));
  }

  changeRobotVirtualFace(expression: string) {
    const ROS_TOPIC_NAME = '/robot/face_state';

    const directionMap: { [key: string]: number } = {
      'center': 0,
      'N': 1,
      'NE': 2,
      'E': 3,
      'SE': 4,
      'S': 5,
      'SW': 6,
      'W': 7,
      'NW': 8,
      'N+': 9,
      'NE+': 10,
      'E+': 11,
      'SE+': 12,
      'S+': 13,
      'SW+': 14,
      'W+': 15,
      'NW+': 16
    };

    const expressionsMap: { [key: string]: number } = {
      'neutral': 1,
      'happy': 2,
      'sad': 3,
      'scared': 4,
      'surprised': 5,
      'angry': 6,
      'disgusted': 7,
      'sleepy': 8
    };

    let expValue = expressionsMap['neutral'];

    if (expression === 'angry') {
      expValue = expressionsMap['angry'];
    } else if (expression === 'disgusted') {
      expValue = expressionsMap['disgusted'];
    } else if (expression === 'fearful') {
      expValue = expressionsMap['scared'];
    } else if (expression === 'happy') {
      expValue = expressionsMap['happy'];
    } else if (expression === 'sad') {
      expValue = expressionsMap['sad'];
    } else if (expression === 'surprised') {
      expValue = expressionsMap['surprised'];
    } else if (expression === 'neutral' || expression === '') {
      expValue = expressionsMap['neutral'];
    }

    const dirValue = this.currentDirection ? directionMap[this.currentDirection] || 0 : 0;

    const faceState = {
      talking: false,
      dir: dirValue,
      blink: false,
      exp: expValue,
      color: '#ffffff',
      pauseLook: true,
      pauseBlink: false
    };

    const currentState = JSON.stringify(faceState);
    if (this.lastSendedExpression === currentState) return;

    this.lastSendedExpression = currentState;

    const message = {
      op: 'publish',
      topic: ROS_TOPIC_NAME,
      msg: {
        data: currentState
      }
    };

    if (!this.rosbridgeConnected) {
      this.connectRosbridge();
    }

    if (this.rosbridgeWs?.readyState === WebSocket.OPEN) {
      this.rosbridgeWs.send(JSON.stringify(message));
    }
  }
}
