import Phaser from 'phaser';

export default class Game extends Phaser.Scene {
  constructor() {
    super({ key: 'Game' });
  }

  preload() {
    // Add your asset loading here later
  }

  create() {
    const width = this.scale.width;
    const height = this.scale.height;
    const centerX = width / 2;
    const centerY = height / 2;

    // Gradient sky background
    const sky = this.add.graphics();
    sky.fillGradientStyle(
      0x7c3aed, // top left
      0x7c3aed, // top right
      0xc084fc, // bottom left
      0xc084fc, // bottom right
      1, 1, 1, 1
    );
    sky.fillRect(0, 0, width, height);

    // Soft purple ground at bottom
    const groundHeight = height * 0.3;
    this.add
      .rectangle(centerX, height, width, groundHeight, 0xd8b4fe)
      .setOrigin(0.5, 1)
      .setAlpha(0.6);

    // WonkyTracks title — big, juicy, shadowed
    const title = this.add
      .text(centerX, height * 0.28, 'WonkyTracks', {
        fontFamily: '"Arial Black", Arial, sans-serif',
        fontSize: '120px',
        color: '#ffffff',
        stroke: '#4c1d95',
        strokeThickness: 16
      })
      .setOrigin(0.5)
      .setResolution(3);

    // Set shadow separately (TS-safe)
    title.setShadow(10, 10, '#1e1b4b', 25, true, true);

    // Mobile-ish smaller title
    if (width < 900) {
      // setFontSize is fine to take a number
      title.setFontSize(80);
    }

    // Subtitle
    this.add
      .text(
        centerX,
        height * 0.45,
        'Merge • Build • Go Absolutely Mental',
        {
          fontSize: '38px',
          color: '#f0e6ff',
          fontFamily: 'Arial'
        }
      )
      .setOrigin(0.5);

    // Pulsing "TAP ANYWHERE" button
    const playText = this.add
      .text(centerX, height * 0.68, 'TAP ANYWHERE TO PLAY', {
        fontSize: '52px',
        color: '#1e1b4b',
        backgroundColor: '#ffffff',
        padding: { left: 50, right: 50, top: 25, bottom: 25 },
        fontFamily: 'Arial Black',
        align: 'center'
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    // Pulsing animation
    this.tweens.add({
      targets: playText,
      scale: 1.1,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Flash transition on tap/click
    this.input.once('pointerdown', () => {
      this.cameras.main.flash(500, 255, 255, 255);

      // For now, just restart this scene so you see the effect
      // Later, swap this to your real gameplay key, e.g. 'GameplayScene'
      this.scene.restart();
      // this.scene.start('GameplayScene');
    });
  }
}
