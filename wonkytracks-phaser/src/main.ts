import Phaser from 'phaser';
import Game from './game/scenes/Game'; // adjust path if needed

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  parent: 'game-container', // match your index.html div id
  backgroundColor: '#000000',
  scene: [Game]
};

new Phaser.Game(config);
