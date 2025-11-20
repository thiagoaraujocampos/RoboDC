import { HttpClient } from '@angular/common/http';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-controller',
  templateUrl: './controller.page.html',
  styleUrls: ['./controller.page.scss'],
})
export class ControllerPage implements OnInit, OnDestroy {
  public fetchError: boolean = false;

  public socket?: WebSocket = undefined;

  public isConnected: boolean = false;
  public logs: string[] = [];
  public sLinear: number = 0.1;
  public sAngular: number = 0.5;

  public robot_ws: string;
  public useJoystick: boolean = false;
  public joystickActive: boolean = false;
  private lastEmitTime: number = 0;
  private emitThrottle: number = 50;
  public joystickX: number = 0;
  public joystickY: number = 0;

  constructor(private router: Router, private httpClient: HttpClient) {
    this.robot_ws = localStorage.getItem('robot_ws') || 'ws://192.168.1.100:9090';
    this.logs.push(`[${new Date().toISOString()}] Robot WebSocket setted to ${this.robot_ws}`);
  }

  ngOnInit() {
    window.addEventListener('pointermove', this.onGlobalPointerMove.bind(this));
    window.addEventListener('pointerup', this.onGlobalPointerUp.bind(this));
  }

  ngOnDestroy() {
    window.removeEventListener('pointermove', this.onGlobalPointerMove.bind(this));
    window.removeEventListener('pointerup', this.onGlobalPointerUp.bind(this));
  }

  goToHome() {
    this.router.navigate(['/']);
  }

  connect() {
    this.socket = new WebSocket(this.robot_ws);

    this.logs.push(`[${new Date().toISOString()}] Connecting to ` + this.robot_ws);

    this.socket.onopen = () => {
      this.isConnected = true;
      this.logs.push(`[${new Date().toISOString()}] Connected to ` + this.robot_ws);
    }

    this.socket.onerror = () => {
      this.isConnected = false;
      this.logs.push(`[${new Date().toISOString()}] Error connecting to ` + this.robot_ws);
    }

    this.socket.onclose = () => {
      this.isConnected = false;
      this.logs.push(`[${new Date().toISOString()}] Disconnected from ` + this.robot_ws);
    }
  }

  disconnect() {
    this.emitCmdVel(0, 0);
    this.socket?.close();
  }

  emitCmdVel(sLinear: number, sAngular: number) {
    this.logs.push(`[${new Date().toISOString()}] cmd_vel to ${sLinear}, ${sAngular}`);

    this.socket?.send(
      JSON.stringify({
        op: 'publish',
        topic: '/robot/cmd_vel',
        msg: {
          linear: {
            x: sLinear,
            y: 0,
            z: 0
          },
          angular: {
            x: 0,
            y: 0,
            z: sAngular
          }
        }
      })
    )
  }

  increaseLinear() {
    this.sLinear += 0.1;
    this.sLinear = Math.round(this.sLinear * 10) / 10;
    this.logs.push(`[${new Date().toISOString()}] Linear Speed increased to ${this.sLinear}`);
  }

  decreaseLinear() {
    this.sLinear -= 0.1;
    this.sLinear = Math.round(this.sLinear * 10) / 10;
    this.logs.push(`[${new Date().toISOString()}] Linear Speed decreased to ${this.sLinear}`);
  }

  increaseAngular() {
    this.sAngular += 0.1;
    this.sAngular = Math.round( this.sAngular * 10) / 10;
    this.logs.push(`[${new Date().toISOString()}] Angular Speed increased to ${this.sAngular}`);
  }

  decreaseAngular() {
    this.sAngular -= 0.1;
    this.sAngular = Math.round(this.sAngular * 10) / 10;
    this.logs.push(`[${new Date().toISOString()}] Angular Speed decreased to ${this.sAngular}`);
  }

  onJoystickStart(event: PointerEvent) {
    this.joystickActive = true;
    this.updateJoystick(event);
  }

  onJoystickMove(event: PointerEvent) {
    if (!this.joystickActive) return;
    this.updateJoystick(event);
  }

  onJoystickEnd(event?: PointerEvent) {
    this.joystickActive = false;
    this.joystickX = 0;
    this.joystickY = 0;
    this.emitCmdVel(0, 0);
  }

  onGlobalPointerMove(event: PointerEvent) {
    if (!this.joystickActive) return;
    this.updateJoystick(event);
  }

  onGlobalPointerUp(event: PointerEvent) {
    if (!this.joystickActive) return;
    this.onJoystickEnd(event);
  }

  updateJoystick(event: PointerEvent) {
    const now = Date.now();
    if (now - this.lastEmitTime < this.emitThrottle) {
      return;
    }
    this.lastEmitTime = now;

    const joystickContainer = document.querySelector('.joystick-container') as HTMLElement;
    if (!joystickContainer) return;

    const rect = joystickContainer.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const clientX = event.clientX - rect.left;
    const clientY = event.clientY - rect.top;

    const deltaX = clientX - centerX;
    const deltaY = clientY - centerY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const maxDistance = Math.min(centerX, centerY) * 0.8;

    if (distance < 5) {
      this.joystickX = 0;
      this.joystickY = 0;
      this.emitCmdVel(0, 0);
      return;
    }

    const angle = Math.atan2(deltaY, deltaX);

    let visualDistance = distance;
    let controlDistance = distance;

    if (distance > maxDistance) {
      visualDistance = maxDistance;
      controlDistance = maxDistance;
    }

    const normalizedX = (controlDistance / maxDistance) * Math.cos(angle);
    const normalizedY = (controlDistance / maxDistance) * Math.sin(angle);

    this.joystickX = (visualDistance / maxDistance) * maxDistance * Math.cos(angle);
    this.joystickY = (visualDistance / maxDistance) * maxDistance * Math.sin(angle);

    const linear = -normalizedY * this.sLinear;
    const angular = -normalizedX * this.sAngular;

    this.emitCmdVel(Number(linear.toFixed(2)), Number(angular.toFixed(2)));
  }
}
