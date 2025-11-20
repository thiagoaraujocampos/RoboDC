import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-config',
  templateUrl: './config.page.html',
  styleUrls: ['./config.page.scss'],
})
export class ConfigPage implements OnInit {
  public robot_api: string = '';
  public robot_ws: string = '';
  public use_virtual_face: boolean = true;

  constructor() {
    this.robot_api =
      localStorage.getItem('robot_api') || 'http://192.168.1.100:5000';

    this.robot_ws =
      localStorage.getItem('robot_ws') || 'ws://192.168.1.100:9090';

    this.use_virtual_face =
      localStorage.getItem('use_virtual_face') === 'false' ? false : true;
  }

  ngOnInit() {}

  save() {
    localStorage.setItem('robot_api', this.robot_api);
    localStorage.setItem('robot_ws', this.robot_ws);
    localStorage.setItem('use_virtual_face', this.use_virtual_face.toString());
  }

  reset() {
    this.robot_api =
      localStorage.getItem('robot_api') || 'http://192.168.1.100:5000';
    this.robot_ws =
      localStorage.getItem('robot_ws') || 'ws://192.168.1.100:9090';
    this.use_virtual_face =
      localStorage.getItem('use_virtual_face') === 'false' ? false : true;
  }
}
